import React from "react";
import { formatCurrency } from "~~/utils/formatNumber";

interface DashboardMetricsProps {
    netWorth: number;
    totalSupply: number;
    totalDebt: number;
    isLoading?: boolean;
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
    netWorth,
    totalSupply,
    totalDebt,
    isLoading = false,
}) => {
    if (isLoading) {
        return (
            <div className="flex items-center gap-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <div className="bg-base-content/5 h-3 w-10 animate-pulse rounded" />
                        <div className="bg-base-content/10 h-4 w-16 animate-pulse rounded" />
                    </div>
                ))}
            </div>
        );
    }

    const metrics = [
        { label: "Net", value: netWorth, color: netWorth >= 0 ? "text-success" : "text-error" },
        { label: "Supply", value: totalSupply, color: "text-success" },
        { label: "Debt", value: totalDebt, color: "text-error" },
    ];

    return (
        <div className="flex flex-wrap items-center gap-4">
            {metrics.map((metric, i) => (
                <React.Fragment key={metric.label}>
                    {i > 0 && <span className="text-base-content/10 hidden sm:inline">|</span>}
                    <div className="flex items-center gap-1.5">
                        <span className="text-base-content/35 text-[10px] font-medium uppercase tracking-wider">
                            {metric.label}
                        </span>
                        <span className={`font-mono text-sm font-semibold tabular-nums ${metric.color}`}>
                            {formatCurrency(metric.value)}
                        </span>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
};
