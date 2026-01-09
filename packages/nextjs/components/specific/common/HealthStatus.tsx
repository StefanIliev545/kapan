"use client";

import { FC } from "react";

export interface HealthStatusProps {
  /** Utilization percentage (0-100) */
  utilizationPercentage: number;
  /** Label shown on mobile (defaults to "LTV") */
  mobileLabel?: string;
}

/**
 * Health status indicator component that shows utilization percentage.
 * Displays a colored progress bar on desktop and just the percentage on mobile.
 * Color coding:
 * - Green (success): < 50%
 * - Yellow (warning): 50-70%
 * - Red (error): >= 70%
 */
export const HealthStatus: FC<HealthStatusProps> = ({ utilizationPercentage, mobileLabel = "LTV" }) => {
  // Determine color based on utilization percentage
  const getColorClasses = () => {
    if (utilizationPercentage < 50) return { bar: "bg-success", text: "text-success", glow: "shadow-success/30" };
    if (utilizationPercentage < 70) return { bar: "bg-warning", text: "text-warning", glow: "shadow-warning/30" };
    return { bar: "bg-error", text: "text-error", glow: "shadow-error/30" };
  };
  const colors = getColorClasses();

  return (
    <>
      {/* Desktop: bar + percentage */}
      <div className="hidden items-center gap-2.5 sm:flex">
        <div className="bg-base-300/60 h-1.5 w-24 overflow-hidden rounded-full">
          <div
            className={`h-full ${colors.bar} rounded-full shadow-sm transition-all duration-500 ${colors.glow}`}
            style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
          />
        </div>
        <span className={`font-mono text-xs font-semibold tabular-nums ${colors.text}`}>
          {utilizationPercentage.toFixed(0)}%
        </span>
      </div>
      {/* Mobile: just percentage */}
      <span className={`font-mono text-sm font-bold tabular-nums sm:hidden ${colors.text}`}>
        {utilizationPercentage.toFixed(0)}%
      </span>
    </>
  );
};

HealthStatus.displayName = "HealthStatus";
