import { FC, useState, useMemo } from "react";
import { formatUnits, parseUnits, Address } from "viem";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { BasicCollateral, useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { FiAlertTriangle, FiInfo } from "react-icons/fi";
import { SwapModalShell, SwapAsset } from "./SwapModalShell";

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
    const { data: oneInchAdapter } = useDeployedContractInfo("OneInchAdapter");
    const { buildCollateralSwapFlow } = useKapanRouterV2();

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

    const { selectedProvider, setSelectedProvider } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: selectedFrom?.address,
        amount: amountInBigInt,
        chainId,
    });

    // 1inch Quote
    const { data: quote, isLoading: isQuoteLoading, error: quoteError } = use1inchQuote({
        chainId,
        src: selectedFrom?.address as Address,
        dst: selectedTo?.address as Address,
        amount: parseUnits(amountIn || "0", selectedFrom?.decimals || 18).toString(),
        from: oneInchAdapter?.address || "",
        slippage: slippage,
        enabled: !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!oneInchAdapter,
    });

    const amountOut = quote ? formatUnits(BigInt(quote.dstAmount), selectedTo?.decimals || 18) : "0";

    const buildFlow = () => {
        if (!quote || !selectedFrom || !selectedTo || !oneInchAdapter) return [];

        const minAmountOut = 1n;
        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        return buildCollateralSwapFlow(
            protocolName,
            selectedFrom.address,
            selectedTo.address,
            amountIn,
            minAmountOut.toString(),
            quote.tx.data,
            selectedFrom.decimals,
            market,
            isMax,
            providerEnum
        );
    };

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Collateral Swapped successfully!",
        emptyFlowErrorMessage: "Failed to build swap instructions",
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

    const canSubmit = !!quote && parseFloat(amountIn) > 0;

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
                        <p className="text-xs text-base-content/70">We swap your current collateral for the new asset using 1inch.</p>
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
            {quote && oneInchAdapter && quote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
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
        />
    );
};
