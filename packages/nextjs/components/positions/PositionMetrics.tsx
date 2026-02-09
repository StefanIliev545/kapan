import { FC, useMemo } from "react";
import type { PositionGroup } from "~~/types/positions";
import { totalCollateralUsd, totalDebtUsd, weightedRate } from "~~/types/positions";
import { formatCurrency } from "~~/utils/formatNumber";
import formatPercentage from "~~/utils/formatPercentage";

interface PositionMetricsProps {
  group: PositionGroup;
  /** Show in a horizontal row (default) or vertical stack */
  layout?: "row" | "stack";
}

/**
 * Computes and displays aggregate metrics for a PositionGroup:
 *   - Net position value (collateral - debt) in USD
 *   - Net APY approximation: (supply yield - borrow cost) / |net position|
 */
export const PositionMetrics: FC<PositionMetricsProps> = ({ group, layout = "row" }) => {
  const metrics = useMemo(() => {
    const collateralUsd = totalCollateralUsd(group);
    const debtUsd = totalDebtUsd(group);
    const net = collateralUsd - debtUsd;
    const supplyRate = weightedRate(group.collaterals);
    const borrowRate = weightedRate(group.debts);
    // Net APY approximation: (supply yield - borrow cost) / net position
    const netApy =
      net !== 0 ? (collateralUsd * supplyRate - debtUsd * borrowRate) / Math.abs(net) : 0;

    return { collateralUsd, debtUsd, net, supplyRate, borrowRate, netApy };
  }, [group]);

  const containerClass = layout === "stack" ? "flex flex-col gap-1" : "flex items-center gap-4";

  return (
    <div className={containerClass}>
      <div className="flex flex-col">
        <span className="text-base-content/50 text-[10px] uppercase tracking-wider">Net</span>
        <span className={`text-sm font-semibold ${metrics.net >= 0 ? "text-success" : "text-error"}`}>
          {formatCurrency(metrics.net)}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-base-content/50 text-[10px] uppercase tracking-wider">APY</span>
        <span className={`text-sm font-medium ${metrics.netApy >= 0 ? "text-success" : "text-error"}`}>
          {formatPercentage(metrics.netApy)}%
        </span>
      </div>
    </div>
  );
};
