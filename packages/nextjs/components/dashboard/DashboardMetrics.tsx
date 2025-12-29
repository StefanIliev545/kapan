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
            <div className="flex items-center space-x-8">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-5 w-20 bg-base-300/50 rounded animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center text-sm">
            <div className="flex items-center mr-8">
                <span className="text-base-content/40 mr-2">Net Worth</span>
                <span className="font-medium text-base-content tabular-nums">{formatCurrency(netWorth)}</span>
            </div>

            <div className="flex items-center mr-8">
                <span className="text-base-content/40 mr-2">Supplied</span>
                <span className="font-medium text-base-content tabular-nums">{formatCurrency(totalSupply)}</span>
            </div>

            <div className="flex items-center">
                <span className="text-base-content/40 mr-2">Borrowed</span>
                <span className="font-medium text-base-content tabular-nums">{formatCurrency(totalDebt)}</span>
            </div>
        </div>
    );
};
