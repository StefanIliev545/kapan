"use client";

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { BaseProtocolHeader, type HeaderMetric } from "../specific/common";
import { LpPositionCard } from "./LpPositionCard";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { LoadingSpinner } from "~~/components/common/Loading";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { useGlobalState } from "~~/services/store/store";
import { MetricColors } from "~~/utils/protocolMetrics";
import type { UniToken, UniswapPosition } from "~~/utils/uniswapMath";

const NATIVE = "0x0000000000000000000000000000000000000000";
/** Wrapped-native per chain — native ETH (0x0, e.g. Uniswap V4) is priced via WETH. */
const WETH: Record<number, string> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  10: "0x4200000000000000000000000000000000000006",
  8453: "0x4200000000000000000000000000000000000006",
  130: "0x4200000000000000000000000000000000000006",
};

export interface LpProtocolViewProps {
  protocolName: string;
  protocolIcon: string;
  protocolUrl: string;
  /** Effective chain id (fork-aware) the positions belong to. */
  chainId: number;
  positions: UniswapPosition[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
}

/**
 * Shared protocol view for concentrated-liquidity DEXes (Uniswap, Aerodrome/Velodrome).
 * Handles USD pricing, aggregate header metrics, collapse, and renders each position via the
 * shared {@link LpPositionCard}. The per-protocol data is fetched by a thin wrapper that passes
 * `positions` in.
 */
export const LpProtocolView: FC<LpProtocolViewProps> = ({
  protocolName,
  protocolIcon,
  protocolUrl,
  chainId,
  positions,
  isLoading,
  hasLoadedOnce,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  useEffect(() => setIsCollapsed(true), [chainId]);

  const priceAddr = useCallback((a: string) => (a.toLowerCase() === NATIVE ? (WETH[chainId] ?? a) : a), [chainId]);
  const tokenAddresses = useMemo(() => {
    const set = new Set<string>();
    positions.forEach(p => {
      set.add(priceAddr(p.token0.address).toLowerCase());
      set.add(priceAddr(p.token1.address).toLowerCase());
    });
    return Array.from(set);
  }, [positions, priceAddr]);
  const { pricesRaw } = useTokenPricesByAddress(chainId, tokenAddresses, { enabled: tokenAddresses.length > 0 });
  const priceRawOf = useCallback(
    (t: UniToken) => pricesRaw[priceAddr(t.address).toLowerCase()] ?? 0n,
    [pricesRaw, priceAddr],
  );
  const usdOf = useCallback((t: UniToken, amount: number) => amount * (Number(priceRawOf(t)) / 1e8), [priceRawOf]);

  const rows = useMemo(
    () =>
      positions
        .map(p => {
          const value = usdOf(p.token0, p.token0.amount) + usdOf(p.token1, p.token1.amount);
          const fees = usdOf(p.token0, p.token0.fees) + usdOf(p.token1, p.token1.fees);
          return { p, value, fees };
        })
        .filter(row => !row.p.closed || row.value > 0.01 || row.fees > 0.01)
        // An LP position outside its range needs attention before a large but healthy one.
        .sort((left, right) => Number(left.p.inRange) - Number(right.p.inRange) || right.value - left.value),
    [positions, usdOf],
  );

  const totals = useMemo(() => {
    const value = rows.reduce((s, r) => s + r.value, 0);
    const fees = rows.reduce((s, r) => s + r.fees, 0);
    const inRange = rows.filter(r => r.p.inRange && !r.p.closed).length;
    const outOfRange = rows.filter(r => !r.p.inRange && !r.p.closed).length;
    return { value, fees, inRange, outOfRange, count: rows.length };
  }, [rows]);

  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);
  useEffect(() => {
    if (!hasLoadedOnce) return;
    setProtocolTotals(protocolName, totals.value, 0);
  }, [hasLoadedOnce, totals.value, setProtocolTotals, protocolName, chainId]);

  const hasPositions = rows.length > 0;
  useEffect(() => {
    if (hasLoadedOnce) setIsCollapsed(!hasPositions);
  }, [hasLoadedOnce, hasPositions]);
  const toggleCollapsed = useCallback(() => setIsCollapsed(prev => !prev), []);

  const headerMetrics: HeaderMetric[] = useMemo(
    () => [
      { label: "Balance", value: totals.value, type: "currency" },
      { label: "Uncollected Fees", mobileLabel: "Fees", value: totals.fees, type: "currency" },
      {
        label: totals.outOfRange > 0 ? "Needs attention" : "Active range",
        value: totals.outOfRange || totals.inRange,
        type: "custom",
        customRender: (hasData: boolean) => (
          <span
            className={`font-mono text-xs font-bold tabular-nums ${hasData ? (totals.outOfRange > 0 ? "text-warning" : "text-success") : MetricColors.MUTED}`}
          >
            {hasData
              ? totals.outOfRange > 0
                ? `${totals.outOfRange} outside`
                : `${totals.inRange}/${totals.count}`
              : "—"}
          </span>
        ),
      },
    ],
    [totals],
  );

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? "p-1" : "space-y-2 py-2 sm:p-3"}`}>
      <BaseProtocolHeader
        protocolName={protocolName}
        protocolIcon={protocolIcon}
        protocolUrl={protocolUrl}
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
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        ) : !hasPositions ? (
          <div className="text-base-content/50 px-3 py-6 text-center text-xs">
            No {protocolName} LP positions on this network.
          </div>
        ) : (
          <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
            <div className="card-body p-4">
              <div className="text-base-content/45 mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest">
                <span>Liquidity positions</span>
                <span>{totals.count} total</span>
              </div>
              <div className="divide-base-content/10 divide-y">
                {rows.map(({ p, value, fees }) => (
                  <LpPositionCard
                    key={`${p.protocol ?? "uni"}-${p.version}-${p.tokenId}`}
                    position={p}
                    value={value}
                    fees={fees}
                    usdOf={usdOf}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
};

export default LpProtocolView;
