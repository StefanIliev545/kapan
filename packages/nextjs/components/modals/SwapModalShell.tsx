import { FC, useState, useMemo, useEffect, ReactNode } from "react";
import Image from "next/image";
import { formatUnits, Address } from "viem";
import { CheckIcon, ExclamationTriangleIcon, ArrowDownIcon, InformationCircleIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { ErrorDisplay } from "../common/ErrorDisplay";
import { ButtonLoading } from "../common/Loading";
import { FlashLoanProviderOption } from "~~/hooks/useMovePositionData";
import { SLIPPAGE_OPTIONS } from "~~/hooks/useAutoSlippage";
import { getPriceImpactSeverity, getPriceImpactColorClass, formatPriceImpact } from "~~/utils/slippage";
import { parseAmount } from "~~/utils/validation";

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

// Swap router options
export type SwapRouter = "1inch" | "pendle";

export const SWAP_ROUTER_OPTIONS: { value: SwapRouter; label: string }[] = [
    { value: "1inch", label: "1inch" },
    { value: "pendle", label: "Pendle" },
];

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

    // Swap router selection (optional - for choosing between 1inch/Pendle)
    swapRouter?: SwapRouter;
    setSwapRouter?: (router: SwapRouter) => void;

    // Price impact (optional - for display in default stats)
    priceImpact?: number | null;
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
    swapRouter,
    setSwapRouter,
    priceImpact,
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
        const decimals = selectedTo?.decimals || 18;
        const result = parseAmount(amountOut, decimals);
        if (!result.value) return null;
        const minRaw = (result.value * (10000n - BigInt(Math.round(slippage * 100)))) / 10000n;
        return formatUnits(minRaw, decimals);
    }, [amountOut, slippage, selectedTo?.decimals]);

    return (
        <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="modal-box bg-base-100 border-base-300/50 relative flex max-w-2xl flex-col rounded-xl border p-5">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="text-base-content text-lg font-semibold">{title}</h3>
                        <div className="bg-base-200/50 flex items-center gap-1 rounded-lg p-1">
                            <button
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === "swap" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/50"}`}
                                onClick={() => setActiveTab("swap")}
                            >
                                Swap
                            </button>
                            <button
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === "info" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/50"}`}
                                onClick={() => setActiveTab("info")}
                            >
                                Info
                            </button>
                        </div>
                    </div>
                    <button className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1.5 transition-colors" onClick={onClose}>✕</button>
                </div>

                {activeTab === "info" ? (
                    <div className="space-y-4 py-2">
                        {infoContent || (
                            <div className="alert alert-info bg-info/10 border-info/20 text-sm">
                                <InformationCircleIcon className="size-5 flex-shrink-0" />
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
                        {/* Provider Selectors Row */}
                        {((flashLoanProviders && flashLoanProviders.length >= 1 && setSelectedProvider) || setSwapRouter) && (
                            <div className="mb-[-10px] flex justify-end gap-2">
                                {/* Swap Router Selector */}
                                {setSwapRouter && (
                                    <select
                                        className="select select-xs select-ghost text-base-content/60 font-normal"
                                        value={swapRouter || "1inch"}
                                        onChange={(e) => setSwapRouter(e.target.value as SwapRouter)}
                                    >
                                        {SWAP_ROUTER_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                Swap: {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                {/* Flash Loan Provider Selector - show dropdown if multiple, read-only if single */}
                                {flashLoanProviders && flashLoanProviders.length > 1 && setSelectedProvider && (
                                    <select
                                        className="select select-xs select-ghost text-base-content/60 font-normal"
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
                                )}
                                {/* Show read-only flash loan provider when only one is available */}
                                {flashLoanProviders && flashLoanProviders.length === 1 && selectedProvider && (
                                    <span className="text-base-content/60 py-1 text-xs">
                                        Flash Loan: {selectedProvider.name}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* FROM Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/80 text-sm">{fromLabel}</span>
                                <span className="text-base-content/60 text-xs">
                                    Available: {selectedFrom ? formatUnits(selectedFrom.rawBalance, selectedFrom.decimals) : "0"}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                {selectedFrom && (
                                    <div className="relative size-8 flex-shrink-0">
                                        <Image src={selectedFrom.icon} alt={selectedFrom.symbol} fill className="rounded-full object-contain" />
                                    </div>
                                )}

                                {/* Token Selector (From) */}
                                {fromReadOnly ? (
                                    <div className="font-medium">{selectedFrom?.symbol || "-"}</div>
                                ) : (
                                    <div className="relative min-w-[100px]">
                                        <select
                                            className="select select-ghost select-sm w-full max-w-xs pl-0 font-medium focus:outline-none"
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
                                        className="border-base-300 w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-16 text-right font-medium outline-none"
                                    />
                                    <button
                                        onClick={handleSetMax}
                                        className="text-primary hover:text-primary-focus absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <span className="text-base-content/60 text-xs">
                                    ≈ ${usdValueIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Arrow Divider */}
                        <div className="relative z-10 -my-2 flex justify-center">
                            <div className="bg-base-100 border-base-300 rounded-full border p-2">
                                <ArrowDownIcon className="text-base-content/60 size-4" />
                            </div>
                        </div>

                        {/* TO Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/80 text-sm">{toLabel}</span>
                            </div>

                            <div className="flex items-center gap-3">
                                {selectedTo && (
                                    <div className="relative size-8 flex-shrink-0">
                                        <Image src={selectedTo.icon} alt={selectedTo.symbol} fill className="rounded-full object-contain" />
                                    </div>
                                )}

                                {/* Token Selector (To) */}
                                {toReadOnly ? (
                                    <div className="font-medium">{selectedTo?.symbol || "-"}</div>
                                ) : (
                                    <div className="relative min-w-[100px]">
                                        <select
                                            className="select select-ghost select-sm w-full max-w-xs pl-0 font-medium focus:outline-none"
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
                                    <div className="border-base-300 flex min-h-[32px] w-full items-center justify-end border-0 border-b-2 bg-transparent px-2 py-1 text-right font-medium outline-none">
                                        {isQuoteLoading ? (
                                            <span className="loading loading-dots loading-xs"></span>
                                        ) : (
                                            parseFloat(amountOut || "0").toFixed(6)
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <span className="text-base-content/60 text-xs">
                                    ≈ ${usdValueOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        {customStats ? customStats : !hideDefaultStats && (
                            <div className={`grid ${priceImpact !== undefined ? "grid-cols-3" : "grid-cols-2"} bg-base-200/50 gap-4 rounded p-3 text-center`}>
                                <div className="flex flex-col items-center">
                                    <div className="text-base-content/70 flex items-center gap-1 text-xs">
                                        Slippage
                                        <div className="dropdown dropdown-top dropdown-hover">
                                            <label tabIndex={0} className="hover:text-primary cursor-pointer">
                                                <Cog6ToothIcon className="size-3" />
                                            </label>
                                            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[50] mb-1 w-32 p-2 text-xs shadow">
                                                {SLIPPAGE_OPTIONS.map((s) => (
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
                                    <div className="text-sm font-medium">{slippage}%</div>
                                </div>
                                {priceImpact !== undefined && (
                                    <div>
                                        <div className="text-base-content/70 text-xs">Price Impact</div>
                                        <div className={`text-sm font-medium ${getPriceImpactColorClass(getPriceImpactSeverity(priceImpact))}`}>
                                            {formatPriceImpact(priceImpact)}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-base-content/70 text-xs">Min Output</div>
                                    <div className="text-sm font-medium">
                                        {minOutput ? (
                                            <>
                                                {parseFloat(minOutput).toFixed(6)}
                                                <span className="text-base-content/60 ml-1 text-xs">
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
                            <ErrorDisplay
                                message={`Error fetching quote: ${quoteError.message}`}
                                size="sm"
                                breakAll
                            />
                        )}
                        {warnings}

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-2">
                            <div className="flex flex-col gap-1">
                                {setPreferBatching && (
                                    <button
                                        type="button"
                                        onClick={() => setPreferBatching(prev => !prev)}
                                        className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"}`}
                                    >
                                        <CheckIcon className={`size-4 ${preferBatching ? "" : "opacity-40"}`} />
                                        Batch transactions
                                    </button>
                                )}
                            </div>

                            <div className="ml-4 flex-1">
                                <SegmentedActionBar
                                    className="w-full"
                                    autoCompact
                                    actions={[
                                        {
                                            key: "swap",
                                            label: isSubmitting ? "Processing..." : isQuoteLoading ? "Fetching Quote..." : submitLabel,
                                            icon: isSubmitting ? <ButtonLoading size="xs" /> : undefined,
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
        </dialog>
    );
};

