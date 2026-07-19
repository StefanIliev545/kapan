import React from "react";
import { formatCurrency } from "~~/utils/formatNumber";

interface DashboardMetricsProps {
  netWorth: number;
  totalSupply: number;
  totalDebt: number;
  isLoading?: boolean;
  loadedSources?: number;
  expectedSources?: number;
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
  netWorth,
  totalSupply,
  totalDebt,
  isLoading = false,
  loadedSources = 0,
  expectedSources = 0,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        {[1, 2, 3].map(i => (
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
    <div className="flex flex-wrap items-center gap-4" aria-live="polite">
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
      {expectedSources > 0 && loadedSources < expectedSources && (
        <span className="border-warning/20 bg-warning/10 text-warning px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
          {loadedSources}/{expectedSources} sources
        </span>
      )}
    </div>
  );
};
