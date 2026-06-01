import { FC } from "react";
import { formatUsdValue } from "~~/hooks/useTokenPrice";

export interface CostBreakdownRowsProps {
  /** USD cost of the flash-loan fee (0 for Balancer V2/V3 + Morpho, non-zero for Aave). */
  flashFeeUsd: number;
  /** Realized swap price impact in $ at the quoted rate (vs symmetric src USD value). */
  priceImpactUsd: number;
  /** Realized impact as a percent — shown alongside the price-impact row when known. */
  priceImpactPct?: number;
  /** Worst-case slippage cost = slippagePct × output USD. The bound the user actually risks. */
  maxSlippageUsd: number;
  /** Slippage percent the user picked, displayed alongside the max-slippage row label. */
  slippagePct?: number;
  /** Worst-case total = flash fee + max(realized impact, max slippage). Shown in bold. */
  totalCostUsd: number;
  /** Compact mode hides the section header, e.g. when embedded inside another stats panel. */
  compact?: boolean;
  className?: string;
}

/**
 * Cost breakdown rows shared by leverage / close / swap modals.
 *
 * Shows three USD figures so users understand both the *realized* and *worst-case* cost:
 *   - Flash fee:     baked-in protocol fee (Aave 5bps, others 0)
 *   - Price impact:  realized rate degradation at the quoted size (often ~0 for liquid pairs)
 *   - Max slippage:  upper bound on swap loss given user's slippage tolerance
 *   - Total cost:    flash + max(impact, slippage) — the worst case they could actually pay
 */
export const CostBreakdownRows: FC<CostBreakdownRowsProps> = ({
  flashFeeUsd,
  priceImpactUsd,
  priceImpactPct,
  maxSlippageUsd,
  slippagePct,
  totalCostUsd,
  compact = false,
  className = "",
}) => {
  const showImpactPct = priceImpactPct !== undefined && priceImpactPct > 0;
  const showSlippagePct = slippagePct !== undefined && slippagePct > 0;
  return (
    <div className={`space-y-1 font-mono tabular-nums ${className}`}>
      {!compact && (
        <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Cost</div>
      )}
      <div className="text-base-content/60 flex justify-between text-[11px]">
        <span>Flash fee</span>
        <span>{formatUsdValue(flashFeeUsd, { compact: false })}</span>
      </div>
      <div className="text-base-content/60 flex justify-between text-[11px]">
        <span>Price impact{showImpactPct ? ` (${priceImpactPct!.toFixed(2)}%)` : ""}</span>
        <span>{formatUsdValue(priceImpactUsd, { compact: false })}</span>
      </div>
      <div className="text-base-content/60 flex justify-between text-[11px]">
        <span>Max slippage{showSlippagePct ? ` (${slippagePct!.toFixed(2)}%)` : ""}</span>
        <span>{formatUsdValue(maxSlippageUsd, { compact: false })}</span>
      </div>
      <div className="flex justify-between text-xs font-semibold">
        <span>Total cost</span>
        <span>{formatUsdValue(totalCostUsd, { compact: false })}</span>
      </div>
    </div>
  );
};
