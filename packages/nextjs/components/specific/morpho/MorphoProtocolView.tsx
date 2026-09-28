"use client";

import { formatUnits } from "viem";
import { useMidnightPositions } from "~~/hooks/midnight/useMidnight";
import { MidnightPositionsSection } from "./midnight/MidnightPositionsSection";
import { MidnightMarketsSection } from "./midnight/MidnightMarketsSection";
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
  // totalSupplied / totalBorrowed are propagated here so the dashboard
  // reporter and the in-row header read from the SAME numbers. Previously
  // the reporter summed `rows.reduce(...collateralBalanceUsd)` directly
  // while the header used `calculateNetYieldMetrics` (which filters
  // rows without active debt and skips negative supply balances). That
  // drift is the source of the ~$400 discrepancy the dashboard showed.
  totalSupplied: number;
  totalBorrowed: number;
}

/** Default metrics when no positions exist */
const EMPTY_METRICS: PositionMetrics = {
  netBalance: 0,
  netYield30d: 0,
  netApyPercent: null,
  positionCount: 0,
  totalSupplied: 0,
  totalBorrowed: 0,
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
    totalSupplied: yieldMetrics.totalSupplied,
    totalBorrowed: yieldMetrics.totalBorrowed,
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
  const [showLowLiquidity, setShowLowLiquidity] = useState(false);
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
    isLoadingPositions,
    hasLoadedOnce,
    isUpdating,
  } = useMorphoLendingPositions(effectiveChainId, connectedAddress);

  const { marketPairs, markets: browseMarkets, isLoading: isLoadingBrowseMarkets } = useMorphoMarkets(effectiveChainId, undefined, showLowLiquidity);

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

  const fixed = useMidnightPositions(chainId, connectedAddress);

  // Compute totals and metrics using extracted helper
  const metrics = useMemo(
    () => {
      const variable = calculatePositionMetrics(rows, findYield);
      const supplies = buildSuppliedPositions(rows, findYield);
      const borrows = buildBorrowedPositions(rows);
      for (const row of fixed.rows) {
        const loan = fixed.tokens[row.loan_token.toLowerCase()];
        const loanPrice = fixed.prices[row.loan_token.toLowerCase()] ?? 0;
        borrows.push({balance: Number(formatUnits(BigInt(row.debt), loan.decimals)) * loanPrice, currentRate: 0});
        for (const c of row.collaterals) {
          const token = fixed.tokens[c.token.toLowerCase()];
          supplies.push({balance: Number(formatUnits(BigInt(c.amount), token.decimals)) * (fixed.prices[c.token.toLowerCase()] ?? 0), currentRate: getExternalTokenYield(token.symbol, token.address, findYield)});
        }
      }
      // Fixed interest is already included in face debt. Do not charge it again in projected yield.
      return {...variable, ...calculateNetYieldMetrics(supplies, borrows), positionCount: rows.length + fixed.rows.length};
    },
    [rows, findYield, fixed.rows, fixed.tokens, fixed.prices]
  );

  // Report totals to global state for dashboard metrics
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce && !fixed.isSuccess) {
      return;
    }

    // Single source of truth with the header: both read `totalSupplied` /
    // `totalBorrowed` off the same `metrics` object, computed by
    // `calculateNetYieldMetrics`. Header now equals dashboard, by
    // construction.
    setProtocolTotals("Morpho", metrics.totalSupplied, metrics.totalBorrowed);
  }, [hasLoadedOnce, fixed.isSuccess, metrics.totalSupplied, metrics.totalBorrowed, setProtocolTotals, effectiveChainId]);

  const hasPositions = rows.length > 0 || fixed.rows.length > 0;

  // Auto-expand when positions are found, stay collapsed when empty
  useEffect(() => {
    // Wait for initial load to complete
    if (!hasLoadedOnce && !fixed.isSuccess) {
      return;
    }

    if (hasPositions) {
      setIsCollapsed(false); // Expand when positions exist
    } else {
      setIsCollapsed(true); // Stay collapsed when no positions
    }
  }, [hasLoadedOnce, fixed.isSuccess, hasPositions]);

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
        protocolName="Morpho"
        protocolIcon="/logos/morpho.svg"
        protocolUrl="https://app.morpho.org"
        isCollapsed={isCollapsed}
        isMarketsOpen={isMarketsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={toggleMarketsOpen}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

      {fixed.error && isCollapsed && <p role="alert" className="px-3 text-xs text-error">Fixed loans could not be loaded. Expand Morpho to retry.</p>}

      {/* Markets Section - expandable */}
      <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
        <MorphoMarketsSection
          markets={browseMarkets}
          marketPairs={marketPairs}
          isLoading={isLoadingBrowseMarkets}
          chainId={effectiveChainId}
          showLowLiquidity={showLowLiquidity}
          onShowLowLiquidityChange={setShowLowLiquidity}
        />
        <MidnightMarketsSection chainId={chainId} enabled={isMarketsOpen && !isCollapsed} />
      </CollapsibleSection>

      {/* Positions Container - collapsible with animation */}
      <CollapsibleSection isOpen={!isCollapsed}>
        {(rows.length > 0 || fixed.rows.length === 0) && <MorphoPositionsSection
          title="Your Positions"
          rows={rows}
          markets={markets}
          userAddress={connectedAddress}
          hasLoadedOnce={hasLoadedOnce || !isLoadingPositions}
          isUpdating={isUpdating}
          chainId={chainId}
          findYield={findYield}
        />}
        <MidnightPositionsSection key={`${chainId}:${connectedAddress}`} positions={fixed} chainId={chainId} />
      </CollapsibleSection>
    </div>
  );
};
