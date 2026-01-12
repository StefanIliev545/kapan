import { FC, useState, useMemo, useEffect, useCallback, ReactNode } from "react";
import Image from "next/image";
import { formatUnits, Address } from "viem";
import { CheckIcon, ArrowDownIcon, InformationCircleIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { SegmentedActionBar, SegmentedAction } from "../common/SegmentedActionBar";
import { ErrorDisplay } from "../common/ErrorDisplay";
import { ButtonLoading } from "../common/Loading";
import { FlashLoanProviderOption } from "~~/hooks/useMovePositionData";
import { SLIPPAGE_OPTIONS } from "~~/hooks/useAutoSlippage";
import { getPriceImpactSeverity, getPriceImpactColorClass, formatPriceImpact } from "~~/utils/slippage";
import { parseAmount } from "~~/utils/validation";

// --- Helper functions extracted for clarity ---

/** Calculate USD value from amount and price */
const getUsdValue = (amount: string, price?: bigint): number => {
    if (!amount || !price) return 0;
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) return 0;
    return parsed * Number(formatUnits(price, 8));
};

/** Format a USD value for display */
const formatUsdDisplay = (value: number): string =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- Sub-components extracted to reduce cognitive complexity ---

// Provider selectors - exported for use in customStats
export interface ProviderSelectorsProps {
    flashLoanProviders?: FlashLoanProviderOption[];
    selectedProvider?: FlashLoanProviderOption | null;
    flashLoanLiquidityData?: Array<{ provider: number; liquidity: bigint; hasLiquidity: boolean }>;
    swapRouter?: SwapRouter;
    setSwapRouter?: (router: SwapRouter) => void;
    onFlashLoanProviderChange: (provider: FlashLoanProviderOption) => void;
    onSwapRouterChange: (router: SwapRouter) => void;
    className?: string;
}

export const ProviderSelectors: FC<ProviderSelectorsProps> = ({
    flashLoanProviders,
    selectedProvider,
    flashLoanLiquidityData,
    swapRouter,
    setSwapRouter,
    onFlashLoanProviderChange,
    onSwapRouterChange,
    className = "",
}) => {
    const hasMultipleProviders = flashLoanProviders && flashLoanProviders.length > 1;
    const hasSingleProvider = flashLoanProviders && flashLoanProviders.length === 1 && selectedProvider;
    const showSelectors = setSwapRouter || hasMultipleProviders || hasSingleProvider;

    if (!showSelectors) return null;

    const handleSwapRouterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onSwapRouterChange(e.target.value as SwapRouter);
    };

    const handleFlashLoanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const provider = flashLoanProviders?.find(p => p.name === e.target.value);
        if (provider) onFlashLoanProviderChange(provider);
    };

    return (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}>
            {/* Swap Router Selector */}
            {setSwapRouter && (
                <div className="flex items-center gap-1.5">
                    <span className="text-base-content/50">Router:</span>
                    <select
                        className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 font-medium"
                        value={swapRouter || "1inch"}
                        onChange={handleSwapRouterChange}
                    >
                        {SWAP_ROUTER_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Flash Loan Provider Selector - dropdown for multiple */}
            {hasMultipleProviders && (
                <div className="flex items-center gap-1.5">
                    <span className="text-base-content/50">Flash Loan:</span>
                    <select
                        className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 font-medium"
                        value={selectedProvider?.name || ""}
                        onChange={handleFlashLoanChange}
                    >
                        {flashLoanProviders.map(p => {
                            const liq = flashLoanLiquidityData?.find(l => l.provider === p.providerEnum);
                            const hasLiquidity = liq?.hasLiquidity ?? true;
                            return (
                                <option key={p.name} value={p.name}>
                                    {p.name} {liq ? (hasLiquidity ? "✓" : "⚠️") : ""}
                                </option>
                            );
                        })}
                    </select>
                </div>
            )}

            {/* Read-only flash loan provider when only one is available */}
            {hasSingleProvider && !hasMultipleProviders && (
                <div className="flex items-center gap-1.5">
                    <span className="text-base-content/50">Flash Loan:</span>
                    <span className="text-base-content/80 font-medium">{selectedProvider.name}</span>
                </div>
            )}
        </div>
    );
};

interface TokenSectionProps {
    label: string;
    asset: SwapAsset | null;
    assets: SwapAsset[];
    isReadOnly: boolean;
    showAvailable?: boolean;
    value: string;
    isLoading?: boolean;
    usdValue: number;
    onTokenChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onValueChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSetMax?: () => void;
}

const TokenSection: FC<TokenSectionProps> = ({
    label,
    asset,
    assets,
    isReadOnly,
    showAvailable = false,
    value,
    isLoading = false,
    usdValue,
    onTokenChange,
    onValueChange,
    onSetMax,
}) => (
    <div className="bg-base-200/50 border-base-300/50 rounded-lg border px-3 py-2">
        <div className="text-base-content/50 mb-1 flex items-center justify-between text-[10px]">
            <span className="uppercase tracking-wide">{label}</span>
            {showAvailable && (
                <button
                    onClick={onSetMax}
                    className="hover:text-primary cursor-pointer transition-colors"
                    title="Click to use max"
                >
                    Available: {asset ? Number(formatUnits(asset.rawBalance, asset.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"}
                </button>
            )}
        </div>

        <div className="flex items-center justify-between">
            {/* Token selector */}
            <div className="flex items-center gap-1.5">
                {asset && (
                    <div className="relative size-5 flex-shrink-0">
                        <Image src={asset.icon} alt={asset.symbol} fill className="rounded-full object-contain" />
                    </div>
                )}
                {isReadOnly ? (
                    <span className="text-sm font-medium">{asset?.symbol || "-"}</span>
                ) : (
                    <select
                        className="select select-ghost select-xs h-auto min-h-0 bg-transparent pl-0 text-sm font-medium focus:outline-none"
                        value={asset?.symbol || ""}
                        onChange={onTokenChange}
                    >
                        {assets.map(t => (
                            <option key={t.address} value={t.symbol}>{t.symbol}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Amount input */}
            <div className="flex items-center gap-1.5">
                {onValueChange ? (
                    <>
                        {isLoading ? (
                            <span className="loading loading-dots loading-xs"></span>
                        ) : (
                            <input
                                type="text"
                                inputMode="decimal"
                                value={value}
                                onChange={onValueChange}
                                placeholder="0.00"
                                className="placeholder:text-base-content/30 w-[100px] bg-transparent text-right text-sm font-medium outline-none"
                            />
                        )}
                    </>
                ) : (
                    <span className="text-sm font-medium">
                        {isLoading ? (
                            <span className="loading loading-dots loading-xs"></span>
                        ) : (
                            Number(value || "0").toLocaleString(undefined, { maximumFractionDigits: 6 })
                        )}
                    </span>
                )}
                <span className="text-base-content/40 text-[10px]">
                    ≈${formatUsdDisplay(usdValue)}
                </span>
            </div>
        </div>
    </div>
);


interface StatsGridProps {
    slippage: number;
    slippageHandlers: Record<number, () => void>;
    priceImpact?: number | null;
    minOutput: string | null;
    selectedTo: SwapAsset | null;
}

const StatsGrid: FC<StatsGridProps> = ({
    slippage,
    slippageHandlers,
    priceImpact,
    minOutput,
    selectedTo,
}) => (
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
                                    onClick={slippageHandlers[s]}
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
                            (${formatUsdDisplay(getUsdValue(minOutput, selectedTo?.price))})
                        </span>
                    </>
                ) : "-"}
            </div>
        </div>
    </div>
);

interface SwapActionsProps {
    preferBatching?: boolean;
    setPreferBatching?: (fn: (prev: boolean) => boolean) => void;
    onToggleBatching: () => void;
    swapActions: SegmentedAction[];
}

const SwapActions: FC<SwapActionsProps> = ({
    preferBatching,
    setPreferBatching,
    onToggleBatching,
    swapActions,
}) => (
    <div className="flex items-center justify-between pt-2">
        <div className="flex flex-col gap-1">
            {setPreferBatching && (
                <button
                    type="button"
                    onClick={onToggleBatching}
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
                actions={swapActions}
            />
        </div>
    </div>
);

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

    // Price impact (optional - for display in default stats)
    priceImpact?: number | null;

    // Right panel for order settings (optional - for Market/Limit toggle and settings)
    rightPanel?: ReactNode;

    // After metrics content (optional - displayed after stats, before warnings)
    afterMetrics?: ReactNode;

    // For limit orders: make output amount editable
    onAmountOutChange?: (value: string) => void;

    // Limit price adjustment buttons (shown below TO section when provided)
    limitPriceButtons?: ReactNode;
}

export const SwapModalShell: FC<SwapModalShellProps> = ({
    isOpen,
    onClose,
    title,
    fromAssets,
    toAssets,
    initialFromAddress,
    selectedFrom,
    setSelectedFrom,
    selectedTo,
    setSelectedTo,
    amountIn,
    setAmountIn,
    setIsMax,
    amountOut,
    isQuoteLoading,
    quoteError,
    slippage,
    setSlippage,
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
    priceImpact,
    rightPanel,
    afterMetrics,
    onAmountOutChange,
    limitPriceButtons,
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

    const handleSetMax = useCallback(() => {
        if (selectedFrom) {
            setAmountIn(formatUnits(selectedFrom.rawBalance, selectedFrom.decimals));
            setIsMax(true);
        }
    }, [selectedFrom, setAmountIn, setIsMax]);

    // Tab handlers
    const handleSetSwapTab = useCallback(() => setActiveTab("swap"), []);
    const handleSetInfoTab = useCallback(() => setActiveTab("info"), []);

    // From token selector handler
    const handleFromTokenChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const token = fromAssets.find(t => t.symbol === e.target.value);
        if (token) setSelectedFrom(token);
    }, [fromAssets, setSelectedFrom]);

    // Amount in change handler
    const handleAmountInChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setAmountIn(e.target.value);
        setIsMax(false);
    }, [setAmountIn, setIsMax]);

    // To token selector handler
    const handleToTokenChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const token = toAssets.find(t => t.symbol === e.target.value);
        if (token) setSelectedTo(token);
    }, [toAssets, setSelectedTo]);

    // Batching toggle handler
    const handleToggleBatching = useCallback(() => {
        if (setPreferBatching) {
            setPreferBatching(prev => !prev);
        }
    }, [setPreferBatching]);

    // Slippage handlers - create a handler factory
    const createSlippageHandler = useCallback((value: number) => () => {
        setSlippage(value);
    }, [setSlippage]);

    // Memoize slippage handlers map
    const slippageHandlers = useMemo(() => {
        return SLIPPAGE_OPTIONS.reduce((acc, s) => {
            acc[s] = createSlippageHandler(s);
            return acc;
        }, {} as Record<number, () => void>);
    }, [createSlippageHandler]);

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

    // Memoized actions for SegmentedActionBar
    const swapActions = useMemo(() => {
        const loadingIcon = <ButtonLoading size="xs" />;
        return [
            {
                key: "swap",
                label: isSubmitting ? "Processing..." : isQuoteLoading ? "Fetching Quote..." : submitLabel,
                icon: isSubmitting ? loadingIcon : undefined,
                onClick: onSubmit,
                disabled: !canSubmit || isQuoteLoading || isSubmitting,
                variant: "ghost" as const,
            },
        ];
    }, [isSubmitting, isQuoteLoading, submitLabel, onSubmit, canSubmit]);

    // Render the info tab content
    const renderInfoTab = () => (
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
    );

    // Render the stats section
    const renderStats = () => {
        if (customStats) return customStats;
        if (hideDefaultStats) return null;
        return (
            <StatsGrid
                slippage={slippage}
                slippageHandlers={slippageHandlers}
                priceImpact={priceImpact}
                minOutput={minOutput}
                selectedTo={selectedTo}
            />
        );
    };

    // Render the swap tab content
    const renderSwapTab = () => (
        <div className="space-y-3">

            {/* Token swap sections with overlapping arrow - wrapped to avoid space-y gap */}
            <div className="relative space-y-0.5">
                {/* FROM Section */}
                <TokenSection
                    label={fromLabel}
                    asset={selectedFrom}
                    assets={fromAssets}
                    isReadOnly={fromReadOnly}
                    showAvailable={true}
                    value={amountIn}
                    usdValue={usdValueIn}
                    onTokenChange={handleFromTokenChange}
                    onValueChange={handleAmountInChange}
                    onSetMax={handleSetMax}
                />

                {/* TO Section */}
                <TokenSection
                    label={toLabel}
                    asset={selectedTo}
                    assets={toAssets}
                    isReadOnly={toReadOnly}
                    value={amountOut}
                    isLoading={isQuoteLoading}
                    usdValue={usdValueOut}
                    onTokenChange={handleToTokenChange}
                    onValueChange={onAmountOutChange ? (e) => onAmountOutChange(e.target.value) : undefined}
                />

                {/* Limit price adjustment buttons (for limit orders) */}
                {limitPriceButtons}

                {/* Arrow - absolutely positioned to overlap boundary between FROM and TO */}
                <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                    <div className="bg-base-100 border-base-300 rounded border p-1 shadow-sm">
                        <ArrowDownIcon className="text-base-content/60 size-3" />
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            {renderStats()}

            {/* After Metrics (optional custom content) */}
            {afterMetrics}

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
            <SwapActions
                preferBatching={preferBatching}
                setPreferBatching={setPreferBatching}
                onToggleBatching={handleToggleBatching}
                swapActions={swapActions}
            />
        </div>
    );

    // Determine modal width based on right panel presence
    const modalMaxWidth = rightPanel ? "max-w-3xl" : "max-w-2xl";

    return (
        <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className={`modal-box bg-base-100 border-base-300/50 relative ${modalMaxWidth} overflow-hidden rounded-xl border p-0`}>
                <div className="flex flex-col md:flex-row">
                    {/* Main Content */}
                    <div className="flex-1 p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <h3 className="text-base-content text-lg font-semibold">{title}</h3>
                                <div className="bg-base-200/50 flex items-center gap-1 rounded-lg p-1">
                                    <button
                                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === "swap" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/50"}`}
                                        onClick={handleSetSwapTab}
                                    >
                                        Swap
                                    </button>
                                    <button
                                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === "info" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/50"}`}
                                        onClick={handleSetInfoTab}
                                    >
                                        Info
                                    </button>
                                </div>
                            </div>
                        </div>

                        {activeTab === "info" ? renderInfoTab() : renderSwapTab()}
                    </div>

                    {/* Right Panel (Order Settings) - optional */}
                    {rightPanel && (
                        <div className="bg-base-200/30 border-base-300/50 w-64 flex-shrink-0 border-l p-4">
                            {rightPanel}
                        </div>
                    )}
                </div>
            </div>
        </dialog>
    );
};

