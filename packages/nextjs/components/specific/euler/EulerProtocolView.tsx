"use client";

import { FC, useState, useMemo, useEffect, ReactNode, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import {
  useEulerLendingPositions,
  useEulerVaults,
  type EulerPositionGroupWithBalances,
} from "~~/hooks/useEulerLendingPositions";
import { EulerMarketsSection } from "./EulerMarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";
import { useTokenPrices } from "~~/hooks/useTokenPrice";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { useGlobalState } from "~~/services/store/store";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { HealthStatus } from "../common/HealthStatus";
import { formatSignedPercent } from "../utils";

/**
 * Reusable collapsible section with animated expand/collapse.
 */
interface CollapsibleSectionProps {
  isOpen: boolean;
  children: ReactNode;
}

// Static image error handler
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).src = "/logos/default.svg";
};

// Static animation constants
const COLLAPSE_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };
const COLLAPSE_INITIAL = { opacity: 0, height: 0 };
const COLLAPSE_ANIMATE = { opacity: 1, height: "auto" };

// CSS class constants
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
 * Calculate position metrics from rows
 */
function calculatePositionMetrics(
  rows: { supplyBalanceUsd: number; borrowBalanceUsd: number; supplyApy: number; borrowApy: number; hasDebt: boolean }[]
): PositionMetrics {
  if (!rows || rows.length === 0) {
    return EMPTY_METRICS;
  }

  const suppliedPositions = rows.map(row => ({
    balance: row.supplyBalanceUsd,
    currentRate: row.supplyApy,
  }));

  const borrowedPositions = rows
    .filter(row => row.hasDebt)
    .map(row => ({
      balance: row.borrowBalanceUsd,
      currentRate: row.borrowApy,
    }));

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

/**
 * Display a single position group (1 debt + N collaterals) side by side
 * Uses SupplyPosition for collaterals (left) and BorrowPosition for debt (right)
 */
interface EulerPositionGroupRowProps {
  group: EulerPositionGroupWithBalances;
  chainId: number;
  /** Map of lowercase symbol -> price in raw format (8 decimals) */
  pricesRaw: Record<string, bigint>;
}

const EulerPositionGroupRow: FC<EulerPositionGroupRowProps> = ({ group, chainId, pricesRaw }) => {
  const { debt, collaterals, isMainAccount } = group;

  // Helper to get token icon
  const getIcon = (symbol: string) => {
    if (!symbol || symbol === "???") return "/logos/default.svg";
    return tokenNameToLogo(symbol.toLowerCase());
  };

  // Helper to get token price
  const getPrice = (symbol: string): bigint => {
    if (!symbol || symbol === "???") return 0n;
    return pricesRaw[symbol.toLowerCase()] ?? 0n;
  };

  // Get the borrow vault address (needed for context)
  // Use zero address if no debt - empty string causes ABI encoding errors
  const borrowVaultAddress = debt?.vault.address || "0x0000000000000000000000000000000000000000";

  // Build moveSupport with preselected collaterals for refinance modal
  const moveSupport = useMemo(() => ({
    preselectedCollaterals: collaterals.map((col) => ({
      token: col.vault.asset.address,
      symbol: col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol,
      decimals: col.vault.asset.decimals,
      amount: col.balance,
      maxAmount: col.balance,
      supported: true,
    })),
    // Euler allows multiple collaterals, so don't disable selection
    disableCollateralSelection: false,
  }), [collaterals]);

  return (
    <div className="bg-base-300/30 rounded-lg p-3">
      {/* Sub-account label */}
      {!isMainAccount && (
        <div className="mb-2 text-[10px] font-medium text-base-content/40 uppercase tracking-wider">
          Sub-account
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Left side: Collaterals */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
            Collateral
          </div>
          {collaterals.length === 0 ? (
            <div className="text-sm text-base-content/40 italic">None</div>
          ) : (
            <div className="space-y-2">
              {collaterals.map((col, idx) => {
                const symbol = col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol;
                // Encode Euler context: borrowVault + collateralVault
                const context = encodeEulerContext({
                  borrowVault: borrowVaultAddress,
                  collateralVault: col.vault.address,
                });
                return (
                  <SupplyPosition
                    key={col.vault.address || idx}
                    icon={getIcon(col.vault.asset.symbol)}
                    name={symbol}
                    tokenSymbol={symbol}
                    balance={0}
                    tokenBalance={col.balance}
                    currentRate={(col.vault.supplyApy ?? 0) * 100}
                    tokenAddress={col.vault.asset.address}
                    tokenDecimals={col.vault.asset.decimals}
                    tokenPrice={getPrice(col.vault.asset.symbol)}
                    protocolName="Euler"
                    networkType="evm"
                    chainId={chainId}
                    protocolContext={context}
                    availableActions={{ deposit: true, withdraw: true, move: true, swap: true }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-base-content/10 self-stretch" />
        <div className="sm:hidden h-px bg-base-content/10 w-full" />

        {/* Right side: Debt */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
            Debt
          </div>
          {!debt ? (
            <div className="text-sm text-base-content/40 italic">None</div>
          ) : (() => {
            const debtSymbol = debt.vault.asset.symbol === "???" ? "unknown" : debt.vault.asset.symbol;
            // For debt, use the first collateral vault (or borrow vault itself if no collaterals)
            const primaryCollateralVault = collaterals[0]?.vault.address || debt.vault.address;
            const debtContext = encodeEulerContext({
              borrowVault: debt.vault.address,
              collateralVault: primaryCollateralVault,
            });
            return (
              <BorrowPosition
                icon={getIcon(debt.vault.asset.symbol)}
                name={debtSymbol}
                tokenSymbol={debtSymbol}
                balance={0}
                tokenBalance={debt.balance}
                currentRate={(debt.vault.borrowApy ?? 0) * 100}
                tokenAddress={debt.vault.asset.address}
                tokenDecimals={debt.vault.asset.decimals}
                tokenPrice={getPrice(debt.vault.asset.symbol)}
                protocolName="Euler"
                networkType="evm"
                chainId={chainId}
                protocolContext={debtContext}
                availableActions={{ borrow: true, repay: true, move: true }}
                moveSupport={moveSupport}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
};

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

interface EulerProtocolViewProps {
  chainId?: number;
}

export const EulerProtocolView: FC<EulerProtocolViewProps> = ({
  chainId: propChainId,
}) => {
  const { address: connectedAddress, chainId: walletChainId } = useAccount();
  const chainId = propChainId || walletChainId || 42161; // Default to Arbitrum
  const effectiveChainId = getEffectiveChainId(chainId);

  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Reset collapsed state when chainId changes
  useEffect(() => {
    setIsCollapsed(true);
    setIsMarketsOpen(false);
  }, [effectiveChainId]);

  // Fetch vaults for market display
  const {
    vaults,
    isLoading: isLoadingMarkets,
  } = useEulerVaults(effectiveChainId);

  // Fetch user positions
  const {
    rows,
    enrichedPositionGroups,
    hasLoadedOnce,
    isLoadingPositions,
  } = useEulerLendingPositions(effectiveChainId, connectedAddress);

  // Extract unique token symbols for price fetching
  const tokenSymbols = useMemo(() => {
    const symbols = new Set<string>();
    for (const group of enrichedPositionGroups) {
      if (group.debt?.vault.asset.symbol && group.debt.vault.asset.symbol !== "???") {
        symbols.add(group.debt.vault.asset.symbol);
      }
      for (const col of group.collaterals) {
        if (col.vault.asset.symbol && col.vault.asset.symbol !== "???") {
          symbols.add(col.vault.asset.symbol);
        }
      }
    }
    return Array.from(symbols);
  }, [enrichedPositionGroups]);

  // Fetch token prices
  const { pricesRaw } = useTokenPrices(tokenSymbols, {
    enabled: tokenSymbols.length > 0,
  });

  // Compute metrics
  const metrics = useMemo(
    () => calculatePositionMetrics(rows),
    [rows]
  );

  // Report totals to global state
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce) return;

    const totalSupplied = rows.reduce((sum, row) => sum + row.supplyBalanceUsd, 0);
    const totalBorrowed = rows.reduce((sum, row) => sum + row.borrowBalanceUsd, 0);

    setProtocolTotals("Euler", totalSupplied, totalBorrowed);
  }, [hasLoadedOnce, rows, setProtocolTotals, effectiveChainId]);

  const hasPositions = rows.length > 0;

  // Auto-expand when positions are found
  useEffect(() => {
    if (!hasLoadedOnce) return;

    if (hasPositions) {
      setIsCollapsed(false);
    } else {
      setIsCollapsed(true);
    }
  }, [hasLoadedOnce, hasPositions]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const toggleMarketsOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMarketsOpen(prev => {
      const newState = !prev;
      if (newState && isCollapsed) {
        setIsCollapsed(false);
      }
      return newState;
    });
  }, [isCollapsed]);

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 p-3'}`}>
      {/* Protocol Header Card */}
      <div
        className="card-surface-interactive shadow-lg"
        onClick={toggleCollapsed}
      >
        <div className="card-body p-3 sm:px-5">
          {/* Mobile Layout */}
          <div className="space-y-3 sm:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="token-icon-wrapper-md">
                  <Image
                    src="/logos/euler.svg"
                    alt="Euler icon"
                    width={20}
                    height={20}
                    className="object-contain drop-shadow-sm"
                    onError={handleImageError}
                  />
                </div>
                <span className="text-sm font-bold tracking-tight">Euler</span>
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
                  className={`text-base-content/40 size-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                />
              </div>
            </div>
            {/* Stats grid */}
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

          {/* Desktop Layout */}
          <div className="hidden flex-wrap items-center gap-x-6 gap-y-4 sm:flex">
            <div className="flex items-center gap-3">
              <div className="token-icon-wrapper-lg">
                <Image
                  src="/logos/euler.svg"
                  alt="Euler icon"
                  width={24}
                  height={24}
                  className="object-contain drop-shadow-sm"
                  onError={handleImageError}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-text-xs-semibold">Protocol</span>
                <span className="text-base font-bold tracking-tight">Euler</span>
              </div>
            </div>

            <div className="via-base-300 h-10 w-px bg-gradient-to-b from-transparent to-transparent" />

            <div className="flex flex-1 flex-wrap items-center justify-around gap-y-3">
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Balance</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${getValueColorClass(hasPositions, metrics.netBalance)}`}>
                  {formatMetricValue(hasPositions, metrics.netBalance)}
                </span>
              </div>

              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">30D Yield</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${getValueColorClass(hasPositions, metrics.netYield30d)}`}>
                  {formatMetricValue(hasPositions, metrics.netYield30d)}
                </span>
              </div>

              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Net APY</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${getApyColorClass(hasPositions, metrics.netApyPercent)}`}>
                  {formatApyValue(hasPositions, metrics.netApyPercent)}
                </span>
              </div>

              <div className="group/util hover:bg-base-200/30 flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Utilization</span>
                {hasPositions ? (
                  <HealthStatus utilizationPercentage={metrics.avgUtilization} />
                ) : (
                  <span className="text-base-content/40 font-mono text-sm font-bold tabular-nums">—</span>
                )}
              </div>
            </div>

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
                className={`text-base-content/40 size-5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Markets Section - expandable */}
      <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
        <EulerMarketsSection
          vaults={vaults}
          isLoading={isLoadingMarkets}
          chainId={effectiveChainId}
        />
      </CollapsibleSection>

      {/* Positions Section - grouped by sub-account with collaterals left, debt right */}
      {!isCollapsed && hasPositions && (
        <div className="card bg-base-200/40 border-base-300/50 rounded-xl border shadow-md">
          <div className="card-body p-4">
            {isLoadingPositions && !hasLoadedOnce ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-3">
                {enrichedPositionGroups.map((group, idx) => (
                  <EulerPositionGroupRow key={group.subAccount || idx} group={group} chainId={effectiveChainId} pricesRaw={pricesRaw} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
