"use client";

import { FC, useState, useMemo, useEffect, ReactNode, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import {
  useEulerLendingPositions,
  useEulerVaults,
} from "~~/hooks/useEulerLendingPositions";
import { EulerMarketsSection } from "./EulerMarketsSection";
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
    hasLoadedOnce,
  } = useEulerLendingPositions(effectiveChainId, connectedAddress);

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

      {/* Positions would go here - for now just show markets */}
      {/* TODO: Add EulerPositionsSection when positions are fetched */}
    </div>
  );
};
