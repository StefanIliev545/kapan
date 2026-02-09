"use client";

import { FC, useState, useMemo, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
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
import { useExternalYields, hasExternalYield, type ExternalYield } from "~~/hooks/useExternalYields";
import { BaseProtocolHeader, type HeaderMetric } from "../common";
import { useTxCompletedListenerDelayed } from "~~/hooks/common";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { MetricColors } from "~~/utils/protocolMetrics";

/** Metrics computed from user positions */
interface PositionMetrics {
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  positionCount: number;
}

/** Default metrics when no positions exist */
const EMPTY_METRICS: PositionMetrics = {
  netBalance: 0,
  netYield30d: 0,
  netApyPercent: null,
  positionCount: 0,
};

/**
 * Get the external yield for a given collateral asset (PT tokens, syrupUSDC, etc.).
 * Returns 0 if the collateral has no external yield data.
 */
function getExternalTokenYield(
  collateralSymbol: string,
  collateralAddress: string,
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined
): number {
  if (!hasExternalYield(collateralSymbol)) {
    return 0;
  }
  const externalYield = findYield(collateralAddress, collateralSymbol);
  return externalYield?.fixedApy ?? 0;
}

/**
 * Build supplied positions array from rows.
 * Collateral in Morpho doesn't earn yield (0% APY) UNLESS it has external yield (PT token, syrupUSDC, etc.).
 */
function buildSuppliedPositions(
  rows: MorphoPositionRow[],
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined
): Array<{ balance: number; currentRate: number }> {
  return rows.map((row) => {
    const collateralAddr = row.market.collateralAsset?.address?.toLowerCase() || "";
    const currentRate = getExternalTokenYield(row.collateralSymbol, collateralAddr, findYield);
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
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined
): PositionMetrics {
  if (!rows || rows.length === 0) {
    return EMPTY_METRICS;
  }

  const suppliedPositions = buildSuppliedPositions(rows, findYield);
  const borrowedPositions = buildBorrowedPositions(rows);
  const yieldMetrics = calculateNetYieldMetrics(suppliedPositions, borrowedPositions);

  return {
    netBalance: yieldMetrics.netBalance,
    netYield30d: yieldMetrics.netYield30d,
    netApyPercent: yieldMetrics.netApyPercent,
    positionCount: rows.length,
  };
}

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

  // Fetch external yields (Pendle PT tokens, Maple syrup tokens, etc.) for APY display
  const { findYield } = useExternalYields(effectiveChainId);

  // Extract markets where user has positions for fast refresh
  const marketsWithPositions = useMemo(() => {
    if (apiRows.length === 0) {
      return [];
    }
    return apiRows.map(row => row.market);
  }, [apiRows]);

  // Use refresh hook for fast updates after transactions
  const refreshEnabled = hasLoadedOnce && marketsWithPositions.length > 0;
  const { rows: refreshedRows, isFetching: isRefreshing, isLoading: isRefreshLoading, refetch: refetchPositions } = useMorphoPositionsRefresh(
    marketsWithPositions,
    effectiveChainId,
    refreshEnabled // Only enable after initial load
  );

  // Listen for transaction completion to trigger fast refresh (with delay to ensure tx is mined)
  useTxCompletedListenerDelayed(
    refetchPositions,
    2000,
    refreshEnabled
  );

  // Prioritize on-chain data over API data
  // The API (GraphQL) lags, so once on-chain query completes, trust it even if empty
  const rows = useMemo(() => {
    // If refresh is enabled and has completed (not loading/fetching), trust on-chain result
    // This ensures that if on-chain shows no position but API does, we show no position
    if (refreshEnabled && !isRefreshLoading && !isRefreshing && refreshedRows.length > 0) {
      return refreshedRows;
    }
    // Fall back to API data before on-chain query completes or if on-chain returned empty
    // (avoids flash of "no positions" while on-chain data is loading)
    return apiRows;
  }, [refreshedRows, apiRows, isRefreshing, isRefreshLoading, refreshEnabled]);

  // Compute totals and metrics using extracted helper
  const metrics = useMemo(
    () => calculatePositionMetrics(rows, findYield),
    [rows, findYield]
  );

  // Report totals to global state for dashboard metrics
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce) {
      return;
    }

    const totalSupplied = rows.reduce((sum, row) => sum + row.collateralBalanceUsd, 0);
    const totalBorrowed = rows.reduce((sum, row) => sum + row.borrowBalanceUsd, 0);

    setProtocolTotals("Morpho", totalSupplied, totalBorrowed);
  }, [hasLoadedOnce, rows, setProtocolTotals, effectiveChainId]);

  const hasPositions = rows.length > 0;

  // Auto-expand when positions are found, stay collapsed when empty
  useEffect(() => {
    // Wait for initial load to complete
    if (!hasLoadedOnce) {
      return;
    }

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
  // Also expand protocol if collapsed when opening markets
  const toggleMarketsOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMarketsOpen(prev => {
      const newState = !prev;
      // If opening markets and protocol is collapsed, expand it
      if (newState && isCollapsed) {
        setIsCollapsed(false);
      }
      return newState;
    });
  }, [isCollapsed]);

  // Build metrics array for the header
  const headerMetrics: HeaderMetric[] = useMemo(() => [
    { label: "Balance", value: metrics.netBalance, type: "currency" },
    { label: "30D Yield", mobileLabel: "30D", value: metrics.netYield30d, type: "currency" },
    { label: "Net APY", value: metrics.netApyPercent, type: "apy" },
    {
      label: "Positions",
      value: metrics.positionCount,
      type: "custom",
      customRender: (hasData: boolean) => (
        <span className={`font-mono text-xs font-bold tabular-nums ${hasData ? "text-base-content" : MetricColors.MUTED}`}>
          {hasData ? metrics.positionCount : "\u2014"}
        </span>
      ),
    },
  ], [metrics]);

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 py-2 sm:p-3'}`}>
      {/* Protocol Header */}
      <BaseProtocolHeader
        protocolName="Morpho Blue"
        protocolIcon="/logos/morpho.svg"
        protocolUrl="https://app.morpho.org"
        isCollapsed={isCollapsed}
        isMarketsOpen={isMarketsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={toggleMarketsOpen}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

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
          findYield={findYield}
        />
      </CollapsibleSection>
    </div>
  );
};
