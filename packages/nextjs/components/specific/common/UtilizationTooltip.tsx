"use client";

import { FC } from "react";
import { HealthStatus } from "./HealthStatus";

// ── Types ──────────────────────────────────────────────────────────

export interface CollateralBreakdownItem {
  name: string;
  icon: string;
  valueUsd: number;
  /** Max LTV in basis points (e.g., 8000 = 80%) */
  ltvBps: number;
  /** Liquidation threshold in basis points */
  lltvBps: number;
  /** Percentage of total collateral (0-100) */
  weightPct: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (Math.abs(value) < 0.01) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Calculate utilization metrics from position balances and LTV thresholds.
 *
 * Returns utilizationPercentage as a % of the liquidation threshold (0-100),
 * and the currentLtvBps as a raw bps value.
 */
export function calculateUtilizationMetrics(
  totalSuppliedUsd: number,
  totalBorrowedUsd: number,
  ltvBps: bigint,
  lltvBps: bigint,
): { utilizationPercentage: number; currentLtvBps: bigint } {
  const baseLtv = totalSuppliedUsd > 0 ? (totalBorrowedUsd / totalSuppliedUsd) * 100 : 0;
  const currentBps = totalSuppliedUsd > 0
    ? BigInt(Math.round((totalBorrowedUsd / totalSuppliedUsd) * 10000))
    : 0n;

  const thresholdBps = lltvBps > 0n ? lltvBps : ltvBps;
  if (thresholdBps > 0n) {
    const usageBps = Number((currentBps * 10000n) / thresholdBps) / 100;
    return { utilizationPercentage: Math.min(usageBps, 100), currentLtvBps: currentBps };
  }

  return { utilizationPercentage: baseLtv, currentLtvBps: currentBps };
}

// ── CollateralLtvBreakdown ─────────────────────────────────────────

interface CollateralLtvBreakdownProps {
  items: CollateralBreakdownItem[];
  totalDebtUsd: number;
}

export const CollateralLtvBreakdown: FC<CollateralLtvBreakdownProps> = ({ items, totalDebtUsd }) => {
  if (items.length === 0) return null;

  const totalCollateralUsd = items.reduce((sum, item) => sum + item.valueUsd, 0);
  const currentLtv = totalCollateralUsd > 0 ? (totalDebtUsd / totalCollateralUsd) * 100 : 0;
  const weightedMaxLtv = totalCollateralUsd > 0
    ? items.reduce((sum, item) => sum + (item.valueUsd * item.ltvBps), 0) / totalCollateralUsd / 100
    : 0;
  const weightedLltv = totalCollateralUsd > 0
    ? items.reduce((sum, item) => sum + (item.valueUsd * item.lltvBps), 0) / totalCollateralUsd / 100
    : 0;

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Header with current LTV */}
      <div className="border-base-300/50 flex items-center justify-between border-b pb-2">
        <span className="text-base-content/60 text-[10px] font-semibold uppercase tracking-wide">
          Collateral Breakdown
        </span>
        <span className="text-base-content font-mono font-bold">
          {currentLtv.toFixed(1)}% LTV
        </span>
      </div>
      {/* Per-collateral rows */}
      <div className="flex flex-col gap-1.5">
        <div className="text-base-content/40 flex items-center gap-2 text-[10px]">
          <span className="flex-1">Asset</span>
          <span className="w-16 text-right">Value</span>
          <span className="w-12 text-right">Max LTV</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <img src={item.icon} alt={item.name} className="size-4 rounded-full" />
            <span className="text-base-content/90 flex-1 font-medium">{item.name}</span>
            <span className="text-base-content/60 w-16 text-right tabular-nums">{formatCurrency(item.valueUsd)}</span>
            <span className="text-base-content/50 w-12 text-right tabular-nums">{(item.ltvBps / 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {/* Summary */}
      <div className="border-base-300/50 mt-1 flex flex-col gap-1 border-t pt-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-base-content/50">Total Collateral</span>
          <span className="text-success font-medium tabular-nums">{formatCurrency(totalCollateralUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/50">Total Debt</span>
          <span className="text-error font-medium tabular-nums">{formatCurrency(totalDebtUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/50">Weighted Max LTV</span>
          <span className="text-base-content/70 font-medium tabular-nums">{weightedMaxLtv.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/50">Liquidation Threshold</span>
          <span className="text-warning font-medium tabular-nums">{weightedLltv.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
};

CollateralLtvBreakdown.displayName = "CollateralLtvBreakdown";

// ── UtilizationWithTooltip ─────────────────────────────────────────

export interface UtilizationWithTooltipProps {
  utilizationPercentage: number;
  collateralBreakdown: CollateralBreakdownItem[];
  totalDebtUsd: number;
}

/**
 * Desktop utilization display with a colored progress bar and an optional
 * hover tooltip that shows per-collateral LTV breakdown.
 *
 * Extracted from the old ProtocolView to be reusable across protocol views.
 */
export const UtilizationWithTooltip: FC<UtilizationWithTooltipProps> = ({
  utilizationPercentage, collateralBreakdown, totalDebtUsd,
}) => {
  const hasBreakdown = collateralBreakdown.length > 0;

  return (
    <div className="group/util relative inline-flex flex-col items-center">
      <div className="flex items-center gap-1">
        <HealthStatus utilizationPercentage={utilizationPercentage} />
        {hasBreakdown && <span className="text-primary text-[8px]">{"\u24d8"}</span>}
      </div>
      {hasBreakdown && (
        <div className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 hidden -translate-x-1/2 group-hover/util:block">
          <div className="bg-base-100 ring-base-300/50 pointer-events-auto min-w-[280px] rounded-lg p-3 shadow-xl ring-1">
            <CollateralLtvBreakdown items={collateralBreakdown} totalDebtUsd={totalDebtUsd} />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Mobile-only utilization display - just the colored percentage, no tooltip.
 */
export const UtilizationMobile: FC<{ utilizationPercentage: number }> = ({ utilizationPercentage }) => (
  <HealthStatus utilizationPercentage={utilizationPercentage} />
);

UtilizationWithTooltip.displayName = "UtilizationWithTooltip";
UtilizationMobile.displayName = "UtilizationMobile";
