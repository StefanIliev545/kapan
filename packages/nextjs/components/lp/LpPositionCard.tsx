"use client";

import { FC } from "react";
import Image from "next/image";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { LpPosition } from "~~/components/LpPosition";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import type { UniToken, UniswapPosition } from "~~/utils/uniswapMath";

const formatPrice = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  // Memecoin/exotic pairs produce prices spanning dozens of orders of magnitude — use
  // scientific notation at the extremes so the labels stay short instead of a 40-digit number.
  if (abs >= 1e9 || abs < 1e-4) return n.toExponential(1);
  if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: abs >= 1000 ? 0 : 2 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
};
/** Round a fee % to a clean label (0.30→0.3%, 0.2457→0.25%, 0.05→0.05%). */
const formatFee = (fp: number): string => `${parseFloat(fp.toFixed(2))}%`;

/** Small overlapping token icon for the pair header. */
function TokenGlyph({ symbol, size = 20 }: { symbol: string; size?: number }) {
  return (
    <span
      className="bg-base-300 ring-base-100 relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2"
      style={{ width: size, height: size }}
    >
      <span className="text-base-content/60 absolute inset-0 flex items-center justify-center text-[8px] font-medium">
        {symbol.slice(0, 2).toUpperCase()}
      </span>
      <Image
        src={tokenNameToLogo(symbol.toLowerCase())}
        alt={symbol}
        width={size}
        height={size}
        className="relative z-10 object-contain"
        onError={e => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </span>
  );
}

interface LpPositionCardProps {
  position: UniswapPosition;
  /** Total USD value of the position. */
  value: number;
  /** Total uncollected fees in USD. */
  fees: number;
  priceRawOf: (t: UniToken) => bigint;
  usdOf: (t: UniToken, amount: number) => number;
}

/**
 * One concentrated-liquidity position, rendered with the shared lending-position chrome:
 * a header (pair · fee tier · version · status · value/fees), a price-range bar, then both
 * tokens via {@link LpPosition} (reuses BasePosition). Used by both the Uniswap and
 * Aerodrome/Velodrome protocol views.
 */
export const LpPositionCard: FC<LpPositionCardProps> = ({ position: p, value, fees, priceRawOf, usdOf }) => {
  const span = p.priceUpper - p.priceLower;
  const pct = Math.max(0, Math.min(100, span > 0 ? ((p.priceCurrent - p.priceLower) / span) * 100 : 50));
  const labelPct = Math.max(8, Math.min(92, pct)); // keep the floating label off the edges
  const isBelowRange = p.priceCurrent < p.priceLower;
  const status = p.closed
    ? {
        label: "Closed",
        detail: "Position is no longer earning fees",
        color: "text-base-content/50 border-base-content/20",
        marker: "bg-base-content/40",
      }
    : p.inRange
      ? {
          label: "In range",
          detail: "Actively earning fees",
          color: "text-success border-success/30",
          marker: "bg-success",
        }
      : {
          label: isBelowRange ? "Below range" : "Above range",
          detail: "Rebalance to resume earning fees",
          color: "text-warning border-warning/30",
          marker: "bg-warning",
        };
  const versionLabel = p.versionLabel ?? `v${p.version}`;

  return (
    <article className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center -space-x-1.5">
            <TokenGlyph symbol={p.token0.symbol} />
            <TokenGlyph symbol={p.token1.symbol} />
          </div>
          <span className="font-semibold">
            {p.token0.symbol} / {p.token1.symbol}
          </span>
          <span className="badge-tag-muted">{formatFee(p.feePercent)}</span>
          <span className="text-base-content/40 text-[10px] font-medium uppercase tracking-wider">{versionLabel}</span>
          {p.url && (
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-base-content/50 hover:text-primary inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            >
              <span className="hidden sm:inline">Manage</span>
              <ArrowTopRightOnSquareIcon className="size-3.5" />
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 font-mono tabular-nums">
          <span className={`badge-tag ${status.color}`}>{status.label}</span>
          <div className="text-right">
            <div className="text-base-content text-sm font-semibold">{formatCurrencyCompact(value)}</div>
            <div className="text-success text-[10px] font-semibold uppercase tracking-wider">
              {formatCurrencyCompact(fees)} fees
            </div>
          </div>
        </div>
      </div>

      <div className="bg-base-content/[0.025] border-base-content/[0.08] space-y-2 border p-3">
        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider">
          <span className="text-base-content/50">
            Active range · {p.token1.symbol} / {p.token0.symbol}
          </span>
          <span className={status.color.split(" ")[0]}>{status.detail}</span>
        </div>
        <div className="relative px-1 pt-4">
          <div
            className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums ${status.color.split(" ")[0]}`}
            style={{ left: `${labelPct}%` }}
          >
            {formatPrice(p.priceCurrent)} current
          </div>
          <div className="relative h-1.5 w-full bg-base-content/10">
            <div
              className={`absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 ${status.marker}`}
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="text-base-content/40 mt-1 flex justify-between text-[10px] tabular-nums">
            <span>{formatPrice(p.priceLower)}</span>
            <span className="text-base-content/30">
              {p.token1.symbol} / {p.token0.symbol}
            </span>
            <span>{formatPrice(p.priceUpper)}</span>
          </div>
        </div>
      </div>

      <div className="text-base-content/45 text-[10px] font-semibold uppercase tracking-widest">
        Position composition
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {[p.token0, p.token1].map((t, i) => (
          <LpPosition
            key={i}
            icon={tokenNameToLogo(t.symbol.toLowerCase())}
            symbol={t.symbol}
            tokenAddress={t.address}
            tokenDecimals={t.decimals}
            tokenPrice={priceRawOf(t)}
            amount={t.amount}
            fees={t.fees}
            feesUsd={usdOf(t, t.fees)}
          />
        ))}
      </div>
    </article>
  );
};

export default LpPositionCard;
