import { FC } from "react";
import type { HealthData } from "~~/types/positions";
import formatPercentage from "~~/utils/formatPercentage";

interface PositionHealthBadgeProps {
  health: HealthData;
  /** Compact mode shows just the LTV number */
  compact?: boolean;
}

/**
 * Displays LTV / health status with color-coded risk indication.
 *
 * Color thresholds (based on currentLtv / liquidationLtv ratio):
 *   - Green:  ratio < 70%  (healthy)
 *   - Yellow: ratio 70-90% (warning)
 *   - Red:    ratio > 90%  (danger / near liquidation)
 */
export const PositionHealthBadge: FC<PositionHealthBadgeProps> = ({ health, compact }) => {
  const ratio =
    health.currentLtv !== null && health.liquidationLtv > 0
      ? health.currentLtv / health.liquidationLtv
      : 0;

  const colorClass = ratio > 0.9 ? "text-error" : ratio > 0.7 ? "text-warning" : "text-success";

  if (compact) {
    return (
      <span className={`text-xs font-medium ${colorClass}`}>
        {health.currentLtv !== null ? `${formatPercentage(health.currentLtv)}%` : "\u2014"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`font-medium ${colorClass}`}>
        LTV {health.currentLtv !== null ? `${formatPercentage(health.currentLtv)}%` : "\u2014"}
      </span>
      <span className="text-base-content/40">/</span>
      <span className="text-base-content/60">LLTV {formatPercentage(health.liquidationLtv)}%</span>
    </div>
  );
};
