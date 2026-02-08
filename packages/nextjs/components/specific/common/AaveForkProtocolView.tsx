"use client";

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { Cog6ToothIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { ProtocolPosition } from "../../ProtocolView";
import { SupplyPosition } from "../../SupplyPosition";
import { BorrowPosition } from "../../BorrowPosition";
import { EModeToggle } from "../aave/EModeToggle";
import { LTVAutomationModal } from "../../modals/LTVAutomationModal";
import { TokenSelectModal } from "../../modals/TokenSelectModal";
import { MultiplyEvmModal } from "../../modals/MultiplyEvmModal";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { BaseProtocolHeader, type HeaderMetric } from "./BaseProtocolHeader";
import { CrossTopologyMarketsSection } from "./CrossTopologyMarketsSection";
import { CrossPositionLayout } from "~~/components/positions/CrossPositionLayout";
import {
  UtilizationWithTooltip,
  UtilizationMobile,
  calculateUtilizationMetrics,
  type CollateralBreakdownItem,
} from "./UtilizationTooltip";
import type { SwapAsset } from "../../modals/SwapModalShell";
import type { TokenPosition } from "~~/types/positions";
import { MetricColors } from "~~/utils/protocolMetrics";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { useAaveLikeLendingPositions, type AaveLikeViewContractName } from "~~/hooks/useAaveLikeLendingPositions";
import { useAavePositionGroups } from "~~/hooks/adapters/useAavePositionGroups";
import { useGatewayWithRiskParams, type ViewGatewayContractName } from "~~/hooks/useGatewayContract";
import { useAaveLikeEMode, type AaveLikeWriteContractName } from "~~/hooks/useAaveEMode";
import { useAaveReserveConfigs } from "~~/hooks/usePredictiveLtv";
import { usePTEnhancedApyMaps } from "~~/hooks/usePendlePTYields";
import { useAccount } from "wagmi";
import { useModal } from "~~/hooks/useModal";
import { useADLContracts } from "~~/hooks/useADLOrder";
import { useActiveADL, formatLtvPercent } from "~~/hooks/useConditionalOrders";
import { LoadingSpinner } from "~~/components/common/Loading";
import { AddButton } from "~~/components/common/AddButton";
import { PositionManager } from "~~/utils/position";
import type { Address } from "viem";

// ── Config types ────────────────────────────────────────────────────

export interface AaveForkProtocolConfig {
  protocolName: string;
  protocolIcon: string;
  /** URL to the protocol's dapp (makes header name clickable) */
  protocolUrl?: string;
  viewContractName: AaveLikeViewContractName;
  writeContractName: AaveLikeWriteContractName;
}

export interface AaveForkProtocolViewProps {
  chainId?: number;
  enabledFeatures?: { swap?: boolean; move?: boolean };
  config: AaveForkProtocolConfig;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Convert ProtocolPosition to SwapAsset format for ADL / close / swap modals */
function positionToSwapAsset(pos: ProtocolPosition): SwapAsset {
  return {
    symbol: pos.name,
    address: pos.tokenAddress as `0x${string}`,
    decimals: pos.tokenDecimals || 18,
    rawBalance: pos.tokenBalance || 0n,
    balance: Number(pos.tokenBalance || 0n) / 10 ** (pos.tokenDecimals || 18),
    icon: pos.icon,
    price: pos.tokenPrice,
    usdValue: pos.tokenPrice
      ? (Number(pos.tokenBalance || 0n) / 10 ** (pos.tokenDecimals || 18)) * (Number(pos.tokenPrice) / 1e8)
      : undefined,
  };
}

// ── Metrics ─────────────────────────────────────────────────────────

interface PositionMetrics {
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  totalSupplied: number;
  totalBorrowed: number;
}

const EMPTY_METRICS: PositionMetrics = {
  netBalance: 0,
  netYield30d: 0,
  netApyPercent: null,
  totalSupplied: 0,
  totalBorrowed: 0,
};

// ── Main component ──────────────────────────────────────────────────

/**
 * Shared component for Aave-fork protocol views (Aave, Spark, ZeroLend).
 *
 * Uses BaseProtocolHeader + CrossPositionLayout pattern with SupplyPosition
 * and BorrowPosition for position rendering. Keeps E-Mode and ADL support.
 * Includes utilization bar with hover tooltip, and Add Supply/Loop/Borrow buttons.
 */
export const AaveForkProtocolView: FC<AaveForkProtocolViewProps> = ({ chainId, config }) => {
  const { protocolName, protocolIcon, protocolUrl, viewContractName, writeContractName } = config;

  const { address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const adlModal = useModal();
  const supplySelectModal = useModal();
  const borrowSelectModal = useModal();
  const multiplyModal = useModal();

  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Reset state on chain change
  useEffect(() => {
    setIsCollapsed(true);
    setIsMarketsOpen(false);
  }, [chainId]);

  // ── Data fetching ──────────────────────────────────────────────
  const { suppliedPositions, borrowedPositions, hasLoadedOnce } = useAaveLikeLendingPositions(
    viewContractName,
    chainId,
  );

  // ── Risk parameters ────────────────────────────────────────────
  const { ltvBps, effectiveLltvBps } = useGatewayWithRiskParams(viewContractName as ViewGatewayContractName, chainId);

  // ── E-Mode ─────────────────────────────────────────────────────
  const { userEMode, userEModeId } = useAaveLikeEMode(chainId, viewContractName, writeContractName);

  const handleEModeChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // ── ADL ────────────────────────────────────────────────────────
  const { isSupported: isADLSupported } = useADLContracts(chainId || 1);
  const { hasActiveADL, activeADL, triggerLtvBps, targetLtvBps } = useActiveADL({
    protocolName,
    chainId: chainId || 1,
  });

  // ── Position groups ────────────────────────────────────────────
  const positionGroups = useAavePositionGroups(
    "aave",
    chainId || 1,
    suppliedPositions,
    borrowedPositions,
  );

  const positionGroup = positionGroups[0] ?? null; // Cross-topology = one group

  // ── Derived data ───────────────────────────────────────────────
  const activeSupply = useMemo(
    () => suppliedPositions.filter(p => p.tokenBalance && p.tokenBalance > 0n),
    [suppliedPositions],
  );
  const activeDebt = useMemo(
    () => borrowedPositions.filter(p => p.tokenBalance && p.tokenBalance > 0n),
    [borrowedPositions],
  );

  const hasDebt = activeDebt.length > 0;
  const hasCollateral = activeSupply.length > 0;
  const hasPositions = hasCollateral || hasDebt;

  // Active collateral assets for position modals (swap, close, ADL)
  const collateralAssets: SwapAsset[] = useMemo(
    () => activeSupply.map(positionToSwapAsset),
    [activeSupply],
  );

  // All available market assets for the multiply modal (loop works without existing positions)
  const allSupplyAssets: SwapAsset[] = useMemo(
    () => suppliedPositions.map(positionToSwapAsset),
    [suppliedPositions],
  );
  const allBorrowAssets: SwapAsset[] = useMemo(
    () => borrowedPositions.map(positionToSwapAsset),
    [borrowedPositions],
  );
  const debtOptions: SwapAsset[] = useMemo(
    () => allBorrowAssets.length > 0 ? allBorrowAssets : allSupplyAssets,
    [allBorrowAssets, allSupplyAssets],
  );

  // APY maps for multiply modal - PT tokens get Pendle fixed yields automatically
  const apyMapTokens = useMemo(() =>
    suppliedPositions.map(p => ({
      address: p.tokenAddress,
      symbol: p.name,
      supplyRate: p.currentRate,
      borrowRate: borrowedPositions.find(b => b.tokenAddress.toLowerCase() === p.tokenAddress.toLowerCase())?.currentRate || 0,
    })),
    [suppliedPositions, borrowedPositions],
  );
  const { supplyApyMap, borrowApyMap } = usePTEnhancedApyMaps(chainId, apyMapTokens);

  // Compute metrics
  const metrics = useMemo((): PositionMetrics => {
    if (!hasPositions) return EMPTY_METRICS;
    const yieldMetrics = calculateNetYieldMetrics(activeSupply, activeDebt);
    return {
      netBalance: yieldMetrics.netBalance,
      netYield30d: yieldMetrics.netYield30d,
      netApyPercent: yieldMetrics.netApyPercent,
      totalSupplied: yieldMetrics.totalSupplied,
      totalBorrowed: yieldMetrics.totalBorrowed,
    };
  }, [activeSupply, activeDebt, hasPositions]);

  // NOTE: Protocol totals are reported by useAaveLikeLendingPositions hook
  // via useProtocolTotalsFromPositions — do NOT duplicate here.

  // Total USD values for ADL modal (8-decimal Chainlink format)
  const totalCollateralUsd = useMemo(
    () => collateralAssets.reduce((sum, c) => sum + BigInt(Math.round((c.usdValue || 0) * 1e8)), 0n),
    [collateralAssets],
  );
  const totalDebtUsd = useMemo(
    () => activeDebt.reduce((sum, d) => {
      const balance = Number(d.tokenBalance || 0n) / 10 ** (d.tokenDecimals || 18);
      const price = d.tokenPrice ? Number(d.tokenPrice) / 1e8 : 0;
      return sum + BigInt(Math.round(balance * price * 1e8));
    }, 0n),
    [activeDebt],
  );
  const totalDebtUsdNumber = useMemo(
    () => activeDebt.reduce((sum, p) => sum + Math.abs(p.balance), 0),
    [activeDebt],
  );

  const selectedDebt = activeDebt[0]; // First debt for ADL modal

  // ── Utilization & collateral breakdown ────────────────────────
  const { utilizationPercentage } = useMemo(
    () => calculateUtilizationMetrics(metrics.totalSupplied, metrics.totalBorrowed, ltvBps, effectiveLltvBps),
    [metrics.totalSupplied, metrics.totalBorrowed, ltvBps, effectiveLltvBps],
  );

  // Fetch per-token reserve configs for ALL supply positions (needed for both tooltip and loop filtering)
  const allSupplyTokenAddresses = useMemo(
    () => suppliedPositions.map(p => p.tokenAddress as Address),
    [suppliedPositions],
  );
  const { configs: reserveConfigs } = useAaveReserveConfigs(
    allSupplyTokenAddresses,
    chainId,
    allSupplyTokenAddresses.length > 0,
  );

  const collateralBreakdown = useMemo((): CollateralBreakdownItem[] => {
    if (reserveConfigs.length === 0) return [];

    const totalCollateral = activeSupply.reduce((sum, p) => sum + p.balance, 0);
    return activeSupply
      .filter(p => p.balance > 0)
      .map(position => {
        const config = reserveConfigs.find(
          c => c.token.toLowerCase() === position.tokenAddress.toLowerCase(),
        );
        return {
          name: position.name,
          icon: position.icon,
          valueUsd: position.balance,
          ltvBps: config ? Number(config.ltv) : 0,
          lltvBps: config ? Number(config.liquidationThreshold) : 0,
          weightPct: totalCollateral > 0 ? (position.balance / totalCollateral) * 100 : 0,
        };
      });
  }, [reserveConfigs, activeSupply]);

  // ── Loop collaterals: only assets with LTV > 0 can be used as collateral in loops ──
  const loopCollaterals: SwapAsset[] = useMemo(() => {
    if (reserveConfigs.length === 0) return allSupplyAssets; // fallback before configs load
    return allSupplyAssets.filter(asset => {
      const config = reserveConfigs.find(
        c => c.token.toLowerCase() === asset.address.toLowerCase(),
      );
      return config && config.ltv > 0n;
    });
  }, [allSupplyAssets, reserveConfigs]);

  const canLoop = loopCollaterals.length > 0 && debtOptions.length > 0;
  const loopTitle = canLoop
    ? "Build a flash-loan loop"
    : "No markets available for looping";

  // ── Position manager for borrow/deposit modals (correct LTV display) ──
  const borrowPosition = useMemo(() => {
    if (metrics.totalSupplied <= 0) return undefined;
    return new PositionManager(
      metrics.totalSupplied,
      metrics.totalBorrowed,
      Number(ltvBps > 0n ? ltvBps : 7500n),
    );
  }, [metrics.totalSupplied, metrics.totalBorrowed, ltvBps]);

  // ── Auto-expand on positions ───────────────────────────────────
  useEffect(() => {
    if (!hasLoadedOnce) return;
    setIsCollapsed(!hasPositions);
  }, [hasLoadedOnce, hasPositions]);

  // ── Event handlers ─────────────────────────────────────────────
  const toggleCollapsed = useCallback(() => setIsCollapsed(prev => !prev), []);
  const toggleMarketsOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMarketsOpen(prev => {
      const newState = !prev;
      if (newState && isCollapsed) setIsCollapsed(false);
      return newState;
    });
  }, [isCollapsed]);

  // ── Header metrics ─────────────────────────────────────────────
  const headerMetrics: HeaderMetric[] = useMemo(() => [
    { label: "Balance", value: metrics.netBalance, type: "currency" },
    { label: "30D Yield", mobileLabel: "30D", value: metrics.netYield30d, type: "currency" },
    { label: "Net APY", value: metrics.netApyPercent, type: "apy" },
    {
      label: "Utilization",
      value: null,
      type: "custom",
      customRender: (hasData: boolean) => {
        if (!hasData || !hasDebt) {
          return <span className={`font-mono text-xs font-bold tabular-nums ${MetricColors.MUTED}`}>{"\u2014"}</span>;
        }
        return (
          <>
            {/* Desktop: bar + tooltip */}
            <div className="hidden sm:block">
              <UtilizationWithTooltip
                utilizationPercentage={utilizationPercentage}
                collateralBreakdown={collateralBreakdown}
                totalDebtUsd={totalDebtUsdNumber}
              />
            </div>
            {/* Mobile: just percentage */}
            <div className="sm:hidden">
              <UtilizationMobile utilizationPercentage={utilizationPercentage} />
            </div>
          </>
        );
      },
    },
  ], [metrics, hasDebt, utilizationPercentage, collateralBreakdown, totalDebtUsdNumber]);

  // ── Positions toolbar (E-Mode + ADL) ─────────────────────────────
  const positionsToolbar = useMemo(() => {
    if (!address) return null;
    return (
      <div className="flex items-center justify-end gap-2 px-3 pb-2">
        <EModeToggle
          chainId={chainId}
          onEModeChanged={handleEModeChanged}
          viewContractName={viewContractName}
          writeContractName={writeContractName}
        />
        {userEModeId > 0 && userEMode && (
          <span className="text-primary whitespace-nowrap text-xs">
            {userEMode.label} (LTV {(userEMode.ltv / 100).toFixed(0)}%)
          </span>
        )}
        {isADLSupported && (
          <button
            onClick={(e) => { e.stopPropagation(); adlModal.open(); }}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors ${
              hasActiveADL
                ? "text-success hover:text-success/80 hover:bg-success/10"
                : "text-base-content/50 hover:text-base-content hover:bg-base-200"
            }`}
            title={
              hasActiveADL && triggerLtvBps && targetLtvBps
                ? `ADL Active: Triggers at ${formatLtvPercent(triggerLtvBps)} → ${formatLtvPercent(targetLtvBps)}`
                : "Auto-Deleverage Protection"
            }
            type="button"
          >
            {hasActiveADL ? <ShieldCheckIcon className="size-4" /> : <Cog6ToothIcon className="size-4" />}
            <span>Automate</span>
            {hasActiveADL && <span className="bg-success size-2 rounded-full" />}
          </button>
        )}
      </div>
    );
  }, [address, chainId, viewContractName, writeContractName, handleEModeChanged,
    userEModeId, userEMode, isADLSupported, adlModal,
    hasActiveADL, triggerLtvBps, targetLtvBps]);

  // ── Collateral footer (Add Supply + Add Loop) ─────────────────
  const collateralFooter = useMemo(() => {
    if (!address) return null;
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AddButton onClick={supplySelectModal.open} label="Add Supply" />
        <AddButton
          onClick={multiplyModal.open}
          label="Add Loop"
          variant="secondary"
          disabled={!canLoop}
          title={loopTitle}
        />
      </div>
    );
  }, [address, supplySelectModal, multiplyModal, canLoop, loopTitle]);

  // ── Debt footer (Add Borrow) ──────────────────────────────────
  const debtFooter = useMemo(() => {
    if (!address) return null;
    return (
      <div>
        <AddButton onClick={borrowSelectModal.open} label="Add Borrow" />
      </div>
    );
  }, [address, borrowSelectModal]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div key={refreshKey} className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? "p-1" : "space-y-2 py-2 sm:p-3"}`}>
      {/* Protocol Header */}
      <BaseProtocolHeader
        protocolName={protocolName}
        protocolIcon={protocolIcon}
        protocolUrl={protocolUrl}
        isCollapsed={isCollapsed}
        isMarketsOpen={isMarketsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={toggleMarketsOpen}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

      {/* Markets Section - read-only rate display */}
      <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
        <CrossTopologyMarketsSection
          suppliedPositions={suppliedPositions}
          borrowedPositions={borrowedPositions}
          reserveConfigs={reserveConfigs}
        />
      </CollapsibleSection>

      {/* Positions Section */}
      {!isCollapsed && (
        <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
          <div className="card-body p-4">
            {!hasLoadedOnce ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : hasPositions && positionGroup ? (
              <CrossPositionLayout
                group={positionGroup}
                header={positionsToolbar}
                collateralFooter={collateralFooter}
                debtFooter={debtFooter}
                renderCollateral={(token: TokenPosition) => {
                  const pos = activeSupply.find(
                    p => p.tokenAddress.toLowerCase() === token.address.toLowerCase(),
                  );
                  if (!pos) return null;
                  return (
                    <SupplyPosition
                      key={pos.tokenAddress}
                      {...pos}
                      protocolName={protocolName}
                      networkType="evm"
                      chainId={chainId}
                      adlActive={
                        activeADL?.triggerParams?.collateralToken?.toLowerCase() === pos.tokenAddress.toLowerCase()
                      }
                    />
                  );
                }}
                renderDebt={(token: TokenPosition) => {
                  const pos = activeDebt.find(
                    p => p.tokenAddress.toLowerCase() === token.address.toLowerCase(),
                  );
                  if (!pos) return null;
                  return (
                    <BorrowPosition
                      key={pos.tokenAddress}
                      {...pos}
                      protocolName={protocolName}
                      networkType="evm"
                      chainId={chainId}
                      position={borrowPosition}
                      availableAssets={collateralAssets}
                      collateralValue={collateralAssets.reduce((s, c) => s + (c.usdValue || 0), 0)}
                      adlProtected={
                        activeADL?.triggerParams?.debtToken?.toLowerCase() === pos.tokenAddress.toLowerCase()
                      }
                    />
                  );
                }}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-base-content/40 py-4 text-center text-sm">
                  No active positions
                </p>
                {collateralFooter}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Token Select Modal (Supply) */}
      <TokenSelectModal
        isOpen={supplySelectModal.isOpen}
        onClose={supplySelectModal.close}
        tokens={suppliedPositions}
        protocolName={protocolName}
        isBorrow={false}
        position={borrowPosition}
        chainId={chainId}
      />

      {/* Token Select Modal (Borrow) */}
      <TokenSelectModal
        isOpen={borrowSelectModal.isOpen}
        onClose={borrowSelectModal.close}
        tokens={borrowedPositions}
        protocolName={protocolName}
        isBorrow={true}
        position={borrowPosition}
        chainId={chainId}
      />

      {/* Multiply (Loop) Modal */}
      {multiplyModal.isOpen && (
        <MultiplyEvmModal
          isOpen={multiplyModal.isOpen}
          onClose={multiplyModal.close}
          protocolName={protocolName}
          chainId={chainId || 1}
          collaterals={loopCollaterals}
          debtOptions={debtOptions}
          maxLtvBps={ltvBps > 0n ? ltvBps : 8000n}
          lltvBps={effectiveLltvBps > 0n ? effectiveLltvBps : 8500n}
          supplyApyMap={supplyApyMap}
          borrowApyMap={borrowApyMap}
          eMode={userEMode}
        />
      )}

      {/* ADL Automation Modal */}
      {selectedDebt && (
        <LTVAutomationModal
          isOpen={adlModal.isOpen}
          onClose={adlModal.close}
          protocolName={protocolName}
          chainId={chainId || 1}
          currentLtvBps={Number(ltvBps)}
          liquidationLtvBps={Number(effectiveLltvBps)}
          collateralTokens={collateralAssets}
          debtToken={{
            address: selectedDebt.tokenAddress,
            symbol: selectedDebt.name,
            decimals: selectedDebt.tokenDecimals || 18,
            balance: selectedDebt.tokenBalance,
          }}
          totalCollateralUsd={totalCollateralUsd}
          totalDebtUsd={totalDebtUsd}
        />
      )}
    </div>
  );
};

export default AaveForkProtocolView;
