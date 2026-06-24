import { FC } from "react";
import Image from "next/image";
import type { MarketData } from "./MarketsSection";

interface RatePillProps {
  variant: "supply" | "borrow";
  label: string;
  rate: string;
  networkType: "evm" | "starknet";
  protocol: MarketData["protocol"];
  showIcons?: boolean;
  poolName?: string;
  /** Optional yield breakdown (percentages) shown on hover for supply rates. */
  impliedApy?: number;
  nativeApy?: number;
  baseSupplyApy?: number;
}

const protocolIcons: Record<MarketData["protocol"], string> = {
  aave: "/logos/aave.svg",
  nostra: "/logos/nostra.svg",
  venus: "/logos/venus.svg",
  vesu: "/logos/vesu.svg",
  compound: "/logos/compound.svg",
  morpho: "/logos/morpho.svg",
  euler: "/logos/euler.svg",
};

const fmtPct = (v: number) => `${v.toFixed(2)}%`;

export const RatePill: FC<RatePillProps> = ({
  variant,
  rate,
  protocol,
  showIcons = true,
  poolName,
  impliedApy,
  nativeApy,
  baseSupplyApy,
}) => {
  const isSupply = variant === "supply";

  // Breakdown rows — only for supply rates that carry external yield (PT / LST).
  // "Implied" is the Pendle fixed yield, "Native" the underlying's organic yield,
  // "Earn" the protocol's base vault rate. The headline rate is the effective total.
  // Only worth a breakdown when there's external yield (PT implied / LST native).
  // Plain vaults carry just baseSupplyApy (== the headline), so skip the tooltip there.
  const hasExternal = impliedApy != null || nativeApy != null;
  const breakdown = isSupply && hasExternal
    ? ([
        impliedApy != null ? { label: "Implied", value: impliedApy, cls: "text-info" } : null,
        nativeApy != null ? { label: "Native", value: nativeApy, cls: "text-base-content/80" } : null,
        baseSupplyApy != null ? { label: "Earn", value: baseSupplyApy, cls: "text-base-content/80" } : null,
      ].filter(Boolean) as { label: string; value: number; cls: string }[])
    : [];
  const hasBreakdown = breakdown.length > 0;

  return (
    <div className="group/rate relative flex flex-col items-center gap-1">
      {/* Label */}
      <span className="text-base-content/35 text-[9px] font-medium uppercase tracking-widest">
        {isSupply ? "Best Supply" : "Best Borrow"}
      </span>

      {/* Rate with protocol icon */}
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-lg font-bold tabular-nums tracking-tight ${
            isSupply ? "text-success" : "text-error"
          } ${hasBreakdown ? "decoration-base-content/25 cursor-help underline decoration-dotted underline-offset-4" : ""}`}
        >
          {rate}
        </span>
        {showIcons && (
          <div className="relative size-4 opacity-60">
            <Image src={protocolIcons[protocol]} alt={protocol} fill className="rounded object-contain" />
          </div>
        )}
      </div>
      {poolName && <span className="text-base-content/50 text-[10px] leading-none">{poolName}</span>}

      {/* Hover breakdown — Earn vs Implied vs Native */}
      {hasBreakdown && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 group-hover/rate:block">
          <div className="bg-base-300 border-base-content/10 w-40 border px-3 py-2 text-left shadow-xl">
            <div className="text-base-content/45 mb-1.5 text-[8px] font-medium uppercase tracking-[0.12em]">
              Yield breakdown
            </div>
            <div className="space-y-1">
              {breakdown.map(b => (
                <div key={b.label} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-base-content/55">{b.label}</span>
                  <span className={`font-mono tabular-nums ${b.cls}`}>{fmtPct(b.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RatePill;
