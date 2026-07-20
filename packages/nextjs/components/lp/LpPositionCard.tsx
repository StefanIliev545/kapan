"use client";

import { FC } from "react";
import Image from "next/image";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
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

const formatTokenAmount = (amount: number): string => {
  if (!Number.isFinite(amount) || amount === 0) return "0";
  if (amount >= 10_000) return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return amount.toLocaleString(undefined, { maximumSignificantDigits: 4 });
};

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
  usdOf: (t: UniToken, amount: number) => number;
}

const AssetComposition = ({
  token,
  allocation,
  usdOf,
}: {
  token: UniToken;
  allocation: number;
  usdOf: (token: UniToken, amount: number) => number;
}) => {
  const tokenValue = usdOf(token, token.amount);
  const feesValue = usdOf(token, token.fees);

  return (
    <div className="border-base-content/[0.08] bg-base-content/[0.025] flex min-w-0 flex-col gap-3 border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TokenGlyph symbol={token.symbol} size={24} />
          <span className="truncate text-sm font-semibold">{token.symbol}</span>
        </div>
        <span className="text-base-content/50 font-mono text-xs tabular-nums">{allocation.toFixed(0)}%</span>
      </div>
      <div className="space-y-1">
        <div className="text-base-content font-mono text-sm font-semibold tabular-nums">
          {formatTokenAmount(token.amount)}
        </div>
        <div className="text-base-content/50 text-[10px] uppercase tracking-wider">
          {formatCurrencyCompact(tokenValue)} in position
        </div>
      </div>
      <div className="border-base-content/[0.08] flex items-center justify-between border-t pt-2 text-[10px] uppercase tracking-wider">
        <span className="text-base-content/45">Uncollected</span>
        <span className="text-success font-mono font-semibold tabular-nums">{formatCurrencyCompact(feesValue)}</span>
      </div>
    </div>
  );
};

/**
 * One concentrated-liquidity position, rendered with the shared lending-position chrome:
 * a header (pair · fee tier · version · status · value/fees), a price-range bar, then both
 * tokens via {@link LpPosition} (reuses BasePosition). Used by both the Uniswap and
 * Aerodrome/Velodrome protocol views.
 */
export const LpPositionCard: FC<LpPositionCardProps> = ({ position: p, value, fees, usdOf }) => {
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
  const token0Value = usdOf(p.token0, p.token0.amount);
  const token1Value = usdOf(p.token1, p.token1.amount);
  const totalTokenValue = token0Value + token1Value;
  const token0Allocation = totalTokenValue > 0 ? (token0Value / totalTokenValue) * 100 : 50;
  const token1Allocation = 100 - token0Allocation;

  return (
    <article className="bg-base-100/35 border-base-content/[0.09] space-y-4 border p-4 shadow-sm transition-colors duration-200 hover:bg-base-100/55">
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
            <div className="text-base-content text-base font-semibold">{formatCurrencyCompact(value)}</div>
            <div className="text-success text-[10px] font-semibold uppercase tracking-wider">
              {formatCurrencyCompact(fees)} uncollected
            </div>
          </div>
        </div>
      </div>

      <section
        className="bg-base-content/[0.025] border-base-content/[0.08] space-y-3 border p-3"
        aria-label="Liquidity price range"
      >
        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider">
          <span className="text-base-content/50">
            Range · {p.token1.symbol} per {p.token0.symbol}
          </span>
          <span className={status.color.split(" ")[0]}>{status.detail}</span>
        </div>
        <div className="relative px-1 pt-5">
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
      </section>

      <div className="text-base-content/45 text-[10px] font-semibold uppercase tracking-widest">
        Position composition
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AssetComposition token={p.token0} allocation={token0Allocation} usdOf={usdOf} />
        <AssetComposition token={p.token1} allocation={token1Allocation} usdOf={usdOf} />
      </div>
    </article>
  );
};

export default LpPositionCard;
