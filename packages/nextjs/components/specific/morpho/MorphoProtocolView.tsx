"use client";

import { FC, useState, useMemo, useEffect, useCallback } from "react";
import Image from "next/image";
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

// Health status indicator component matching ProtocolView
const HealthStatus: FC<{ utilizationPercentage: number }> = ({ utilizationPercentage }) => {
  const getColorClasses = () => {
    if (utilizationPercentage < 50) return { bar: "bg-success", text: "text-success", glow: "shadow-success/30" };
    if (utilizationPercentage < 70) return { bar: "bg-warning", text: "text-warning", glow: "shadow-warning/30" };
    return { bar: "bg-error", text: "text-error", glow: "shadow-error/30" };
  };
  const colors = getColorClasses();

  return (
    <>
      <div className="hidden sm:flex items-center gap-2.5">
        <div className="w-24 h-1.5 bg-base-300/60 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full transition-all duration-500 shadow-sm ${colors.glow}`}
            style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-mono font-semibold tabular-nums ${colors.text}`}>
          {utilizationPercentage.toFixed(0)}%
        </span>
      </div>
      <span className={`sm:hidden text-sm font-mono font-bold tabular-nums ${colors.text}`}>
        {utilizationPercentage.toFixed(0)}%
      </span>
    </>
  );
};

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

  // Listen for transaction completion to trigger fast refresh
  useEffect(() => {
    if (!hasLoadedOnce || marketsWithPositions.length === 0) return;

    const handleTxCompleted = () => {
      // Small delay to ensure transaction is mined
      setTimeout(() => {
        refetchPositions();
      }, 2000);
    };

    window.addEventListener("txCompleted", handleTxCompleted);
    return () => {
      window.removeEventListener("txCompleted", handleTxCompleted);
    };
  }, [hasLoadedOnce, marketsWithPositions.length, refetchPositions]);

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

  const formatSignedPercentage = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  };

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
    <div className={`w-full flex flex-col hide-scrollbar ${isCollapsed ? 'p-1' : 'p-3 space-y-2'}`}>
      {/* Protocol Header Card - matching ProtocolView exactly */}
      <div
        className="card bg-base-200/40 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl border border-base-300/50 cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="card-body px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {/* Protocol name + icon */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-2 flex items-center justify-center shadow-sm ring-1 ring-base-300/30">
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
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Protocol</span>
                <span className="text-base font-bold tracking-tight">Morpho Blue</span>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-10 bg-gradient-to-b from-transparent via-base-300 to-transparent" />

            {/* Stats - spread evenly across available space */}
            <div className="flex-1 flex flex-wrap items-center justify-around gap-y-3">
              {/* Net Balance */}
              <div className="group flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Balance</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${hasPositions ? (metrics.netBalance >= 0 ? "text-success" : "text-error") : "text-base-content/40"}`}>
                  {hasPositions ? formatCurrencyCompact(metrics.netBalance) : "—"}
                </span>
              </div>

              {/* 30D Yield */}
              <div className="hidden min-[480px]:flex group flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">30D Yield</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${hasPositions ? (metrics.netYield30d >= 0 ? "text-success" : "text-error") : "text-base-content/40"}`}>
                  {hasPositions ? formatCurrencyCompact(metrics.netYield30d) : "—"}
                </span>
              </div>

              {/* Net APY */}
              <div className="hidden min-[400px]:flex group flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Net APY</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${!hasPositions || metrics.netApyPercent == null ? "text-base-content/40" : metrics.netApyPercent >= 0 ? "text-success" : "text-error"}`}>
                  {hasPositions && metrics.netApyPercent != null ? formatSignedPercentage(metrics.netApyPercent) : "—"}
                </span>
              </div>

              {/* Utilization */}
              <div className="group/util flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">
                  <span className="hidden sm:inline">Utilization</span>
                  <span className="sm:hidden">LTV</span>
                </span>
                {hasPositions ? (
                  <HealthStatus utilizationPercentage={metrics.avgUtilization} />
                ) : (
                  <span className="text-sm font-mono font-bold tabular-nums text-base-content/40">—</span>
                )}
              </div>
            </div>

            {/* Markets Toggle + Collapse */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-base-300/50">
              <button
                className="btn btn-sm btn-ghost gap-1.5"
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsMarketsOpen(!isMarketsOpen); }}
              >
                <span className="text-[10px] uppercase tracking-widest font-semibold">Markets</span>
                {isMarketsOpen ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
              </button>
              <ChevronDownIcon
                className={`w-5 h-5 text-base-content/40 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Markets Section - expandable */}
      {isMarketsOpen && !isCollapsed && (
        <div className="card bg-base-200/40 shadow-md rounded-xl border border-base-300/50">
          <div className="card-body p-4">
            <MorphoMarketsSection
              markets={markets}
              marketPairs={marketPairs}
              isLoading={isLoadingMarkets}
              chainId={effectiveChainId}
            />
          </div>
        </div>
      )}

      {/* Positions Container - collapsible */}
      {!isCollapsed && (
        <div className="card bg-base-200/40 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl border border-base-300/50">
          <div className="card-body p-4">
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
          </div>
        </div>
      )}
    </div>
  );
};
