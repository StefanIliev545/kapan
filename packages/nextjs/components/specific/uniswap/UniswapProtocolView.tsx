"use client";

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { useAccount } from "wagmi";
import { BaseProtocolHeader, type HeaderMetric } from "../common";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { LoadingSpinner } from "~~/components/common/Loading";
import { LpPosition } from "~~/components/LpPosition";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { useUniswapPositions } from "~~/hooks/useUniswapPositions";
import type { UniswapPosition, UniToken } from "~~/utils/uniswapMath";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { useGlobalState } from "~~/services/store/store";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { MetricColors } from "~~/utils/protocolMetrics";

interface UniswapProtocolViewProps {
  chainId?: number;
}

const NATIVE = "0x0000000000000000000000000000000000000000";
/** Wrapped-native address per chain — native ETH (0x0) in a V4 pool is priced via WETH. */
const WETH: Record<number, string> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  10: "0x4200000000000000000000000000000000000006",
  8453: "0x4200000000000000000000000000000000000006",
  130: "0x4200000000000000000000000000000000000006",
};
/** Uniswap app slugs for deep-linking to a position. */
const UNI_SLUG: Record<number, string> = { 1: "ethereum", 42161: "arbitrum", 10: "optimism", 8453: "base", 130: "unichain" };

const formatPrice = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 2 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
};

/** Small overlapping token icon for the pair header. */
function TokenGlyph({ symbol, size = 20 }: { symbol: string; size?: number }) {
  return (
    <span className="bg-base-300 ring-base-100 relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2" style={{ width: size, height: size }}>
      <span className="text-base-content/60 absolute inset-0 flex items-center justify-center text-[9px] font-medium">{symbol.slice(0, 3).toUpperCase()}</span>
      <Image src={tokenNameToLogo(symbol.toLowerCase())} alt={symbol} width={size} height={size} className="relative z-10 object-contain"
        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
    </span>
  );
}

export const UniswapProtocolView: FC<UniswapProtocolViewProps> = ({ chainId: propChainId }) => {
  const { address: connectedAddress, chainId: walletChainId } = useAccount();
  const chainId = propChainId ?? walletChainId ?? 1;
  const effectiveChainId = getEffectiveChainId(chainId);

  const [isCollapsed, setIsCollapsed] = useState(true);
  useEffect(() => setIsCollapsed(true), [effectiveChainId]);

  const { positions, isLoading, hasLoadedOnce } = useUniswapPositions(effectiveChainId, connectedAddress);

  // Prices for every token across positions (native 0x0 → WETH).
  const priceAddr = useCallback((a: string) => (a.toLowerCase() === NATIVE ? (WETH[effectiveChainId] ?? a) : a), [effectiveChainId]);
  const tokenAddresses = useMemo(() => {
    const set = new Set<string>();
    positions.forEach(p => { set.add(priceAddr(p.token0.address).toLowerCase()); set.add(priceAddr(p.token1.address).toLowerCase()); });
    return Array.from(set);
  }, [positions, priceAddr]);
  const { pricesRaw } = useTokenPricesByAddress(effectiveChainId, tokenAddresses, { enabled: tokenAddresses.length > 0 });
  const priceRawOf = useCallback((t: UniToken) => pricesRaw[priceAddr(t.address).toLowerCase()] ?? 0n, [pricesRaw, priceAddr]);
  const usdOf = useCallback((t: UniToken, amount: number) => amount * (Number(priceRawOf(t)) / 1e8), [priceRawOf]);

  // Per-position USD (value + uncollected fees), then aggregate.
  const rows = useMemo(() => positions.map(p => {
    const value = usdOf(p.token0, p.token0.amount) + usdOf(p.token1, p.token1.amount);
    const fees = usdOf(p.token0, p.token0.fees) + usdOf(p.token1, p.token1.fees);
    return { p, value, fees };
  }).filter(r => !r.p.closed || r.value > 0.01 || r.fees > 0.01), [positions, usdOf]);

  const totals = useMemo(() => {
    const value = rows.reduce((s, r) => s + r.value, 0);
    const fees = rows.reduce((s, r) => s + r.fees, 0);
    const inRange = rows.filter(r => r.p.inRange && !r.p.closed).length;
    return { value, fees, inRange, count: rows.length };
  }, [rows]);

  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);
  useEffect(() => {
    if (!hasLoadedOnce) return;
    setProtocolTotals("Uniswap", totals.value, 0);
  }, [hasLoadedOnce, totals.value, setProtocolTotals, effectiveChainId]);

  const hasPositions = rows.length > 0;
  useEffect(() => { if (hasLoadedOnce) setIsCollapsed(!hasPositions); }, [hasLoadedOnce, hasPositions]);
  const toggleCollapsed = useCallback(() => setIsCollapsed(prev => !prev), []);

  const headerMetrics: HeaderMetric[] = useMemo(() => [
    { label: "Balance", value: totals.value, type: "currency" },
    { label: "Uncollected Fees", mobileLabel: "Fees", value: totals.fees, type: "currency" },
    {
      label: "In Range", value: totals.inRange, type: "custom",
      customRender: (hasData: boolean) => (
        <span className={`font-mono text-xs font-bold tabular-nums ${hasData ? "text-base-content" : MetricColors.MUTED}`}>
          {hasData ? `${totals.inRange}/${totals.count}` : "—"}
        </span>
      ),
    },
    {
      label: "Positions", value: totals.count, type: "custom",
      customRender: (hasData: boolean) => (
        <span className={`font-mono text-xs font-bold tabular-nums ${hasData ? "text-base-content" : MetricColors.MUTED}`}>
          {hasData ? totals.count : "—"}
        </span>
      ),
    },
  ], [totals]);

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? "p-1" : "space-y-2 py-2 sm:p-3"}`}>
      <BaseProtocolHeader
        protocolName="Uniswap"
        protocolIcon="/logos/uni.svg"
        protocolUrl="https://app.uniswap.org/positions"
        isCollapsed={isCollapsed}
        isMarketsOpen={false}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={() => undefined}
        showMarkets={false}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

      <CollapsibleSection isOpen={!isCollapsed}>
        {isLoading && !hasLoadedOnce ? (
          <div className="flex justify-center py-6"><LoadingSpinner /></div>
        ) : !hasPositions ? (
          <div className="text-base-content/50 px-3 py-6 text-center text-xs">No Uniswap LP positions on this network.</div>
        ) : (
          <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
            <div className="card-body p-4">
              <div className="divide-base-content/10 divide-y">
                {rows.map(({ p, value, fees }) => (
                  <UniswapPositionRow key={`${p.version}-${p.tokenId}`} position={p} chainId={effectiveChainId} value={value} fees={fees} priceRawOf={priceRawOf} usdOf={usdOf} />
                ))}
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
};

interface RowProps {
  position: UniswapPosition;
  chainId: number;
  value: number;
  fees: number;
  priceRawOf: (t: UniToken) => bigint;
  usdOf: (t: UniToken, amount: number) => number;
}

const UniswapPositionRow: FC<RowProps> = ({ position: p, chainId, value, fees, priceRawOf, usdOf }) => {
  const slug = UNI_SLUG[chainId];
  const url = slug ? `https://app.uniswap.org/positions/${p.version === 4 ? "v4" : "v3"}/${slug}/${p.tokenId}` : undefined;

  // Range bar: where the current price sits between bounds.
  const span = p.priceUpper - p.priceLower;
  const pct = Math.max(0, Math.min(100, span > 0 ? ((p.priceCurrent - p.priceLower) / span) * 100 : 50));
  const labelPct = Math.max(8, Math.min(92, pct)); // keep the floating label off the edges
  const rangeColor = p.inRange ? "bg-success" : "bg-warning";

  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      {/* Header: pair + fee tier + version + status + value/fees (LP extension) */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-1.5">
            <TokenGlyph symbol={p.token0.symbol} />
            <TokenGlyph symbol={p.token1.symbol} />
          </div>
          <span className="font-semibold">{p.token0.symbol} / {p.token1.symbol}</span>
          <span className="badge-tag-muted">{p.feePercent}%</span>
          <span className="text-base-content/40 text-[10px] font-medium uppercase tracking-wider">v{p.version}</span>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-base-content/40 hover:text-primary transition-colors">
              <ArrowTopRightOnSquareIcon className="size-3.5" />
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 font-mono tabular-nums">
          <span className={`badge-tag ${p.inRange ? "text-success border-success/30" : "text-warning border-warning/30"}`}>
            {p.closed ? "Closed" : p.inRange ? "In range" : "Out of range"}
          </span>
          <span className="text-base-content/60">Value: <span className="text-base-content font-semibold">{formatCurrencyCompact(value)}</span></span>
          <span className="text-base-content/60">Fees: <span className="text-success font-semibold">{formatCurrencyCompact(fees)}</span></span>
        </div>
      </div>

      {/* Price range (LP extension) — on top, current price floats above its marker */}
      <div className="relative px-1 pt-4">
        <div
          className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums ${p.inRange ? "text-success" : "text-warning"}`}
          style={{ left: `${labelPct}%` }}
        >
          {formatPrice(p.priceCurrent)}
        </div>
        <div className="relative h-1.5 w-full bg-base-content/10">
          <div className={`absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 ${rangeColor}`} style={{ left: `${pct}%` }} />
        </div>
        <div className="text-base-content/40 mt-1 flex justify-between text-[10px] tabular-nums">
          <span>{formatPrice(p.priceLower)}</span>
          <span className="text-base-content/30">{p.token1.symbol} / {p.token0.symbol}</span>
          <span>{formatPrice(p.priceUpper)}</span>
        </div>
      </div>

      {/* Two tokens side by side — real position chrome via LpPosition */}
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
    </div>
  );
};
