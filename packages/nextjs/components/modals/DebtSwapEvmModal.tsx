import { FC, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { FiAlertTriangle, FiInfo, FiSettings } from "react-icons/fi";
import { SwapModalShell, SwapAsset } from "./SwapModalShell";

interface DebtSwapEvmModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    chainId: number;
    // Current debt token info (preselected "From")
    debtFromToken: Address;
    debtFromName: string;
    debtFromIcon: string;
    debtFromDecimals: number;
    debtFromPrice?: bigint; // Price in 8 decimals (e.g., from Chainlink)
    currentDebtBalance: bigint;
    // Available assets for "To" selection
    availableAssets: SwapAsset[];
    // Optional market (Compound)
    market?: Address;
}

export const DebtSwapEvmModal: FC<DebtSwapEvmModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtFromToken,
    debtFromName,
    debtFromIcon,
    debtFromDecimals,
    debtFromPrice,
    currentDebtBalance,
    availableAssets,
    market,
}) => {
    const { data: oneInchAdapter } = useDeployedContractInfo({ contractName: "OneInchAdapter", chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144 });
    const { buildDebtSwapFlow } = useKapanRouterV2();

    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            const modalOpenProps = {
                network: "evm",
                protocol: protocolName,
                chainId,
                market: market ?? null,
                debtFromToken,
                debtFromName,
                availableAssets: availableAssets?.length ?? null,
            } satisfies Record<string, string | number | boolean | null>;

            track("debt_swap_modal_open", modalOpenProps);
        }

        wasOpenRef.current = isOpen;
    }, [availableAssets?.length, chainId, debtFromName, debtFromToken, isOpen, market, protocolName]);

    // Flash Loan Providers
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: { name: debtFromName, tokenAddress: debtFromToken, decimals: debtFromDecimals, type: "borrow" },
    });

    // "From" is fixed (current debt to repay)
    const fromAsset: SwapAsset = useMemo(() => ({
        symbol: debtFromName,
        address: debtFromToken,
        decimals: debtFromDecimals,
        rawBalance: currentDebtBalance,
        balance: parseFloat(formatUnits(currentDebtBalance, debtFromDecimals)),
        icon: debtFromIcon,
        price: debtFromPrice,
    }), [debtFromName, debtFromToken, debtFromDecimals, currentDebtBalance, debtFromIcon, debtFromPrice]);

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
    const [slippage, setSlippage] = useState<number>(1); // Lower default for stablecoin swaps
    const [amountIn, setAmountIn] = useState(""); // Amount of current debt to repay
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ensure "From" is always the debt token
    useMemo(() => {
        if (!selectedFrom || selectedFrom.address !== debtFromToken) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtFromToken, fromAsset]);

    // Filter "To" assets (exclude current debt)
    const toAssets = useMemo(() =>
        (availableAssets || []).filter(a => a.address.toLowerCase() !== debtFromToken.toLowerCase()),
        [availableAssets, debtFromToken]
    );

    // Amount to repay in raw
    const repayAmountRaw = useMemo(() => {
        try {
            return amountIn ? parseUnits(amountIn, debtFromDecimals) : 0n;
        } catch {
            return 0n;
        }
    }, [amountIn, debtFromDecimals]);

    // Step 1: Get unit quote (1 newDebt -> X currentDebt) to estimate exchange rate
    const unitQuoteAmount = useMemo(() => {
        if (!selectedTo) return "0";
        return parseUnits("1", selectedTo.decimals).toString();
    }, [selectedTo]);

    const { data: unitQuote, isLoading: isUnitQuoteLoading } = use1inchQuoteOnly({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtFromToken,
        amount: unitQuoteAmount,
        enabled: !!selectedTo && isOpen,
    });

    // Calculate required newDebt input based on unit quote
    // We want to borrow just enough newDebt to swap and get repayAmountRaw of currentDebt
    // The slippage % from UI is used as buffer for price movement between quote and execution
    const { requiredNewDebt, requiredNewDebtFormatted, exchangeRate } = useMemo(() => {
        if (!unitQuote || !selectedTo || repayAmountRaw === 0n) {
            return { requiredNewDebt: 0n, requiredNewDebtFormatted: "0", exchangeRate: "0" };
        }
        const unitOut = BigInt(unitQuote.dstAmount); // 1 newDebt -> X currentDebt
        if (unitOut === 0n) {
            return { requiredNewDebt: 0n, requiredNewDebtFormatted: "0", exchangeRate: "0" };
        }
        
        // Exchange rate: how much currentDebt per 1 newDebt
        const rate = formatUnits(unitOut, debtFromDecimals);
        
        // requiredNewDebt = repayAmountRaw / rate
        // = repayAmountRaw * 1_newDebt / unitOut
        const unitIn = parseUnits("1", selectedTo.decimals);
        const base = (repayAmountRaw * unitIn) / unitOut;
        
        // Apply slippage buffer from UI (e.g., 1% slippage -> multiply by 1.01)
        // This accounts for price movement between quote fetch and tx execution
        const slippageBps = BigInt(Math.round(slippage * 100)); // 1% -> 100 bps
        const required = (base * (10000n + slippageBps)) / 10000n;
        
        return {
            requiredNewDebt: required,
            requiredNewDebtFormatted: formatUnits(required, selectedTo.decimals),
            exchangeRate: rate,
        };
    }, [unitQuote, selectedTo, repayAmountRaw, debtFromDecimals, slippage]);

    // Flash Loan selection - check liquidity for the NEW debt token we're flash loaning
    // We flash loan `requiredNewDebt` of the new debt token, swap it to current debt, repay, then borrow to cover flash
    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: selectedTo?.address,  // NEW debt token (what we flash loan)
        amount: requiredNewDebt,            // Amount of new debt to flash loan (calculated above)
        chainId,
    });

    // Step 2: Get actual swap quote with the required amount
    const minSwapAmount = selectedTo ? parseUnits("0.001", selectedTo.decimals) : 0n;
    const swapEnabled = requiredNewDebt > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen;
    
    const { data: swapQuote, isLoading: isSwapQuoteLoading, error: quoteError } = use1inchQuote({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtFromToken,
        amount: requiredNewDebt.toString(),
        from: oneInchAdapter?.address || ("" as Address),
        slippage,
        enabled: swapEnabled,
    });

    const isQuoteLoading = isUnitQuoteLoading || isSwapQuoteLoading;

    // What the swap will actually produce (from the real quote)
    const expectedOutput = swapQuote 
        ? formatUnits(BigInt(swapQuote.dstAmount), debtFromDecimals)
        : "0";
    
    // Is the expected output enough to cover the repay?
    const outputCoversRepay = swapQuote 
        ? BigInt(swapQuote.dstAmount) >= repayAmountRaw
        : false;

    // amountOut = required new debt (what user will borrow)
    const amountOut = requiredNewDebtFormatted;

    const buildFlow = () => {
        if (!swapQuote || !selectedTo || !oneInchAdapter || requiredNewDebt === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        return buildDebtSwapFlow(
            protocolName,
            debtFromToken,           // currentDebt (to repay)
            selectedTo.address,      // newDebt (to borrow)
            repayAmountRaw,          // amount of currentDebt to repay
            requiredNewDebt,         // max amount of newDebt to borrow
            swapQuote.tx.data,       // swap data
            providerEnum,
            market,
            isMax,                   // if true, uses GetBorrowBalance for exact debt amount on-chain
        );
    };

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Debt Swapped successfully!",
        emptyFlowErrorMessage: "Failed to build swap instructions",
        simulateWhenBatching: true,
    });

    const handleSwapWrapper = async () => {
        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            market: market ?? null,
            fromToken: debtFromToken,
            fromName: debtFromName,
            toToken: selectedTo?.address ?? null,
            toName: selectedTo?.symbol ?? null,
            amountIn,
            isMax,
            slippage,
            preferBatching,
            flashLoanProvider: selectedProvider?.name ?? null,
        } satisfies Record<string, string | number | boolean | null>;

        try {
            setIsSubmitting(true);
            track("debt_swap_tx_begin", txBeginProps);
            await handleSwap(amountIn, isMax);
            track("debt_swap_tx_complete", { ...txBeginProps, status: "success" });
        } catch (e) {
            track("debt_swap_tx_complete", {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsSubmitting(false);
        }
    };

    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

    const canSubmit = !!swapQuote && parseFloat(amountIn) > 0 && requiredNewDebt > 0n;

    // USD values from 1inch (if available)
    const srcUSD = swapQuote?.srcUSD ? parseFloat(swapQuote.srcUSD) : null;
    const dstUSD = swapQuote?.dstUSD ? parseFloat(swapQuote.dstUSD) : null;
    
    // Price impact from 1inch USD values
    const priceImpact = srcUSD && dstUSD && srcUSD > 0 
        ? ((srcUSD - dstUSD) / srcUSD) * 100 
        : null;

    // Custom stats for debt swap
    const customStats = (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3 text-center bg-base-200/50 p-3 rounded text-xs">
                <div>
                    <div className="text-base-content/70 flex items-center justify-center gap-1">
                        Slippage
                        <div className="dropdown dropdown-top dropdown-hover">
                            <label tabIndex={0} className="cursor-pointer hover:text-primary">
                                <FiSettings className="w-3 h-3" />
                            </label>
                            <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-32 text-xs mb-1">
                                {[0.1, 0.5, 1, 3, 5].map((s) => (
                                    <li key={s}>
                                        <a
                                            className={slippage === s ? "active" : ""}
                                            onClick={() => setSlippage(s)}
                                        >
                                            {s}%
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="font-medium">{slippage}%</div>
                </div>
                <div>
                    <div className="text-base-content/70">Rate</div>
                    <div className="font-medium">
                        1 {selectedTo?.symbol || "?"} ≈ {parseFloat(exchangeRate).toFixed(4)} {debtFromName}
                    </div>
                </div>
                <div>
                    <div className="text-base-content/70">Swap Output</div>
                    <div className={`font-medium ${outputCoversRepay ? "text-success" : "text-warning"}`}>
                        {swapQuote ? `${parseFloat(expectedOutput).toFixed(4)} ${debtFromName}` : "-"}
                    </div>
                </div>
            </div>
            {/* Show USD values from 1inch if available */}
            {srcUSD !== null && dstUSD !== null && (
                <div className="flex justify-between text-xs text-base-content/60 px-1">
                    <span>New debt: ~${srcUSD.toFixed(2)}</span>
                    <span>Repaying: ~${dstUSD.toFixed(2)}</span>
                    {priceImpact !== null && Math.abs(priceImpact) > 0.1 && (
                        <span className={priceImpact > 1 ? "text-warning" : ""}>
                            Impact: {priceImpact > 0 ? "-" : "+"}{Math.abs(priceImpact).toFixed(2)}%
                        </span>
                    )}
                </div>
            )}
        </div>
    );

    // Info content
    const infoContent = (
        <div className="space-y-4 py-2">
            <div className="alert alert-info bg-info/10 border-info/20 text-sm">
                <FiInfo className="w-5 h-5 flex-shrink-0" />
                <span>
                    <strong>How Debt Swap Works</strong>
                    <br />
                    This feature allows you to change your debt asset without closing your collateral position.
                </span>
            </div>

            <div className="space-y-4 px-2">
                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">1</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Flash Loan</h4>
                        <p className="text-xs text-base-content/70">We borrow the new debt asset via a Flash Loan.</p>
                        <div className="mt-1 text-xs bg-base-200 p-1 rounded inline-block">
                            Provider: {selectedProvider?.name || "Auto"}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">2</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Swap</h4>
                        <p className="text-xs text-base-content/70">We swap the new debt token for your current debt token using 1inch.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">3</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Repay Current Debt</h4>
                        <p className="text-xs text-base-content/70">Your current debt is repaid with the swapped tokens.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">4</div>
                    </div>
                    <div>
                        <h4 className="font-medium text-sm">Borrow New Debt</h4>
                        <p className="text-xs text-base-content/70">New debt is borrowed to repay the Flash Loan.</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // Warnings
    const warnings = (
        <>
            {swapQuote && !outputCoversRepay && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span>Swap output ({expectedOutput} {debtFromName}) may not fully cover repay amount. Consider increasing slippage or reducing amount.</span>
                </div>
            )}
            {swapQuote && oneInchAdapter && swapQuote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span className="break-all">Warning: Quote &apos;from&apos; address mismatch!</span>
                </div>
            )}
            {!oneInchAdapter && isOpen && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span>1inch Adapter not found on this network. Swaps unavailable.</span>
                </div>
            )}
        </>
    );

    return (
        <SwapModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Swap Debt"
            protocolName={protocolName}
            fromAssets={[fromAsset]}
            toAssets={toAssets}
            initialFromAddress={debtFromToken}
            selectedFrom={selectedFrom}
            setSelectedFrom={setSelectedFrom}
            selectedTo={selectedTo}
            setSelectedTo={setSelectedTo}
            amountIn={amountIn}
            setAmountIn={setAmountIn}
            isMax={isMax}
            setIsMax={setIsMax}
            amountOut={amountOut}
            isQuoteLoading={isQuoteLoading}
            quoteError={quoteError}
            slippage={slippage}
            setSlippage={setSlippage}
            flashLoanProviders={flashLoanProviders}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            flashLoanLiquidityData={liquidityData}
            preferBatching={preferBatching}
            setPreferBatching={setPreferBatching}
            onSubmit={handleSwapWrapper}
            isSubmitting={isSubmitting}
            canSubmit={canSubmit}
            submitLabel="Swap Debt"
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Repay Debt"
            toLabel="New Debt"
            fromReadOnly={true}
            customStats={customStats}
        />
    );
};
