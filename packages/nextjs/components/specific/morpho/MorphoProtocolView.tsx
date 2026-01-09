"use client";

import { FC, useState, useMemo, useEffect, ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import {
  useMorphoLendingPositions,
  useMorphoMarkets,
} from "~~/hooks/useMorphoLendingPositions";
import { useMorphoPositionsRefresh } from "~~/hooks/useMorphoPositionsRefresh";
import { MorphoPositionsSection } from "./MorphoPositionsSection";
import { MorphoMarketsSection } from "./MorphoMarketsSection";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { useGlobalState } from "~~/services/store/store";
import { usePendlePTYields, isPTToken } from "~~/hooks/usePendlePTYields";
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

const CollapsibleSection: FC<CollapsibleSectionProps> = ({ isOpen, children }) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
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

  // Compute totals and metrics
  const metrics = useMemo(() => {
    // Guard against undefined/empty rows
    if (!rows || rows.length === 0) {
      return {
        netBalance: 0,
        netYield30d: 0,
        netApyPercent: null,
        avgUtilization: 0,
      };
    }

    // Build position arrays for the yield calculation utility
    // Note: Collateral in Morpho doesn't earn yield (0% APY) UNLESS it's a PT token
    // PT tokens have a fixed yield to maturity from Pendle
    const suppliedPositions = rows.map((row) => {
      // Check if collateral is a PT token and get its fixed yield
      let currentRate = 0;
      if (isPTToken(row.collateralSymbol)) {
        const collateralAddr = row.market.collateralAsset?.address?.toLowerCase() || "";
        const ptYield = yieldsByAddress.get(collateralAddr) || yieldsBySymbol.get(row.collateralSymbol.toLowerCase());
        if (ptYield) {
          currentRate = ptYield.fixedApy;
        }
      }
      return {
        balance: row.collateralBalanceUsd,
        currentRate,
      };
    });

    const borrowedPositions = rows
      .filter((row) => row.hasDebt)
      .map((row) => ({
        balance: row.borrowBalanceUsd,
        currentRate: row.borrowApy,
      }));

    // Calculate net APY and 30D yield using the shared utility
    const yieldMetrics = calculateNetYieldMetrics(suppliedPositions, borrowedPositions);
    
    // Calculate average utilization (LTV across all positions)
    const avgUtilization = yieldMetrics.totalSupplied > 0 
      ? (yieldMetrics.totalBorrowed / yieldMetrics.totalSupplied) * 100 
      : 0;

    return {
      netBalance: yieldMetrics.netBalance,
      netYield30d: yieldMetrics.netYield30d,
      netApyPercent: yieldMetrics.netApyPercent,
      avgUtilization,
    };
  }, [rows, yieldsByAddress, yieldsBySymbol]);

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

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 p-3'}`}>
      {/* Protocol Header Card - matching ProtocolView exactly */}
      <div
        className="card-surface-interactive shadow-lg"
        onClick={() => setIsCollapsed(!isCollapsed)}
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
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/logos/default.svg";
                    }}
                  />
                </div>
                <span className="text-sm font-bold tracking-tight">Morpho Blue</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-xs btn-ghost gap-1"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMarketsOpen(!isMarketsOpen); }}
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
                <span className={`font-mono text-xs font-bold tabular-nums ${hasPositions ? (metrics.netBalance >= 0 ? "text-success" : "text-error") : "text-base-content/40"}`}>
                  {hasPositions ? formatCurrencyCompact(metrics.netBalance) : "—"}
                </span>
              </div>
              <div className="flex flex-col items-center py-1">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">30D</span>
                <span className={`font-mono text-xs font-bold tabular-nums ${hasPositions ? (metrics.netYield30d >= 0 ? "text-success" : "text-error") : "text-base-content/40"}`}>
                  {hasPositions ? formatCurrencyCompact(metrics.netYield30d) : "—"}
                </span>
              </div>
              <div className="flex flex-col items-center py-1">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">Net APY</span>
                <span className={`font-mono text-xs font-bold tabular-nums ${!hasPositions || metrics.netApyPercent == null ? "text-base-content/40" : metrics.netApyPercent >= 0 ? "text-success" : "text-error"}`}>
                  {hasPositions && metrics.netApyPercent != null ? formatSignedPercent(metrics.netApyPercent) : "—"}
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
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/logos/default.svg";
                  }}
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
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${hasPositions ? (metrics.netBalance >= 0 ? "text-success" : "text-error") : "text-base-content/40"}`}>
                  {hasPositions ? formatCurrencyCompact(metrics.netBalance) : "—"}
                </span>
              </div>

              {/* 30D Yield */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">30D Yield</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${hasPositions ? (metrics.netYield30d >= 0 ? "text-success" : "text-error") : "text-base-content/40"}`}>
                  {hasPositions ? formatCurrencyCompact(metrics.netYield30d) : "—"}
                </span>
              </div>

              {/* Net APY */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Net APY</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${!hasPositions || metrics.netApyPercent == null ? "text-base-content/40" : metrics.netApyPercent >= 0 ? "text-success" : "text-error"}`}>
                  {hasPositions && metrics.netApyPercent != null ? formatSignedPercent(metrics.netApyPercent) : "—"}
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
                onClick={(e) => { e.stopPropagation(); setIsMarketsOpen(!isMarketsOpen); }}
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
