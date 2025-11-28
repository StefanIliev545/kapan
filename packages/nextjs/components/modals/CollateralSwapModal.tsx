import { FC, useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount } from "wagmi";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { BasicCollateral } from "~~/hooks/useMovePositionData";

interface CollateralSwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    availableAssets: BasicCollateral[];
    initialFromTokenAddress?: string;
    chainId: number;
    market?: Address; // For Compound
}

export const CollateralSwapModal: FC<CollateralSwapModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    availableAssets,
    initialFromTokenAddress,
    chainId,
    market,
}) => {
    const { data: oneInchAdapter } = useDeployedContractInfo("OneInchAdapter");
    const { buildCollateralSwapFlow } = useKapanRouterV2();

    // Filter assets with balance > 0 for "From" selection
    const userAssets = useMemo(() =>
        availableAssets.filter(a => a.rawBalance > 0n),
        [availableAssets]
    );

    const [selectedFrom, setSelectedFrom] = useState<BasicCollateral | null>(null);
    const [selectedTo, setSelectedTo] = useState<BasicCollateral | null>(null);

    // Initialize selection
    useEffect(() => {
        if (isOpen && !selectedFrom && userAssets.length > 0) {
            if (initialFromTokenAddress) {
                const initial = userAssets.find(a => a.address.toLowerCase() === initialFromTokenAddress.toLowerCase());
                if (initial) {
                    setSelectedFrom(initial);
                    return;
                }
            }
            setSelectedFrom(userAssets[0]);
        }
    }, [isOpen, userAssets, selectedFrom, initialFromTokenAddress]);

    // Filter "To" assets (exclude selected "From")
    const targetAssets = useMemo(() =>
        availableAssets.filter(a => a.address.toLowerCase() !== selectedFrom?.address.toLowerCase()),
        [availableAssets, selectedFrom]
    );

    // Initialize "To" selection
    useEffect(() => {
        if (isOpen && !selectedTo && targetAssets.length > 0) {
            setSelectedTo(targetAssets[0]);
        } else if (selectedTo && selectedFrom && selectedTo.address === selectedFrom.address) {
            // If "To" became invalid (same as "From"), switch to first available
            setSelectedTo(targetAssets[0] || null);
        }
    }, [isOpen, targetAssets, selectedTo, selectedFrom]);

    const [amountIn, setAmountIn] = useState("");
    const [isMax, setIsMax] = useState(false);

    // 1inch Quote
    const { data: quote, isLoading: isQuoteLoading, error: quoteError } = use1inchQuote({
        chainId,
        src: selectedFrom?.address as Address,
        dst: selectedTo?.address as Address,
        amount: parseUnits(amountIn || "0", selectedFrom?.decimals || 18).toString(),
        from: oneInchAdapter?.address,
        slippage: 3, // 3% slippage for safety on fork
        enabled: !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!oneInchAdapter,
        apiKey: process.env.NEXT_PUBLIC_ONE_INCH_API_KEY,
    });

    const amountOut = quote ? formatUnits(BigInt(quote.dstAmount), selectedTo?.decimals || 18) : "0";

    const handleSetMax = () => {
        if (selectedFrom) {
            setAmountIn(formatUnits(selectedFrom.rawBalance, selectedFrom.decimals));
            setIsMax(true);
        }
    };

    const buildFlow = () => {
        if (!quote || !selectedFrom || !selectedTo || !oneInchAdapter) return [];

        // minAmountOut with 3% slippage (matching the quote)
        const minAmountOut = (BigInt(quote.dstAmount) * 97n) / 100n;

        return buildCollateralSwapFlow(
            protocolName,
            selectedFrom.address,
            selectedTo.address,
            amountIn,
            minAmountOut.toString(),
            quote.tx.data,
            selectedFrom.decimals,
            market,
            isMax
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

    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

    return (
        <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
            <div className="modal-box">
                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-xl">Swap Collateral</h3>
                        <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>✕</button>
                    </div>

                    <div className="alert alert-info text-xs shadow-sm">
                        <span>
                            This will Flash Loan your current collateral, swap it to the new asset, deposit it, and then withdraw your old collateral to repay the loan.
                            Your debt position remains open.
                        </span>
                    </div>

                    {/* Input: Swap From */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Swap from (Current Collateral)</span>
                            <span className="label-text-alt">
                                Available: {selectedFrom ? formatUnits(selectedFrom.rawBalance, selectedFrom.decimals) : "0"}
                            </span>
                        </label>
                        <div className="join w-full">
                            <select
                                className="select select-bordered join-item"
                                value={selectedFrom?.symbol || ""}
                                onChange={(e) => {
                                    const token = userAssets.find(t => t.symbol === e.target.value);
                                    if (token) setSelectedFrom(token);
                                }}
                                disabled={userAssets.length === 0}
                            >
                                {userAssets.length === 0 && <option>No collateral found</option>}
                                {userAssets.map(t => (
                                    <option key={t.address} value={t.symbol}>{t.symbol}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                className="input input-bordered join-item w-full"
                                placeholder="0.00"
                                value={amountIn}
                                onChange={(e) => {
                                    setAmountIn(e.target.value);
                                    setIsMax(false);
                                }}
                            />
                            <button className="btn join-item" onClick={handleSetMax}>Max</button>
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                        <span className="text-2xl">↓</span>
                    </div>

                    {/* Output: Swap To */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Swap to (New Collateral)</span>
                        </label>
                        <div className="join w-full">
                            <select
                                className="select select-bordered join-item"
                                value={selectedTo?.symbol || ""}
                                onChange={(e) => {
                                    const token = targetAssets.find(t => t.symbol === e.target.value);
                                    if (token) setSelectedTo(token);
                                }}
                            >
                                {targetAssets.map(t => (
                                    <option key={t.address} value={t.symbol}>{t.symbol}</option>
                                ))}
                            </select>
                            <div className="join-item flex-1 flex items-center px-3 bg-base-200 border border-base-300 font-mono">
                                {isQuoteLoading ? <span className="loading loading-dots loading-xs"></span> : parseFloat(amountOut).toFixed(4)}
                            </div>
                        </div>
                        {quoteError && (
                            <div className="text-error text-xs mt-1">
                                Error fetching quote: {quoteError.message}
                            </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1 flex justify-between">
                            <span>Slippage: 3%</span>
                            <span>Min Output: {quote ? formatUnits((BigInt(quote.dstAmount) * 97n) / 100n, selectedTo?.decimals || 18) : "0"}</span>
                        </div>
                        {quote && oneInchAdapter && quote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                            <div className="text-error text-xs mt-1 font-bold">
                                Warning: Quote 'from' address mismatch!
                                <br />
                                Quote: {quote.tx.from.slice(0, 6)}...
                                <br />
                                Adapter: {oneInchAdapter.address.slice(0, 6)}...
                            </div>
                        )}
                    </div>

                    {/* Action Button */}
                    <button
                        className="btn btn-primary w-full"
                        onClick={handleSwap}
                        disabled={!quote || isQuoteLoading || parseFloat(amountIn) <= 0}
                    >
                        {isQuoteLoading ? "Fetching Quote..." : "Swap Collateral"}
                    </button>

                    {/* Batching Toggle */}
                    <div className="form-control">
                        <label className="label cursor-pointer justify-start gap-2">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={preferBatching}
                                onChange={(e) => setPreferBatching(e.target.checked)}
                            />
                            <span className="label-text text-xs">Batch Transactions</span>
                        </label>
                    </div>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop" onClick={onClose}>
                <button>close</button>
            </form>
        </dialog>
    );
};
