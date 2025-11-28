import { FC, useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount } from "wagmi";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { BasicCollateral } from "~~/hooks/useMovePositionData";
import { FiCheck, FiAlertTriangle, FiArrowDown, FiInfo, FiSettings } from "react-icons/fi";

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

    const [selectedFrom, setSelectedFrom] = useState<ExtendedCollateral | null>(null);
    const [selectedTo, setSelectedTo] = useState<ExtendedCollateral | null>(null);
    const [activeTab, setActiveTab] = useState<"swap" | "info">("swap");
    const [slippage, setSlippage] = useState<number>(3); // Default 3%

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
        slippage: slippage,
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

        // minAmountOut with slippage (matching the quote)
        // Slippage is already applied in quote.dstAmount if we trust 1inch API, 
        // but typically quote returns expected amount. We should calculate minAmountOut manually.
        // 1inch API 'slippage' param is for the tx data generation, but quote.dstAmount is usually the estimated return.
        // Let's apply our local slippage to the estimated return for safety in the contract check.
        const slippageBps = BigInt(Math.round(slippage * 100)); // 1% = 100bps
        const minAmountOut = (BigInt(quote.dstAmount) * (10000n - slippageBps)) / 10000n;

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

    // Helper to calculate USD value
    const getUsdValue = (amount: string, price?: bigint, decimals: number = 18) => {
        if (!amount || !price) return 0;
        const parsed = parseFloat(amount);
        if (isNaN(parsed)) return 0;
        // Price is usually 8 decimals
        return parsed * Number(formatUnits(price, 8));
    };

    const usdValueIn = selectedFrom ? getUsdValue(amountIn, selectedFrom.price, selectedFrom.decimals) : 0;
    const usdValueOut = selectedTo && quote ? getUsdValue(amountOut, selectedTo.price, selectedTo.decimals) : 0;

    return (
        <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
            <div className="modal-box bg-base-100 max-w-2xl p-6 rounded-none flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <h3 className="font-semibold text-lg">Swap Collateral</h3>
                        <div className="tabs tabs-boxed bg-base-200/50 p-1 h-auto">
                            <a
                                className={`tab tab-xs ${activeTab === "swap" ? "tab-active bg-base-100 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("swap")}
                            >
                                Swap
                            </a>
                            <a
                                className={`tab tab-xs ${activeTab === "info" ? "tab-active bg-base-100 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("info")}
                            >
                                Info
                            </a>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
                </div>

                {activeTab === "info" ? (
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
                ) : (
                    <div className="space-y-6">
                        {/* FROM Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-base-content/80">Swap From</span>
                                <span className="text-xs text-base-content/60">
                                    Available: {selectedFrom ? formatUnits(selectedFrom.rawBalance, selectedFrom.decimals) : "0"}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                {selectedFrom && (
                                    <div className="w-8 h-8 relative flex-shrink-0">
                                        <Image src={selectedFrom.icon} alt={selectedFrom.symbol} fill className="rounded-full object-contain" />
                                    </div>
                                )}

                                {/* Token Selector (From) */}
                                <div className="relative min-w-[100px]">
                                    <select
                                        className="select select-ghost select-sm w-full max-w-xs font-medium pl-0 focus:outline-none"
                                        value={selectedFrom?.symbol || ""}
                                        onChange={(e) => {
                                            const token = userAssets.find(t => t.symbol === e.target.value);
                                            if (token) setSelectedFrom(token);
                                        }}
                                    >
                                        {userAssets.map(t => (
                                            <option key={t.address} value={t.symbol}>{t.symbol}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="relative flex-1">
                                    <input
                                        type="number"
                                        value={amountIn}
                                        onChange={(e) => {
                                            setAmountIn(e.target.value);
                                            setIsMax(false);
                                        }}
                                        placeholder="0.00"
                                        className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-16 outline-none font-medium text-right"
                                    />
                                    <button
                                        onClick={handleSetMax}
                                        className="absolute right-0 top-1/2 -translate-y-1/2 text-primary text-xs font-bold hover:text-primary-focus"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <span className="text-xs text-base-content/60">
                                    ≈ ${usdValueIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Arrow Divider */}
                        <div className="flex justify-center -my-2 relative z-10">
                            <div className="bg-base-100 p-2 rounded-full border border-base-300">
                                <FiArrowDown className="w-4 h-4 text-base-content/60" />
                            </div>
                        </div>

                        {/* TO Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-base-content/80">Swap To</span>
                            </div>

                            <div className="flex items-center gap-3">
                                {selectedTo && (
                                    <div className="w-8 h-8 relative flex-shrink-0">
                                        <Image src={selectedTo.icon} alt={selectedTo.symbol} fill className="rounded-full object-contain" />
                                    </div>
                                )}

                                {/* Token Selector (To) */}
                                <div className="relative min-w-[100px]">
                                    <select
                                        className="select select-ghost select-sm w-full max-w-xs font-medium pl-0 focus:outline-none"
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
                                </div>

                                <div className="relative flex-1">
                                    <div className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 outline-none font-medium text-right min-h-[32px] flex items-center justify-end">
                                        {isQuoteLoading ? (
                                            <span className="loading loading-dots loading-xs"></span>
                                        ) : (
                                            parseFloat(amountOut).toFixed(6)
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <span className="text-xs text-base-content/60">
                                    ≈ ${usdValueOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-4 text-center bg-base-200/50 p-3 rounded">
                            <div className="flex flex-col items-center">
                                <div className="text-xs text-base-content/70 flex items-center gap-1">
                                    Slippage
                                    <div className="dropdown dropdown-end dropdown-hover">
                                        <label tabIndex={0} className="cursor-pointer hover:text-primary">
                                            <FiSettings className="w-3 h-3" />
                                        </label>
                                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-32 text-xs">
                                            {[0.1, 0.5, 1, 3].map((s) => (
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
                                <div className="font-medium text-sm">{slippage}%</div>
                            </div>
                            <div>
                                <div className="text-xs text-base-content/70">Min Output</div>
                                <div className="font-medium text-sm">
                                    {quote ? (
                                        <>
                                            {formatUnits((BigInt(quote.dstAmount) * (10000n - BigInt(Math.round(slippage * 100)))) / 10000n, selectedTo?.decimals || 18).slice(0, 8)}
                                            <span className="text-xs text-base-content/60 ml-1">
                                                (${getUsdValue(formatUnits((BigInt(quote.dstAmount) * (10000n - BigInt(Math.round(slippage * 100)))) / 10000n, selectedTo?.decimals || 18), selectedTo?.price, selectedTo?.decimals).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                            </span>
                                        </>
                                    ) : "-"}
                                </div>
                            </div>
                        </div>

                        {/* Warnings/Errors */}
                        {quoteError && (
                            <div className="alert alert-error text-xs py-2">
                                <FiAlertTriangle className="w-4 h-4" />
                                <span>Error fetching quote: {quoteError.message}</span>
                            </div>
                        )}
                        {quote && oneInchAdapter && quote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                            <div className="alert alert-warning text-xs py-2">
                                <FiAlertTriangle className="w-4 h-4" />
                                <span>Warning: Quote 'from' address mismatch!</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2 flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <button
                                    type="button"
                                    onClick={() => setPreferBatching(prev => !prev)}
                                    className={`text-xs inline-flex items-center gap-1 cursor-pointer hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"}`}
                                >
                                    <FiCheck className={`w-4 h-4 ${preferBatching ? "" : "opacity-40"}`} />
                                    Batch transactions
                                </button>
                            </div>

                            <button
                                className="btn btn-primary"
                                onClick={handleSwap}
                                disabled={!quote || isQuoteLoading || parseFloat(amountIn) <= 0}
                            >
                                {isQuoteLoading ? "Fetching Quote..." : "Swap Collateral"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <form method="dialog" className="modal-backdrop" onClick={onClose}>
                <button>close</button>
            </form>
        </dialog>
    );
};

