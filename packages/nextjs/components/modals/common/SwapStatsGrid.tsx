"use client";

import { FC, ReactNode } from "react";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { SLIPPAGE_OPTIONS } from "~~/hooks/useAutoSlippage";

export interface SwapStatItem {
    /** Label for the stat */
    label: string;
    /** Value to display */
    value: string | ReactNode;
    /** Optional CSS class for value styling */
    valueClassName?: string;
    /** Optional flex items for label (e.g., settings icon) */
    labelExtra?: ReactNode;
}

export interface SwapStatsGridProps {
    /** Stats to display */
    stats: SwapStatItem[];
    /** Number of columns (auto-calculated based on stats length if not provided) */
    columns?: 2 | 3 | 4;
    /** Additional class name */
    className?: string;
}

export const SwapStatsGrid: FC<SwapStatsGridProps> = ({
    stats,
    columns,
    className = "",
}) => {
    const cols = columns || Math.min(4, stats.length) as 2 | 3 | 4;
    const gridClass = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";

    return (
        <div className={`grid ${gridClass} gap-3 text-center bg-base-200/50 p-3 rounded text-xs ${className}`}>
            {stats.map((stat, index) => (
                <div key={index}>
                    <div className="text-base-content/70 flex items-center justify-center gap-1">
                        {stat.label}
                        {stat.labelExtra}
                    </div>
                    <div className={`font-medium ${stat.valueClassName || ""}`}>
                        {stat.value}
                    </div>
                </div>
            ))}
        </div>
    );
};

export interface SlippageSelectorProps {
    /** Current slippage value */
    slippage: number;
    /** Callback when slippage changes */
    setSlippage: (value: number) => void;
    /** Available slippage options (defaults to SLIPPAGE_OPTIONS) */
    options?: number[];
}

export const SlippageSelector: FC<SlippageSelectorProps> = ({
    slippage,
    setSlippage,
    options = SLIPPAGE_OPTIONS,
}) => {
    return (
        <div className="dropdown dropdown-top dropdown-hover">
            <label tabIndex={0} className="cursor-pointer hover:text-primary">
                <Cog6ToothIcon className="w-3 h-3" />
            </label>
            <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-32 text-xs mb-1">
                {options.map((s) => (
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
    );
};

export interface MarketSwapStatsProps {
    /** Current slippage */
    slippage: number;
    /** Callback to change slippage */
    setSlippage: (value: number) => void;
    /** Price impact percentage */
    priceImpact?: number | null;
    /** Price impact CSS class */
    priceImpactClass?: string;
    /** Formatted price impact string */
    formattedPriceImpact?: string;
    /** Exchange rate (e.g., "1 ETH = 2500 USDC") */
    exchangeRate?: string;
    /** From token symbol */
    fromSymbol?: string;
    /** To token symbol */
    toSymbol?: string;
    /** Expected output amount */
    expectedOutput?: string;
    /** Whether output covers required amount */
    outputCoversRequired?: boolean;
    /** Additional class name */
    className?: string;
}

export const MarketSwapStats: FC<MarketSwapStatsProps> = ({
    slippage,
    setSlippage,
    priceImpact,
    priceImpactClass = "",
    formattedPriceImpact,
    exchangeRate,
    fromSymbol,
    toSymbol,
    expectedOutput,
    outputCoversRequired,
    className = "",
}) => {
    const stats: SwapStatItem[] = [
        {
            label: "Slippage",
            value: `${slippage}%`,
            labelExtra: <SlippageSelector slippage={slippage} setSlippage={setSlippage} />,
        },
    ];

    if (priceImpact !== undefined && priceImpact !== null) {
        stats.push({
            label: "Price Impact",
            value: formattedPriceImpact || `${priceImpact.toFixed(2)}%`,
            valueClassName: priceImpactClass,
        });
    }

    if (exchangeRate && fromSymbol && toSymbol) {
        stats.push({
            label: "Rate",
            value: `1 ${fromSymbol} = ${exchangeRate} ${toSymbol}`,
        });
    }

    if (expectedOutput && toSymbol) {
        stats.push({
            label: "Output",
            value: `${expectedOutput} ${toSymbol}`,
            valueClassName: outputCoversRequired === false ? "text-warning" : outputCoversRequired === true ? "text-success" : "",
        });
    }

    return <SwapStatsGrid stats={stats} className={className} />;
};

export default SwapStatsGrid;
