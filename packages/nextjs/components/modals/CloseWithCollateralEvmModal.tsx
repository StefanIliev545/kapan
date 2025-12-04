import { FC, useState, useMemo } from "react";
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

// Aave flash loan fee: 5 bps (0.05%)
// We add a small buffer (10 bps total) to ensure swap covers repayment
const AAVE_FLASH_LOAN_FEE_BPS = 10n;

interface CloseWithCollateralEvmModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    chainId: number;
    // Debt token info (preselected "From" - what we're repaying, user inputs amount)
    debtToken: Address;
    debtName: string;
    debtIcon: string;
    debtDecimals: number;
    debtPrice?: bigint; // Price in 8 decimals (e.g., from Chainlink)
    debtBalance: bigint;
    // Available collateral assets for "To" selection (collateral to sell)
    availableCollaterals: SwapAsset[];
    // Optional market (Compound)
    market?: Address;
}

export const CloseWithCollateralEvmModal: FC<CloseWithCollateralEvmModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtToken,
    debtName,
    debtIcon,
    debtPrice,
    debtDecimals,
    debtBalance,
    availableCollaterals,
    market,
}) => {
    const { data: oneInchAdapter } = useDeployedContractInfo({ contractName: "OneInchAdapter", chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144 });
    const { buildCloseWithCollateralFlow } = useKapanRouterV2();

    // Flash Loan Providers
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: { name: debtName, tokenAddress: debtToken, decimals: debtDecimals, type: "borrow" },
    });

    // "From" is fixed (debt to repay) - user inputs how much debt to repay
    const fromAsset: SwapAsset = useMemo(() => ({
        symbol: debtName,
        address: debtToken,
        decimals: debtDecimals,
        rawBalance: debtBalance,
        balance: parseFloat(formatUnits(debtBalance, debtDecimals)),
        icon: debtIcon,
        price: debtPrice,
    }), [debtName, debtToken, debtDecimals, debtBalance, debtIcon, debtPrice]);

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null); // Collateral to sell
    const [slippage, setSlippage] = useState<number>(3);
    const [amountIn, setAmountIn] = useState(""); // Amount of debt to repay
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ensure "From" is always the debt token
    useMemo(() => {
        if (!selectedFrom || selectedFrom.address !== debtToken) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtToken, fromAsset]);

    // Filter "To" assets (collaterals with balance, exclude debt token)
    const toAssets = useMemo(() =>
        (availableCollaterals || []).filter(a => a.rawBalance > 0n && a.address.toLowerCase() !== debtToken.toLowerCase()),
        [availableCollaterals, debtToken]
    );

    // Amount of debt to repay in raw
    const repayAmountRaw = useMemo(() => {
        try {
            return amountIn ? parseUnits(amountIn, debtDecimals) : 0n;
        } catch {
            return 0n;
        }
    }, [amountIn, debtDecimals]);

    // Flash Loan selection - we flash loan the DEBT token to repay, then withdraw collateral
    // and swap it to repay the flash loan
    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: debtToken,      // We flash loan the DEBT token
        amount: repayAmountRaw,       // Amount of debt to flash loan and repay
        chainId,
    });

    // Step 1: Get unit quote (1 collateral -> X debt) to estimate exchange rate
    const unitQuoteAmount = useMemo(() => {
        if (!selectedTo) return "0";
        return parseUnits("1", selectedTo.decimals).toString();
    }, [selectedTo]);

    const { data: unitQuote, isLoading: isUnitQuoteLoading } = use1inchQuoteOnly({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtToken,
        amount: unitQuoteAmount,
        enabled: !!selectedTo && isOpen,
    });

    // Calculate required collateral based on debt to repay
    // We want to sell just enough collateral to get repayAmountRaw of debt token
    // The slippage % from UI is used as buffer for price movement between quote and execution
    const { requiredCollateral, requiredCollateralFormatted, exchangeRate } = useMemo(() => {
        if (!unitQuote || !selectedTo || repayAmountRaw === 0n) {
            return { requiredCollateral: 0n, requiredCollateralFormatted: "0", exchangeRate: "0" };
        }
        const unitOut = BigInt(unitQuote.dstAmount); // 1 collateral -> X debt
        if (unitOut === 0n) {
            return { requiredCollateral: 0n, requiredCollateralFormatted: "0", exchangeRate: "0" };
        }
        
        // Exchange rate: how much debt per 1 collateral
        const rate = formatUnits(unitOut, debtDecimals);
        
        // requiredCollateral = repayAmountRaw * 1_collateral / unitOut
        const unitIn = parseUnits("1", selectedTo.decimals);
        const base = (repayAmountRaw * unitIn) / unitOut;
        
        // Apply slippage buffer from UI (e.g., 3% slippage -> multiply by 1.03)
        // This accounts for price movement between quote fetch and tx execution
        const slippageBps = BigInt(Math.round(slippage * 100)); // 3% -> 300 bps
        const required = (base * (10000n + slippageBps)) / 10000n;
        
        return {
            requiredCollateral: required,
            requiredCollateralFormatted: formatUnits(required, selectedTo.decimals),
            exchangeRate: rate,
        };
    }, [unitQuote, selectedTo, repayAmountRaw, debtDecimals, slippage]);

    // Check if user has enough collateral
    const hasEnoughCollateral = selectedTo ? requiredCollateral <= selectedTo.rawBalance : false;

    // Step 2: Get actual swap quote with the required collateral amount (needs `from` for tx.data)
    const minSwapAmount = selectedTo ? parseUnits("0.0001", selectedTo.decimals) : 0n;
    const swapEnabled = requiredCollateral > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen;

    const { data: swapQuote, isLoading: isSwapQuoteLoading, error: quoteError } = use1inchQuote({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtToken,
        amount: requiredCollateral.toString(),
        from: oneInchAdapter?.address || ("" as Address),
        slippage,
        enabled: swapEnabled,
    });

    const isQuoteLoading = isUnitQuoteLoading || isSwapQuoteLoading;

    // amountOut = required collateral (what user will sell)
    const amountOut = requiredCollateralFormatted;

    const buildFlow = () => {
        if (!swapQuote || !selectedTo || !oneInchAdapter || requiredCollateral === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        // For Aave flash loans, the swap needs to output enough to cover the flash loan repayment
        // (principal + 0.05% fee). We add a buffer to be safe.
        // For Balancer/others (no fee), we just use the exact debt amount.
        const isAave = providerEnum === FlashLoanProvider.AaveV3;
        const swapMinAmountOut = isAave
            ? repayAmountRaw + (repayAmountRaw * AAVE_FLASH_LOAN_FEE_BPS / 10000n)
            : repayAmountRaw;

        // For close with collateral (with flash loan):
        // 1. Flash loan debt token (use GetBorrowBalance if isMax for exact amount)
        // 2. Repay debt (unlocks collateral) - uses Output[0], the actual debt
        // 3. Withdraw collateral
        // 4. Swap collateral to debt token - must output >= flash loan repayment
        // 5. Flash loan repays itself from swap output
        return buildCloseWithCollateralFlow(
            protocolName,
            selectedTo.address,      // collateral to sell
            debtToken,               // debt to repay
            requiredCollateral,      // max collateral to sell (with buffer)
            swapMinAmountOut,        // minAmountOut for swap (includes Aave fee if applicable)
            swapQuote.tx.data,       // swap data
            providerEnum,            // flash loan provider
            market,
            isMax,                   // if true, uses GetBorrowBalance for exact debt amount on-chain
        );
    };

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Position closed successfully!",
        emptyFlowErrorMessage: "Failed to build close instructions",
        simulateWhenBatching: true,
    });

    const handleSwapWrapper = async () => {
        try {
            setIsSubmitting(true);
            await handleSwap(amountIn, isMax);
        } finally {
            setIsSubmitting(false);
        }
    };

    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

    // Can submit if we have a quote and user has enough collateral
    const canSubmit = !!swapQuote && parseFloat(amountIn) > 0 && hasEnoughCollateral;

    // What the swap will actually produce
    const expectedOutput = swapQuote 
        ? formatUnits(BigInt(swapQuote.dstAmount), debtDecimals)
        : "0";
    
    // Is the expected output enough to cover the repay?
    const outputCoversRepay = swapQuote 
        ? BigInt(swapQuote.dstAmount) >= repayAmountRaw
        : false;

    // USD values from 1inch (if available)
    const srcUSD = swapQuote?.srcUSD ? parseFloat(swapQuote.srcUSD) : null;
    const dstUSD = swapQuote?.dstUSD ? parseFloat(swapQuote.dstUSD) : null;
    
    // Price impact from 1inch USD values
    const priceImpact = srcUSD && dstUSD && srcUSD > 0 
        ? ((srcUSD - dstUSD) / srcUSD) * 100 
        : null;

    // Custom stats for close with collateral
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
                    <div className="text-base-content/70">Swap Rate</div>
                    <div className="font-medium">
                        1 {selectedTo?.symbol || "?"} ≈ {parseFloat(exchangeRate).toFixed(2)} {debtName}
                    </div>
                </div>
                <div>
                    <div className="text-base-content/70">Swap Output</div>
                    <div className={`font-medium ${outputCoversRepay ? "text-success" : "text-warning"}`}>
                        {swapQuote ? `${parseFloat(expectedOutput).toFixed(4)} ${debtName}` : "-"}
                    </div>
                </div>
            </div>
            {/* Show USD values from 1inch if available */}
            {srcUSD !== null && dstUSD !== null && (
                <div className="flex justify-between text-xs text-base-content/60 px-1">
                    <span>Selling: ~${srcUSD.toFixed(2)}</span>
                    <span>Receiving: ~${dstUSD.toFixed(2)}</span>
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
                    <strong>How Close with Collateral Works</strong>
                    <br />
                    This feature allows you to repay your debt by selling collateral, closing your position in one transaction.
                </span>
            </div>

            <div className="space-y-4 px-2">
                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">1</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Withdraw Collateral</h4>
                        <p className="text-xs text-base-content/70">Your collateral is withdrawn from the protocol.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">2</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Swap</h4>
                        <p className="text-xs text-base-content/70">Collateral is swapped for the debt token using 1inch.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">3</div>
                    </div>
                    <div>
                        <h4 className="font-medium text-sm">Repay Debt</h4>
                        <p className="text-xs text-base-content/70">Your debt is repaid with the swapped tokens.</p>
                    </div>
                </div>
            </div>

            <div className="text-xs text-base-content/60 mt-4">
                Total debt: {formatUnits(debtBalance, debtDecimals)} {debtName}
            </div>
        </div>
    );

    // Warnings
    const warnings = (
        <>
            {!hasEnoughCollateral && requiredCollateral > 0n && selectedTo && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span>
                        Insufficient collateral. Need ~{requiredCollateralFormatted} {selectedTo.symbol}, 
                        but you only have {formatUnits(selectedTo.rawBalance, selectedTo.decimals)} {selectedTo.symbol}.
                    </span>
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
            title="Close with Collateral"
            protocolName={protocolName}
            fromAssets={[fromAsset]}
            toAssets={toAssets}
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
            submitLabel="Close Position"
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Debt to Repay"
            toLabel="Collateral to Sell"
            fromReadOnly={true}
            customStats={customStats}
        />
    );
};
