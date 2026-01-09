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
      <div className="hidden sm:flex items-center gap-2.5">
        <div className="w-24 h-1.5 bg-base-300/60 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full transition-all duration-500 shadow-sm ${colors.glow}`}
            style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-mono font-semibold tabular-nums ${colors.text}`}>
          {utilizationPercentage.toFixed(0)}%
        </span>
      </div>
      {/* Mobile: just percentage */}
      <span className={`sm:hidden text-sm font-mono font-bold tabular-nums ${colors.text}`}>
        {utilizationPercentage.toFixed(0)}%
      </span>
    </>
  );
};

HealthStatus.displayName = "HealthStatus";
