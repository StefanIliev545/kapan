import { FC, useState, useMemo, useEffect, ReactNode } from "react";
import Image from "next/image";
import { formatUnits, parseUnits, Address } from "viem";
import { FiCheck, FiAlertTriangle, FiArrowDown, FiInfo, FiSettings } from "react-icons/fi";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { FlashLoanProviderOption } from "~~/hooks/useMovePositionData";

// Shared asset type
export interface SwapAsset {
    symbol: string;
    address: Address;
    decimals: number;
    rawBalance: bigint;
    balance: number;
    icon: string;
    usdValue?: number;
    price?: bigint;
}

export interface SwapModalShellProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    protocolName: string;

    // Assets
    fromAssets: SwapAsset[]; // Assets with balance > 0 for "From" selection
    toAssets: SwapAsset[];   // Assets for "To" selection (excluding selected "From")
    initialFromAddress?: string;

    // Selection state (controlled from parent)
    selectedFrom: SwapAsset | null;
    setSelectedFrom: (a: SwapAsset | null) => void;
    selectedTo: SwapAsset | null;
    setSelectedTo: (a: SwapAsset | null) => void;

    // Amount state
    amountIn: string;
    setAmountIn: (v: string) => void;
    isMax: boolean;
    setIsMax: (v: boolean) => void;
    amountOut: string; // Computed output (from quote)
    isQuoteLoading: boolean;
    quoteError?: Error | null;

    // Slippage
    slippage: number;
    setSlippage: (v: number) => void;

    // Flash Loan Providers (optional)
    flashLoanProviders?: FlashLoanProviderOption[];
    selectedProvider?: FlashLoanProviderOption | null;
    setSelectedProvider?: (p: FlashLoanProviderOption) => void;
    // Flash loan liquidity data (optional, for showing availability)
    flashLoanLiquidityData?: Array<{ provider: number; liquidity: bigint; hasLiquidity: boolean }>;

    // Batching preference (optional)
    preferBatching?: boolean;
    setPreferBatching?: (fn: (prev: boolean) => boolean) => void;

    // Action
    onSubmit: () => void;
    isSubmitting: boolean;
    canSubmit: boolean;
    submitLabel: string;

    // Info tab content (optional, for "How it works")
    infoContent?: ReactNode;

    // Warnings (optional)
    warnings?: ReactNode;

    // From section label override
    fromLabel?: string;
    toLabel?: string;

    // If true, "From" is read-only (no selector, just display)
    fromReadOnly?: boolean;
    // If true, "To" is read-only (no selector, just display)
    toReadOnly?: boolean;
    
    // Custom stats section (replaces default slippage/min output)
    customStats?: ReactNode;
    // Hide the default stats grid
    hideDefaultStats?: boolean;
}

export const SwapModalShell: FC<SwapModalShellProps> = ({
    isOpen,
    onClose,
    title,
    protocolName,
    fromAssets,
    toAssets,
    initialFromAddress,
    selectedFrom,
    setSelectedFrom,
    selectedTo,
    setSelectedTo,
    amountIn,
    setAmountIn,
    isMax,
    setIsMax,
    amountOut,
    isQuoteLoading,
    quoteError,
    slippage,
    setSlippage,
    flashLoanProviders,
    selectedProvider,
    setSelectedProvider,
    flashLoanLiquidityData,
    preferBatching,
    setPreferBatching,
    onSubmit,
    isSubmitting,
    canSubmit,
    submitLabel,
    infoContent,
    warnings,
    fromLabel = "Swap From",
    toLabel = "Swap To",
    fromReadOnly = false,
    toReadOnly = false,
    customStats,
    hideDefaultStats = false,
}) => {
    const [activeTab, setActiveTab] = useState<"swap" | "info">("swap");

    // Initialize "From" selection
    useEffect(() => {
        if (isOpen && !selectedFrom && fromAssets.length > 0) {
            if (initialFromAddress) {
                const initial = fromAssets.find(a => a.address.toLowerCase() === initialFromAddress.toLowerCase());
                if (initial) {
                    setSelectedFrom(initial);
                    return;
                }
            }
            setSelectedFrom(fromAssets[0]);
        }
    }, [isOpen, fromAssets, selectedFrom, initialFromAddress, setSelectedFrom]);

    // Initialize "To" selection
    useEffect(() => {
        if (isOpen && !selectedTo && toAssets.length > 0) {
            setSelectedTo(toAssets[0]);
        } else if (selectedTo && selectedFrom && selectedTo.address === selectedFrom.address) {
            setSelectedTo(toAssets[0] || null);
        }
    }, [isOpen, toAssets, selectedTo, selectedFrom, setSelectedTo]);

    const handleSetMax = () => {
        if (selectedFrom) {
            setAmountIn(formatUnits(selectedFrom.rawBalance, selectedFrom.decimals));
            setIsMax(true);
        }
    };

    // Helper to calculate USD value
    const getUsdValue = (amount: string, price?: bigint) => {
        if (!amount || !price) return 0;
        const parsed = parseFloat(amount);
        if (isNaN(parsed)) return 0;
        return parsed * Number(formatUnits(price, 8));
    };

    const usdValueIn = selectedFrom ? getUsdValue(amountIn, selectedFrom.price) : 0;
    const usdValueOut = selectedTo ? getUsdValue(amountOut, selectedTo.price) : 0;

    const minOutput = useMemo(() => {
        if (!amountOut || parseFloat(amountOut) === 0) return null;
        try {
            const outRaw = parseUnits(amountOut, selectedTo?.decimals || 18);
            const minRaw = (outRaw * (10000n - BigInt(Math.round(slippage * 100)))) / 10000n;
            return formatUnits(minRaw, selectedTo?.decimals || 18);
        } catch {
            return null;
        }
    }, [amountOut, slippage, selectedTo?.decimals]);

    return (
        <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
            <div className="modal-box bg-base-100 max-w-2xl p-6 rounded-none flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <h3 className="font-semibold text-lg">{title}</h3>
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
                        {infoContent || (
                            <div className="alert alert-info bg-info/10 border-info/20 text-sm">
                                <FiInfo className="w-5 h-5 flex-shrink-0" />
                                <span>
                                    <strong>How {title} Works</strong>
                                    <br />
                                    This feature uses flash loans and 1inch swaps to atomically change your position.
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Flash Loan Provider Selector */}
                        {flashLoanProviders && flashLoanProviders.length > 1 && setSelectedProvider && (
                            <div className="flex justify-end mb-[-10px]">
                                <select
                                    className="select select-xs select-ghost font-normal text-base-content/60"
                                    value={selectedProvider?.name || ""}
                                    onChange={(e) => {
                                        const p = flashLoanProviders.find(p => p.name === e.target.value);
                                        if (p) setSelectedProvider(p);
                                    }}
                                >
                                    {flashLoanProviders.map(p => {
                                        const liq = flashLoanLiquidityData?.find(l => l.provider === p.providerEnum);
                                        // Show indicator but don't disable - liquidity check may be inaccurate
                                        const hasLiquidity = liq?.hasLiquidity ?? true; // Default to true if no data
                                        return (
                                            <option key={p.name} value={p.name}>
                                                Flash Loan: {p.name} {liq ? (hasLiquidity ? "✓" : "⚠️") : ""}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}

                        {/* FROM Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-base-content/80">{fromLabel}</span>
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
                                {fromReadOnly ? (
                                    <div className="font-medium">{selectedFrom?.symbol || "-"}</div>
                                ) : (
                                    <div className="relative min-w-[100px]">
                                        <select
                                            className="select select-ghost select-sm w-full max-w-xs font-medium pl-0 focus:outline-none"
                                            value={selectedFrom?.symbol || ""}
                                            onChange={(e) => {
                                                const token = fromAssets.find(t => t.symbol === e.target.value);
                                                if (token) setSelectedFrom(token);
                                            }}
                                        >
                                            {fromAssets.map(t => (
                                                <option key={t.address} value={t.symbol}>{t.symbol}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

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
                                <span className="text-sm text-base-content/80">{toLabel}</span>
                            </div>

                            <div className="flex items-center gap-3">
                                {selectedTo && (
                                    <div className="w-8 h-8 relative flex-shrink-0">
                                        <Image src={selectedTo.icon} alt={selectedTo.symbol} fill className="rounded-full object-contain" />
                                    </div>
                                )}

                                {/* Token Selector (To) */}
                                {toReadOnly ? (
                                    <div className="font-medium">{selectedTo?.symbol || "-"}</div>
                                ) : (
                                    <div className="relative min-w-[100px]">
                                        <select
                                            className="select select-ghost select-sm w-full max-w-xs font-medium pl-0 focus:outline-none"
                                            value={selectedTo?.symbol || ""}
                                            onChange={(e) => {
                                                const token = toAssets.find(t => t.symbol === e.target.value);
                                                if (token) setSelectedTo(token);
                                            }}
                                        >
                                            {toAssets.map(t => (
                                                <option key={t.address} value={t.symbol}>{t.symbol}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="relative flex-1">
                                    <div className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 outline-none font-medium text-right min-h-[32px] flex items-center justify-end">
                                        {isQuoteLoading ? (
                                            <span className="loading loading-dots loading-xs"></span>
                                        ) : (
                                            parseFloat(amountOut || "0").toFixed(6)
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
                        {customStats ? customStats : !hideDefaultStats && (
                        <div className="grid grid-cols-2 gap-4 text-center bg-base-200/50 p-3 rounded">
                            <div className="flex flex-col items-center">
                                <div className="text-xs text-base-content/70 flex items-center gap-1">
                                    Slippage
                                    <div className="dropdown dropdown-top dropdown-hover">
                                        <label tabIndex={0} className="cursor-pointer hover:text-primary">
                                            <FiSettings className="w-3 h-3" />
                                        </label>
                                        <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-32 text-xs mb-1">
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
                                    {minOutput ? (
                                        <>
                                            {parseFloat(minOutput).toFixed(6)}
                                            <span className="text-xs text-base-content/60 ml-1">
                                                (${getUsdValue(minOutput, selectedTo?.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                            </span>
                                        </>
                                    ) : "-"}
                                </div>
                            </div>
                        </div>
                        )}

                        {/* Warnings/Errors */}
                        {quoteError && (
                            <div className="alert alert-error text-xs py-2">
                                <FiAlertTriangle className="w-4 h-4" />
                                <span className="break-all">Error fetching quote: {quoteError.message}</span>
                            </div>
                        )}
                        {warnings}

                        {/* Actions */}
                        <div className="pt-2 flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                {setPreferBatching && (
                                    <button
                                        type="button"
                                        onClick={() => setPreferBatching(prev => !prev)}
                                        className={`text-xs inline-flex items-center gap-1 cursor-pointer hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"}`}
                                    >
                                        <FiCheck className={`w-4 h-4 ${preferBatching ? "" : "opacity-40"}`} />
                                        Batch transactions
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 ml-4">
                                <SegmentedActionBar
                                    className="w-full"
                                    autoCompact
                                    actions={[
                                        {
                                            key: "swap",
                                            label: isSubmitting ? "Processing..." : isQuoteLoading ? "Fetching Quote..." : submitLabel,
                                            icon: isSubmitting ? <span className="loading loading-spinner loading-xs" /> : undefined,
                                            onClick: onSubmit,
                                            disabled: !canSubmit || isQuoteLoading || isSubmitting,
                                            variant: "ghost",
                                        },
                                    ]}
                                />
                            </div>
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

