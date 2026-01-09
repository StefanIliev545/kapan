"use client";

import { FC, useState, useMemo, useEffect, ReactNode, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import {
  useMorphoLendingPositions,
  useMorphoMarkets,
  MorphoPositionRow,
} from "~~/hooks/useMorphoLendingPositions";
import { useMorphoPositionsRefresh } from "~~/hooks/useMorphoPositionsRefresh";
import { MorphoPositionsSection } from "./MorphoPositionsSection";
import { MorphoMarketsSection } from "./MorphoMarketsSection";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { useGlobalState } from "~~/services/store/store";
import { usePendlePTYields, isPTToken, PTYield } from "~~/hooks/usePendlePTYields";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { HealthStatus } from "../common/HealthStatus";
import { formatSignedPercent } from "../utils";
import { useTxCompletedListenerDelayed } from "~~/hooks/common";

/**
 * Reusable collapsible section with animated expand/collapse.
 * Extracts the shared AnimatePresence + motion.div + card wrapper pattern.
 */
interface CollapsibleSectionProps {
  isOpen: boolean;
  children: ReactNode;
}

// Static image error handler at module level
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).src = "/logos/default.svg";
};

// Static animation transition object
const COLLAPSE_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };
const COLLAPSE_INITIAL = { opacity: 0, height: 0 };
const COLLAPSE_ANIMATE = { opacity: 1, height: "auto" };

// CSS class constants to avoid duplicate string warnings
const TEXT_SUCCESS = "text-success";
const TEXT_ERROR = "text-error";
const TEXT_MUTED = "text-base-content/40";

/** Metrics computed from user positions */
interface PositionMetrics {
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  avgUtilization: number;
}

/** Default metrics when no positions exist */
const EMPTY_METRICS: PositionMetrics = {
  netBalance: 0,
  netYield30d: 0,
  netApyPercent: null,
  avgUtilization: 0,
};

/**
 * Get the PT token yield for a given collateral asset.
 * Returns 0 if the collateral is not a PT token or has no yield data.
 */
function getPTTokenYield(
  collateralSymbol: string,
  collateralAddress: string,
  yieldsByAddress: Map<string, PTYield>,
  yieldsBySymbol: Map<string, PTYield>
): number {
  if (!isPTToken(collateralSymbol)) {
    return 0;
  }
  const ptYield = yieldsByAddress.get(collateralAddress) || yieldsBySymbol.get(collateralSymbol.toLowerCase());
  return ptYield?.fixedApy ?? 0;
}

/**
 * Build supplied positions array from rows.
 * Collateral in Morpho doesn't earn yield (0% APY) UNLESS it's a PT token.
 */
function buildSuppliedPositions(
  rows: MorphoPositionRow[],
  yieldsByAddress: Map<string, PTYield>,
  yieldsBySymbol: Map<string, PTYield>
): Array<{ balance: number; currentRate: number }> {
  return rows.map((row) => {
    const collateralAddr = row.market.collateralAsset?.address?.toLowerCase() || "";
    const currentRate = getPTTokenYield(row.collateralSymbol, collateralAddr, yieldsByAddress, yieldsBySymbol);
    return {
      balance: row.collateralBalanceUsd,
      currentRate,
    };
  });
}

/**
 * Build borrowed positions array from rows.
 * Only includes rows with active debt.
 */
function buildBorrowedPositions(
  rows: MorphoPositionRow[]
): Array<{ balance: number; currentRate: number }> {
  return rows
    .filter((row) => row.hasDebt)
    .map((row) => ({
      balance: row.borrowBalanceUsd,
      currentRate: row.borrowApy,
    }));
}

/**
 * Calculate position metrics from supplied and borrowed positions.
 */
function calculatePositionMetrics(
  rows: MorphoPositionRow[],
  yieldsByAddress: Map<string, PTYield>,
  yieldsBySymbol: Map<string, PTYield>
): PositionMetrics {
  if (!rows || rows.length === 0) {
    return EMPTY_METRICS;
  }

  const suppliedPositions = buildSuppliedPositions(rows, yieldsByAddress, yieldsBySymbol);
  const borrowedPositions = buildBorrowedPositions(rows);
  const yieldMetrics = calculateNetYieldMetrics(suppliedPositions, borrowedPositions);

  const avgUtilization = yieldMetrics.totalSupplied > 0
    ? (yieldMetrics.totalBorrowed / yieldMetrics.totalSupplied) * 100
    : 0;

  return {
    netBalance: yieldMetrics.netBalance,
    netYield30d: yieldMetrics.netYield30d,
    netApyPercent: yieldMetrics.netApyPercent,
    avgUtilization,
  };
}

/**
 * Get the appropriate text color class for a numeric value.
 */
function getValueColorClass(hasPositions: boolean, value: number): string {
  if (!hasPositions) return TEXT_MUTED;
  return value >= 0 ? TEXT_SUCCESS : TEXT_ERROR;
}

/**
 * Get the appropriate text color class for the APY value.
 */
function getApyColorClass(hasPositions: boolean, apyValue: number | null): string {
  if (!hasPositions || apyValue == null) return TEXT_MUTED;
  return apyValue >= 0 ? TEXT_SUCCESS : TEXT_ERROR;
}

/**
 * Format a metric value for display, or return placeholder if no positions.
 */
function formatMetricValue(hasPositions: boolean, value: number): string {
  return hasPositions ? formatCurrencyCompact(value) : "—";
}

/**
 * Format APY value for display, or return placeholder if no positions or null APY.
 */
function formatApyValue(hasPositions: boolean, apyValue: number | null): string {
  if (!hasPositions || apyValue == null) return "—";
  return formatSignedPercent(apyValue);
}

const CollapsibleSection: FC<CollapsibleSectionProps> = ({ isOpen, children }) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={COLLAPSE_INITIAL}
        animate={COLLAPSE_ANIMATE}
        exit={COLLAPSE_INITIAL}
        transition={COLLAPSE_TRANSITION}
        className="overflow-hidden"
      >
        <div className="card bg-base-200/40 border-base-300/50 rounded-xl border shadow-md">
          <div className="card-body p-4">
            {children}
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

interface MorphoProtocolViewProps {
  chainId?: number;
}

export const MorphoProtocolView: FC<MorphoProtocolViewProps> = ({
  chainId: propChainId,
}) => {
  const { address: connectedAddress, chainId: walletChainId } = useAccount();
  const chainId = propChainId || walletChainId || 42161; // Default to Arbitrum
  const effectiveChainId = getEffectiveChainId(chainId);

  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  // Start collapsed, will auto-expand when positions are found
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Reset collapsed state when chainId changes (network switch)
  useEffect(() => {
    setIsCollapsed(true);
    setIsMarketsOpen(false);
  }, [effectiveChainId]);

  const {
    markets,
    rows: apiRows,
    isLoadingMarkets,
    isLoadingPositions,
    hasLoadedOnce,
    isUpdating,
  } = useMorphoLendingPositions(effectiveChainId, connectedAddress);

  const { marketPairs } = useMorphoMarkets(effectiveChainId, undefined);

  // Fetch PT yields from Pendle for fixed APY display
  const { yieldsByAddress, yieldsBySymbol } = usePendlePTYields(effectiveChainId);

  // Extract markets where user has positions for fast refresh
  const marketsWithPositions = useMemo(() => {
    if (!apiRows.length) return [];
    return apiRows.map(row => row.market);
  }, [apiRows]);

  // Use refresh hook for fast updates after transactions
  const { rows: refreshedRows, isFetching: isRefreshing, refetch: refetchPositions } = useMorphoPositionsRefresh(
    marketsWithPositions,
    effectiveChainId,
    hasLoadedOnce && marketsWithPositions.length > 0 // Only enable after initial load
  );

  // Listen for transaction completion to trigger fast refresh (with delay to ensure tx is mined)
  useTxCompletedListenerDelayed(
    refetchPositions,
    2000,
    hasLoadedOnce && marketsWithPositions.length > 0
  );

  // Prioritize refreshed data when available, fallback to API data
  const rows = useMemo(() => {
    // Use refreshed data if available and not stale, otherwise use API data
    if (refreshedRows.length > 0 && !isRefreshing) {
      return refreshedRows;
    }
    return apiRows;
  }, [refreshedRows, apiRows, isRefreshing]);

  // Compute totals and metrics using extracted helper
  const metrics = useMemo(
    () => calculatePositionMetrics(rows, yieldsByAddress, yieldsBySymbol),
    [rows, yieldsByAddress, yieldsBySymbol]
  );

  // Report totals to global state for dashboard metrics
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce) return;

    const totalSupplied = rows.reduce((sum, row) => sum + row.collateralBalanceUsd, 0);
    const totalBorrowed = rows.reduce((sum, row) => sum + row.borrowBalanceUsd, 0);

    setProtocolTotals("Morpho", totalSupplied, totalBorrowed);
  }, [hasLoadedOnce, rows, setProtocolTotals, effectiveChainId]);

  const hasPositions = rows.length > 0;

  // Auto-expand when positions are found, stay collapsed when empty
  useEffect(() => {
    if (!hasLoadedOnce) return; // Wait for initial load to complete

    if (hasPositions) {
      setIsCollapsed(false); // Expand when positions exist
    } else {
      setIsCollapsed(true); // Stay collapsed when no positions
    }
  }, [hasLoadedOnce, hasPositions]);

  // Toggle collapsed state handler
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Toggle markets open handler (with event propagation stop)
  const toggleMarketsOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMarketsOpen(prev => !prev);
  }, []);

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 p-3'}`}>
      {/* Protocol Header Card - matching ProtocolView exactly */}
      <div
        className="card-surface-interactive shadow-lg"
        onClick={toggleCollapsed}
      >
        <div className="card-body p-3 sm:px-5">
          {/* Mobile Layout (< sm) */}
          <div className="space-y-3 sm:hidden">
            {/* Row 1: Protocol name + Markets + Collapse */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="token-icon-wrapper-md">
                  <Image
                    src="/logos/morpho.svg"
                    alt="Morpho Blue icon"
                    width={20}
                    height={20}
                    className="object-contain drop-shadow-sm"
                    onError={handleImageError}
                  />
                </div>
                <span className="text-sm font-bold tracking-tight">Morpho Blue</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-xs btn-ghost gap-1"
                  type="button"
                  onClick={toggleMarketsOpen}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wider">Markets</span>
                  {isMarketsOpen ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
                </button>
                <ChevronDownIcon
                  className={`text-base-content/40 size-4 transition-transform duration-200${isCollapsed ? '-rotate-90' : ''}`}
                />
              </div>
            </div>
            {/* Row 2: Stats in a 2x2 grid */}
            <div className="grid grid-cols-4 gap-1">
              <div className="flex flex-col items-center py-1">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">Balance</span>
                <span className={`font-mono text-xs font-bold tabular-nums ${getValueColorClass(hasPositions, metrics.netBalance)}`}>
                  {formatMetricValue(hasPositions, metrics.netBalance)}
                </span>
              </div>
              <div className="flex flex-col items-center py-1">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">30D</span>
                <span className={`font-mono text-xs font-bold tabular-nums ${getValueColorClass(hasPositions, metrics.netYield30d)}`}>
                  {formatMetricValue(hasPositions, metrics.netYield30d)}
                </span>
              </div>
              <div className="flex flex-col items-center py-1">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">Net APY</span>
                <span className={`font-mono text-xs font-bold tabular-nums ${getApyColorClass(hasPositions, metrics.netApyPercent)}`}>
                  {formatApyValue(hasPositions, metrics.netApyPercent)}
                </span>
              </div>
              <div className="flex flex-col items-center py-1">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">LTV</span>
                {hasPositions ? (
                  <HealthStatus utilizationPercentage={metrics.avgUtilization} />
                ) : (
                  <span className="text-base-content/40 font-mono text-xs font-bold tabular-nums">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Layout (>= sm) */}
          <div className="hidden flex-wrap items-center gap-x-6 gap-y-4 sm:flex">
            {/* Protocol name + icon */}
            <div className="flex items-center gap-3">
              <div className="token-icon-wrapper-lg">
                <Image
                  src="/logos/morpho.svg"
                  alt="Morpho Blue icon"
                  width={24}
                  height={24}
                  className="object-contain drop-shadow-sm"
                  onError={handleImageError}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-text-xs-semibold">Protocol</span>
                <span className="text-base font-bold tracking-tight">Morpho Blue</span>
              </div>
            </div>

            {/* Divider */}
            <div className="via-base-300 h-10 w-px bg-gradient-to-b from-transparent to-transparent" />

            {/* Stats - spread evenly across available space */}
            <div className="flex flex-1 flex-wrap items-center justify-around gap-y-3">
              {/* Net Balance */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Balance</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${getValueColorClass(hasPositions, metrics.netBalance)}`}>
                  {formatMetricValue(hasPositions, metrics.netBalance)}
                </span>
              </div>

              {/* 30D Yield */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">30D Yield</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${getValueColorClass(hasPositions, metrics.netYield30d)}`}>
                  {formatMetricValue(hasPositions, metrics.netYield30d)}
                </span>
              </div>

              {/* Net APY */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Net APY</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${getApyColorClass(hasPositions, metrics.netApyPercent)}`}>
                  {formatApyValue(hasPositions, metrics.netApyPercent)}
                </span>
              </div>

              {/* Utilization */}
              <div className="group/util hover:bg-base-200/30 flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Utilization</span>
                {hasPositions ? (
                  <HealthStatus utilizationPercentage={metrics.avgUtilization} />
                ) : (
                  <span className="text-base-content/40 font-mono text-sm font-bold tabular-nums">—</span>
                )}
              </div>
            </div>

            {/* Markets Toggle + Collapse */}
            <div className="border-base-300/50 flex items-center gap-2.5 border-l pl-2">
              <button
                className="btn btn-sm btn-ghost gap-1.5"
                type="button"
                onClick={toggleMarketsOpen}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest">Markets</span>
                {isMarketsOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
              </button>
              <ChevronDownIcon
                className={`text-base-content/40 size-5 transition-transform duration-200${isCollapsed ? '-rotate-90' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Markets Section - expandable */}
      <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
        <MorphoMarketsSection
          markets={markets}
          marketPairs={marketPairs}
          isLoading={isLoadingMarkets}
          chainId={effectiveChainId}
        />
      </CollapsibleSection>

      {/* Positions Container - collapsible with animation */}
      <CollapsibleSection isOpen={!isCollapsed}>
        <MorphoPositionsSection
          title="Your Positions"
          rows={rows}
          markets={markets}
          userAddress={connectedAddress}
          hasLoadedOnce={hasLoadedOnce || !isLoadingPositions}
          isUpdating={isUpdating}
          chainId={chainId}
          yieldsByAddress={yieldsByAddress}
          yieldsBySymbol={yieldsBySymbol}
        />
      </CollapsibleSection>
    </div>
  );
};
