import { FC, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";

// Aave flash loan fee buffer: 9 bps (0.09%)
// When using Aave with isMax, we need to quote for a reduced amount
// because Split will carve out the fee buffer before the flash loan
const AAVE_FEE_BUFFER_BPS = 9n;
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { BasicCollateral, useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter } from "~~/utils/chainFeatures";
import { FiAlertTriangle, FiInfo } from "react-icons/fi";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";

// Extended type to include price info passed from parent
interface ExtendedCollateral extends BasicCollateral {
    usdValue?: number;
    price?: bigint;
}

interface CollateralSwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    availableAssets: ExtendedCollateral[];
    initialFromTokenAddress?: string;
    chainId: number;
    market?: Address; // For Compound
    position: {
        name: string;
        tokenAddress: string;
        decimals: number;
        balance?: number | bigint;
        type: "borrow" | "supply";
    };
}

export const CollateralSwapModal: FC<CollateralSwapModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    availableAssets,
    initialFromTokenAddress,
    chainId,
    market,
    position,
}) => {
    const { data: oneInchAdapter } = useDeployedContractInfo({ contractName: "OneInchAdapter", chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144 | 9745 });
    // PendleAdapter is only on certain chains - use type assertion since we check for existence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pendleAdapter } = useDeployedContractInfo({ contractName: "PendleAdapter" as any, chainId: chainId as any });
    const { buildCollateralSwapFlow } = useKapanRouterV2();

    // Check swap router availability for this chain
    const oneInchAvailable = is1inchSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const defaultRouter = getDefaultSwapRouter(chainId);

    // Swap router selection (1inch or Pendle) - default based on chain availability
    const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");
    
    // Update swap router if chain changes and current router is not available
    useEffect(() => {
        if (swapRouter === "1inch" && !oneInchAvailable) {
            setSwapRouter(pendleAvailable ? "pendle" : "1inch");
        } else if (swapRouter === "pendle" && !pendleAvailable) {
            setSwapRouter(oneInchAvailable ? "1inch" : "pendle");
        }
    }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            const modalOpenProps = {
                network: "evm",
                protocol: protocolName,
                chainId,
                market: market ?? null,
                positionType: position.type,
                positionToken: position.tokenAddress,
                positionName: position.name,
                initialFromTokenAddress: initialFromTokenAddress ?? null,
            } satisfies Record<string, string | number | boolean | null>;

            track("collateral_swap_modal_open", modalOpenProps);
        }

        wasOpenRef.current = isOpen;
    }, [chainId, initialFromTokenAddress, isOpen, market, position.name, position.tokenAddress, position.type, protocolName]);

    // Fetch Flash Loan Providers using existing hook logic
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: position || { name: "", tokenAddress: "", decimals: 18, type: "borrow" },
    });

    // Filter assets with balance > 0 for "From" selection
    const userAssets = useMemo(() =>
        availableAssets.filter(a => a.rawBalance > 0n) as SwapAsset[],
        [availableAssets]
    );

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(null);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
    const [slippage, setSlippage] = useState<number>(3);
    const [amountIn, setAmountIn] = useState("");
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter "To" assets (exclude selected "From")
    const targetAssets = useMemo(() =>
        availableAssets.filter(a => a.address.toLowerCase() !== selectedFrom?.address.toLowerCase()) as SwapAsset[],
        [availableAssets, selectedFrom]
    );

    // Flash Loan Liquidity Check & Auto-Selection
    const amountInBigInt = useMemo(() => {
        try {
            return selectedFrom && amountIn ? parseUnits(amountIn, selectedFrom.decimals) : 0n;
        } catch {
            return 0n;
        }
    }, [amountIn, selectedFrom]);

    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: selectedFrom?.address,
        amount: amountInBigInt,
        chainId,
    });

    const quoteAmount = useMemo(() => {
        // When isMax=true, use the ACTUAL raw balance from the asset, not parsed amountIn
        // This ensures we match what GetSupplyBalance will return on-chain
        const baseAmount = isMax && selectedFrom?.rawBalance 
            ? selectedFrom.rawBalance 
            : parseUnits(amountIn || "0", selectedFrom?.decimals || 18);
        
        // If using Aave flash loan with isMax, reduce the quote amount by fee buffer
        // This ensures the 1inch swap data matches the actual amount we'll swap
        const isAaveWithMax = isMax && selectedProvider?.providerEnum === FlashLoanProvider.AaveV3;
        if (isAaveWithMax && baseAmount > 0n) {
            // IMPORTANT: Must match on-chain Split rounding exactly!
            // On-chain: feeAmount = (amount * bp + 10000 - 1) / 10000  (rounds UP)
            // On-chain: principal = amount - feeAmount
            // We must use the same formula here to avoid rounding mismatches
            const feeAmount = (baseAmount * AAVE_FEE_BUFFER_BPS + 10000n - 1n) / 10000n;
            const principal = baseAmount - feeAmount;
            
            // Add a tiny safety buffer (0.01%) to ensure quote is always <= on-chain amount
            // This handles any timing differences between UI load and tx execution
            // 1inch will swap whatever we send, and any extra stays as refund
            const safetyBuffer = principal / 10000n; // 0.01%
            const safeQuoteAmount = principal - safetyBuffer;
            
            return safeQuoteAmount.toString();
        }
        
        return baseAmount.toString();
    }, [amountIn, selectedFrom?.decimals, selectedFrom?.rawBalance, isMax, selectedProvider?.providerEnum]);

    // 1inch Quote - uses reduced amount when Aave + isMax
    const { data: oneInchQuote, isLoading: is1inchLoading, error: oneInchError } = use1inchQuote({
        chainId,
        src: selectedFrom?.address as Address,
        dst: selectedTo?.address as Address,
        amount: quoteAmount,
        from: oneInchAdapter?.address || "",
        slippage: slippage,
        enabled: swapRouter === "1inch" && !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!oneInchAdapter,
    });

    // Pendle Quote
    const { data: pendleQuote, isLoading: isPendleLoading, error: pendleError } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedFrom?.address as Address,
        tokensOut: selectedTo?.address as Address,
        amountsIn: quoteAmount,
        slippage: slippage / 100, // Pendle uses decimal slippage (0.03 = 3%)
        enabled: swapRouter === "pendle" && !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!pendleAdapter,
    });

    // Unified quote data
    const isQuoteLoading = swapRouter === "1inch" ? is1inchLoading : isPendleLoading;
    const quoteError = swapRouter === "1inch" ? oneInchError : pendleError;
    
    const amountOut = useMemo(() => {
        if (swapRouter === "1inch" && oneInchQuote) {
            return formatUnits(BigInt(oneInchQuote.dstAmount), selectedTo?.decimals || 18);
        }
        if (swapRouter === "pendle" && pendleQuote) {
            const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
            return formatUnits(BigInt(outAmount), selectedTo?.decimals || 18);
        }
        return "0";
    }, [swapRouter, oneInchQuote, pendleQuote, selectedTo?.decimals]);

    const buildFlow = () => {
        if (!selectedFrom || !selectedTo) return [];
        
        // Get swap data based on selected router
        let swapData: string;
        let minOut: string;
        
        if (swapRouter === "1inch") {
            if (!oneInchQuote || !oneInchAdapter) return [];
            swapData = oneInchQuote.tx.data;
            minOut = "1"; // 1inch handles slippage internally
        } else {
            if (!pendleQuote || !pendleAdapter) return [];
            swapData = pendleQuote.transaction.data;
            minOut = pendleQuote.data.minPtOut || pendleQuote.data.minTokenOut || "1";
        }

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        return buildCollateralSwapFlow(
            protocolName,
            selectedFrom.address,
            selectedTo.address,
            amountIn,
            minOut,
            swapData,
            selectedFrom.decimals,
            market,
            isMax,
            providerEnum,
            false, // isExactOut
            swapRouter === "1inch" ? "oneinch" : "pendle"
        );
    };

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Collateral Swapped successfully!",
        emptyFlowErrorMessage: "Failed to build swap instructions",
        simulateWhenBatching: true,
    });

    const handleSwapWrapper = async () => {
        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            market: market ?? null,
            fromToken: selectedFrom?.address ?? null,
            fromName: selectedFrom?.symbol ?? null,
            toToken: selectedTo?.address ?? null,
            toName: selectedTo?.symbol ?? null,
            amountIn,
            isMax,
            slippage,
            preferBatching,
            flashLoanProvider: selectedProvider?.name ?? null,
            swapRouter,
        } satisfies Record<string, string | number | boolean | null>;

        try {
            setIsSubmitting(true);
            track("collateral_swap_tx_begin", txBeginProps);
            await handleSwap(amountIn, isMax);
            track("collateral_swap_tx_complete", { ...txBeginProps, status: "success" });
        } catch (e) {
            track("collateral_swap_tx_complete", {
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

    const hasQuote = swapRouter === "1inch" ? !!oneInchQuote : !!pendleQuote;
    const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;
    const canSubmit = hasQuote && hasAdapter && parseFloat(amountIn) > 0;

    // Info content for "How it works" tab
    const infoContent = (
        <div className="space-y-4 py-2">
            <div className="alert alert-info bg-info/10 border-info/20 text-sm">
                <FiInfo className="w-5 h-5 flex-shrink-0" />
                <span>
                    <strong>How Collateral Swap Works</strong>
                    <br />
                    This feature allows you to change your collateral asset without closing your debt position.
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
                        <p className="text-xs text-base-content/70">We borrow the new collateral asset via a Flash Loan.</p>
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
                        <p className="text-xs text-base-content/70">
                            We swap your current collateral for the new asset using {swapRouter === "pendle" ? "Pendle" : "1inch"}.
                        </p>
                        <div className="mt-1 text-xs bg-base-200 p-1 rounded inline-block">
                            Router: {swapRouter === "pendle" ? "Pendle" : "1inch"}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">3</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Deposit & Withdraw</h4>
                        <p className="text-xs text-base-content/70">The new asset is deposited as collateral, and your old collateral is withdrawn.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">4</div>
                    </div>
                    <div>
                        <h4 className="font-medium text-sm">Repay Flash Loan</h4>
                        <p className="text-xs text-base-content/70">The withdrawn collateral is used to repay the Flash Loan.</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // Warnings
    const warnings = (
        <>
            {swapRouter === "1inch" && oneInchQuote && oneInchAdapter && oneInchQuote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span className="break-all">Warning: Quote &apos;from&apos; address mismatch!</span>
                </div>
            )}
            {swapRouter === "1inch" && !oneInchAdapter && isOpen && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span>1inch Adapter not found on this network. Try Pendle for PT swaps.</span>
                </div>
            )}
            {swapRouter === "pendle" && !pendleAdapter && isOpen && (
                <div className="alert alert-warning text-xs py-2">
                    <FiAlertTriangle className="w-4 h-4" />
                    <span>Pendle Adapter not found on this network.</span>
                </div>
            )}
        </>
    );

    return (
        <SwapModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Swap Collateral"
            protocolName={protocolName}
            fromAssets={userAssets}
            toAssets={targetAssets}
            initialFromAddress={initialFromTokenAddress}
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
            submitLabel="Swap Collateral"
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Swap From"
            toLabel="Swap To"
            swapRouter={swapRouter}
            setSwapRouter={oneInchAvailable && pendleAvailable ? setSwapRouter : undefined}
        />
    );
};
