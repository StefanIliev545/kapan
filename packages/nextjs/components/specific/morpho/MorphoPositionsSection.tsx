"use client";

import { FC, useState, useCallback, useMemo, memo } from "react";
import { formatUnits } from "viem";
import Image from "next/image";
import type { MorphoPositionRow, MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { PositionManager } from "~~/utils/position";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import formatPercentage from "~~/utils/formatPercentage";
import { encodeMorphoContext, type MorphoMarketContextForEncoding } from "~~/utils/v2/instructionHelpers";
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { ExternalLink } from "lucide-react";
import { Cog6ToothIcon, ShieldCheckIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline";
import {
  formatLtvPercent,
  useConditionalOrders,
  PROTOCOL_IDS,
  decodeMorphoContext,
  ConditionalOrderStatus,
  type ConditionalOrder,
} from "~~/hooks/useConditionalOrders";
import { hasExternalYield, type ExternalYield } from "~~/hooks/useExternalYields";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { formatSignedPercent } from "../utils";
import { CollateralSwapModal } from "~~/components/modals/CollateralSwapModal";
import { DebtSwapEvmModal } from "~~/components/modals/DebtSwapEvmModal";
import { LTVAutomationModal } from "~~/components/modals/LTVAutomationModal";
import { useADLContracts } from "~~/hooks/useADLOrder";
import { useAutoLeverageContracts } from "~~/hooks/useAutoLeverageOrder";
import type { Address } from "viem";

interface MorphoPositionsSectionProps {
  title: string;
  rows: MorphoPositionRow[];
  markets: MorphoMarket[];
  userAddress: string | undefined;
  hasLoadedOnce: boolean;
  isUpdating: boolean;
  chainId: number;
  onBorrowRequest?: (params: { market: MorphoMarket; collateralAddress: string }) => void;
  onDepositRequest?: () => void;
  /** Smart PT yield lookup function that handles bridged tokens */
  findYield?: (address?: string, symbol?: string) => ExternalYield | undefined;
}

// Static image error handler at module level
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).src = "/logos/default.svg";
};

// Static click propagation handler
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// CSS class constants to avoid duplicate string warnings
const TEXT_SUCCESS = "text-success";
const TEXT_ERROR = "text-error";

// Static available actions objects (can be reused across renders)
const SUPPLY_ACTIONS_WITH_MOVE = { deposit: true, withdraw: true, move: true, swap: true } as const;
const SUPPLY_ACTIONS_WITHOUT_MOVE = { deposit: true, withdraw: true, move: false, swap: true } as const;

// ADL info type for position automation status
interface ADLInfo {
  hasActiveADL: boolean;
  hasActiveAutoLev: boolean;
  adlTriggerLtvBps: bigint | undefined;
  adlTargetLtvBps: bigint | undefined;
  isAboveTrigger: boolean;
  isTriggerMet: boolean | undefined;
  autoLevTriggerLtvBps: bigint | undefined;
  autoLevTargetLtvBps: bigint | undefined;
  isBelowAutoLevTrigger: boolean;
  isAutoLevTriggerMet: boolean | undefined;
}

// Stable empty ADL info object to avoid creating new objects on every render
const EMPTY_ADL_INFO: ADLInfo = {
  hasActiveADL: false,
  hasActiveAutoLev: false,
  adlTriggerLtvBps: undefined,
  adlTargetLtvBps: undefined,
  isAboveTrigger: false,
  isTriggerMet: undefined,
  autoLevTriggerLtvBps: undefined,
  autoLevTargetLtvBps: undefined,
  isBelowAutoLevTrigger: false,
  isAutoLevTriggerMet: undefined,
};

// Collateral Swap modal state for a position
interface SwapModalState {
  isOpen: boolean;
  morphoContext: MorphoMarketContextForEncoding | null;
  debtTokenAddress: string;
  debtBalance: bigint; // Current debt balance for proportional calculations
  collateralAddress: string;
  collateralSymbol: string;
  collateralDecimals: number;
  collateralBalance: bigint;
  collateralBalanceUsd: number;
  collateralPrice: bigint; // Price in 1e8 format for SwapAsset compatibility
}

// Debt Swap modal state for a position
interface DebtSwapModalState {
  isOpen: boolean;
  morphoContext: MorphoMarketContextForEncoding | null;
  debtTokenAddress: string;
  debtTokenSymbol: string;
  debtTokenDecimals: number;
  debtBalance: bigint;
  debtBalanceUsd: number;
  debtTokenPrice: bigint;
  collateralTokenAddress: string;
  collateralTokenSymbol: string;
  collateralBalance: bigint;
  collateralDecimals: number;
}

// ADL modal state for a position
interface ADLModalState {
  isOpen: boolean;
  morphoContext: MorphoMarketContextForEncoding | null;
  currentLtvBps: number;
  liquidationLtvBps: number;
  collateralTokenAddress: string;
  collateralTokenSymbol: string;
  collateralDecimals: number;
  collateralBalance: bigint;
  collateralBalanceUsd: number;
  collateralPrice: bigint;
  debtTokenAddress: string;
  debtTokenSymbol: string;
  debtTokenDecimals: number;
  debtBalanceUsd: number;
}

// Memoized position row component to avoid recreating inline objects on each render
interface MorphoPositionRowProps {
  row: MorphoPositionRow;
  chainId: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  findYield?: (address?: string, symbol?: string) => ExternalYield | undefined;
  onSwapRequest?: (state: SwapModalState) => void;
  onDebtSwapRequest?: (state: DebtSwapModalState) => void;
  onADLRequest?: (state: ADLModalState) => void;
  isADLSupported?: boolean;
  hasActiveADL?: boolean;
  adlTriggerLtvBps?: bigint;
  adlTargetLtvBps?: bigint;
  /** True if current LTV is at or above ADL trigger threshold */
  isAboveTrigger?: boolean;
  /** Auto-leverage props */
  hasActiveAutoLev?: boolean;
  autoLevTriggerLtvBps?: bigint;
  autoLevTargetLtvBps?: bigint;
  /** True if current LTV is below auto-leverage trigger threshold */
  isBelowAutoLevTrigger?: boolean;
}

const MorphoPositionRowComponent: FC<MorphoPositionRowProps> = memo(function MorphoPositionRowComponent({
  row,
  chainId,
  isExpanded,
  onToggleExpanded,
  findYield,
  onSwapRequest,
  onDebtSwapRequest,
  onADLRequest,
  isADLSupported,
  hasActiveADL,
  adlTriggerLtvBps,
  adlTargetLtvBps,
  isAboveTrigger,
  hasActiveAutoLev,
  autoLevTriggerLtvBps,
  autoLevTargetLtvBps,
  isBelowAutoLevTrigger,
}) {
  // Pre-encode the Morpho market context for modals
  const protocolContext = useMemo(() => encodeMorphoContext(row.context), [row.context]);

  // Calculate collateral rate (PT tokens have fixed yield)
  const collateralRate = useMemo(() => {
    if (!hasExternalYield(row.collateralSymbol)) return 0;
    const collateralAddr = row.market.collateralAsset?.address?.toLowerCase() || "";
    const ptYield = findYield?.(collateralAddr, row.collateralSymbol);
    return ptYield?.fixedApy ?? 0;
  }, [row.collateralSymbol, row.market.collateralAsset?.address, findYield]);

  // Memoized supply position object
  const supplyPosition = useMemo(() => ({
    icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
    name: row.collateralSymbol,
    balance: row.collateralBalanceUsd,
    tokenBalance: row.collateralBalance,
    currentRate: collateralRate,
    tokenAddress: row.market.collateralAsset?.address || "",
    tokenDecimals: row.collateralDecimals,
    tokenPrice: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
    tokenSymbol: row.collateralSymbol,
    protocolContext,
  }), [row.collateralSymbol, row.collateralBalanceUsd, row.collateralBalance, row.collateralDecimals, row.market.collateralAsset, collateralRate, protocolContext]);

  // Memoized borrow position object
  const borrowPosition = useMemo(() => {
    if (!row.hasCollateral) return null;
    return {
      icon: tokenNameToLogo(row.loanSymbol.toLowerCase()),
      name: row.loanSymbol,
      balance: row.borrowBalanceUsd,
      tokenBalance: row.borrowBalance,
      currentRate: row.borrowApy,
      tokenAddress: row.market.loanAsset.address,
      tokenDecimals: row.borrowDecimals,
      tokenPrice: BigInt(Math.floor((row.market.loanAsset.priceUsd || 0) * 1e8)),
      tokenSymbol: row.loanSymbol,
      protocolContext,
    };
  }, [row.hasCollateral, row.loanSymbol, row.borrowBalanceUsd, row.borrowBalance, row.borrowApy, row.borrowDecimals, row.market.loanAsset, protocolContext]);

  // Memoized position manager
  const positionManager = useMemo(() => {
    return PositionManager.fromPositions(
      [supplyPosition],
      borrowPosition ? [borrowPosition] : []
    );
  }, [supplyPosition, borrowPosition]);

  // Memoized LTV display value
  const ltvDisplayValue = useMemo(() => {
    return row.currentLtv != null ? `${formatPercentage(row.currentLtv, 1)}%` : "--";
  }, [row.currentLtv]);

  // Memoized yield metrics
  const positionYieldMetrics = useMemo(() => {
    return calculateNetYieldMetrics(
      [{ balance: row.collateralBalanceUsd, currentRate: collateralRate }],
      row.hasDebt ? [{ balance: row.borrowBalanceUsd, currentRate: row.borrowApy }] : []
    );
  }, [row.collateralBalanceUsd, collateralRate, row.hasDebt, row.borrowBalanceUsd, row.borrowApy]);

  // Memoized extra stats for supply position
  const extraStats = useMemo(() => [{ label: "LTV", value: ltvDisplayValue }], [ltvDisplayValue]);

  // Memoized available assets for borrow position
  const availableAssets = useMemo(() => [{
    symbol: row.collateralSymbol,
    address: row.market.collateralAsset?.address || "",
    decimals: row.collateralDecimals,
    rawBalance: row.collateralBalance,
    balance: row.collateralBalanceUsd,
    icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
    price: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
  }], [row.collateralSymbol, row.collateralDecimals, row.collateralBalance, row.collateralBalanceUsd, row.market.collateralAsset]);

  // Memoized borrow available actions
  const borrowAvailableActions = useMemo(() => ({
    borrow: true,
    repay: row.hasDebt,
    move: row.hasDebt,
    close: row.hasDebt && row.hasCollateral,
    swap: row.hasDebt && row.hasCollateral, // Enable debt swap when user has both debt and collateral
  }), [row.hasDebt, row.hasCollateral]);

  // Handle debt swap button click - opens debt swap modal
  const handleDebtSwapClick = useCallback(() => {
    if (!onDebtSwapRequest || !row.hasDebt || !row.hasCollateral) return;
    onDebtSwapRequest({
      isOpen: true,
      morphoContext: row.context,
      debtTokenAddress: row.market.loanAsset.address,
      debtTokenSymbol: row.loanSymbol,
      debtTokenDecimals: row.borrowDecimals,
      debtBalance: row.borrowBalance,
      debtBalanceUsd: row.borrowBalanceUsd,
      debtTokenPrice: BigInt(Math.floor((row.market.loanAsset?.priceUsd || 0) * 1e8)),
      collateralTokenAddress: row.market.collateralAsset?.address || "",
      collateralTokenSymbol: row.collateralSymbol,
      collateralBalance: row.collateralBalance,
      collateralDecimals: row.collateralDecimals,
    });
  }, [onDebtSwapRequest, row]);

  // Memoized move support
  const moveSupport = useMemo(() => ({
    preselectedCollaterals: row.hasCollateral ? [{
      token: row.market.collateralAsset?.address || "",
      symbol: row.collateralSymbol,
      decimals: row.collateralDecimals,
      amount: row.collateralBalance,
      maxAmount: row.collateralBalance,
      supported: true,
    }] : [],
    disableCollateralSelection: true,
  }), [row.hasCollateral, row.collateralSymbol, row.collateralDecimals, row.collateralBalance, row.market.collateralAsset?.address]);

  // Memoized Morpho URL
  const morphoUrl = useMemo(() => {
    return getMorphoMarketUrl(chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol);
  }, [chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol]);

  // Select appropriate supply actions based on collateral status
  const supplyAvailableActions = row.hasCollateral ? SUPPLY_ACTIONS_WITH_MOVE : SUPPLY_ACTIONS_WITHOUT_MOVE;

  // Handle swap button click - opens collateral swap modal
  const handleSwapClick = useCallback(() => {
    if (!onSwapRequest || !row.hasCollateral) return;
    // Convert price to 1e8 format for SwapAsset compatibility
    const priceIn1e8 = BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8));
    onSwapRequest({
      isOpen: true,
      morphoContext: row.context,
      debtTokenAddress: row.market.loanAsset.address,
      debtBalance: row.borrowBalance,
      collateralAddress: row.market.collateralAsset?.address || "",
      collateralSymbol: row.collateralSymbol,
      collateralDecimals: row.collateralDecimals,
      collateralBalance: row.collateralBalance,
      collateralBalanceUsd: row.collateralBalanceUsd,
      collateralPrice: priceIn1e8,
    });
  }, [onSwapRequest, row]);

  // Handle ADL button click - opens ADL automation modal
  const handleADLClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onADLRequest || !row.hasDebt || !row.hasCollateral) return;
    const priceIn1e8 = BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8));
    onADLRequest({
      isOpen: true,
      morphoContext: row.context,
      currentLtvBps: Math.round((row.currentLtv || 0) * 100),
      liquidationLtvBps: Math.round(row.lltv * 100),
      collateralTokenAddress: row.market.collateralAsset?.address || "",
      collateralTokenSymbol: row.collateralSymbol,
      collateralDecimals: row.collateralDecimals,
      collateralBalance: row.collateralBalance,
      collateralBalanceUsd: row.collateralBalanceUsd,
      collateralPrice: priceIn1e8,
      debtTokenAddress: row.market.loanAsset.address,
      debtTokenSymbol: row.loanSymbol,
      debtTokenDecimals: row.borrowDecimals,
      debtBalanceUsd: row.borrowBalanceUsd,
    });
  }, [onADLRequest, row]);

  const containerColumns = "grid-cols-1 md:grid-cols-2 md:divide-x";

  // Combined automation status for visual indicator
  const hasAnyAutomation = hasActiveADL || hasActiveAutoLev;

  // Shadow styling: subtle glow effect based on automation status
  // Green = safe/protected, Red = trigger condition met (warning), Blue = auto-leverage active
  const getShadowClass = () => {
    if (hasActiveADL && isAboveTrigger) {
      return "shadow-[0_0_6px_rgba(239,68,68,0.25),0_0_12px_rgba(239,68,68,0.15)]"; // Red glow - ADL trigger met
    }
    if (hasActiveAutoLev && isBelowAutoLevTrigger) {
      return "shadow-[0_0_6px_rgba(56,189,248,0.25),0_0_12px_rgba(56,189,248,0.15)]"; // Blue glow - Auto-lev trigger met
    }
    if (hasAnyAutomation) {
      return "shadow-[0_0_6px_rgba(74,222,128,0.3),0_0_12px_rgba(74,222,128,0.18)]"; // Green glow - protected
    }
    return "";
  };
  const adlShadowClass = getShadowClass();

  return (
    <div
      key={row.key}
      className={`border-base-300 hover:border-base-content/15 relative rounded-md border transition-all duration-200 ${adlShadowClass}`}
    >
      {/* Market pair header */}
      <div
        className="bg-base-200/50 border-base-300 hover:bg-base-200/70 flex cursor-pointer flex-col gap-2 border-b px-3 py-2 transition-colors sm:flex-row sm:items-center sm:justify-between"
        onClick={onToggleExpanded}
      >
        {/* Market name row */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex flex-shrink-0 -space-x-2">
            <Image
              src={tokenNameToLogo(row.collateralSymbol.toLowerCase())}
              alt={row.collateralSymbol}
              width={20}
              height={20}
              className="border-base-100 bg-base-200 rounded-full border"
              onError={handleImageError}
            />
            <Image
              src={tokenNameToLogo(row.loanSymbol.toLowerCase())}
              alt={row.loanSymbol}
              width={20}
              height={20}
              className="border-base-100 bg-base-200 rounded-full border"
              onError={handleImageError}
            />
          </div>
          <span className="truncate text-sm font-medium" title={`${row.collateralSymbol}/${row.loanSymbol}`}>
            {row.collateralSymbol}/{row.loanSymbol}
          </span>
          {morphoUrl && (
            <a
              href={morphoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopPropagation}
              className="inline-flex flex-shrink-0 items-center gap-0.5 opacity-50 transition-opacity hover:opacity-100"
              title="View on Morpho"
            >
              <Image
                src="/logos/morpho.svg"
                alt="Morpho"
                width={14}
                height={14}
                className="rounded-sm"
              />
              <ExternalLink width={10} height={10} />
            </a>
          )}
        </div>
        {/* Right side: ADL indicator + Stats */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {/* LTV Automation Settings/Status - show before stats */}
          {isADLSupported && row.hasDebt && row.hasCollateral && (
            <button
              onClick={handleADLClick}
              className={`group relative flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors ${
                hasAnyAutomation
                  ? "bg-success/10 text-success hover:bg-success/20"
                  : "text-base-content/50 hover:bg-base-200 hover:text-base-content"
              }`}
            >
              {hasAnyAutomation ? (
                <div className="flex items-center gap-2">
                  {/* ADL badge */}
                  {hasActiveADL && (
                    <div className="flex items-center gap-1">
                      <ShieldCheckIcon className="size-3.5" />
                      <span className="text-[10px] font-medium">
                        {formatLtvPercent(adlTriggerLtvBps!)}↓{formatLtvPercent(adlTargetLtvBps!)}
                      </span>
                    </div>
                  )}
                  {/* Auto-leverage badge */}
                  {hasActiveAutoLev && (
                    <div className="text-info flex items-center gap-1">
                      <ArrowTrendingUpIcon className="size-3.5" />
                      <span className="text-[10px] font-medium">
                        {formatLtvPercent(autoLevTriggerLtvBps!)}↑{formatLtvPercent(autoLevTargetLtvBps!)}
                      </span>
                    </div>
                  )}
                  {/* Hover tooltip */}
                  <span className="bg-base-300 text-base-content pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {hasActiveADL && (
                      <>
                        <span className="text-success">ADL:</span> {formatLtvPercent(adlTriggerLtvBps!)} → {formatLtvPercent(adlTargetLtvBps!)}
                        {hasActiveAutoLev && <br />}
                      </>
                    )}
                    {hasActiveAutoLev && (
                      <>
                        <span className="text-info">Auto-Lev:</span> {formatLtvPercent(autoLevTriggerLtvBps!)} → {formatLtvPercent(autoLevTargetLtvBps!)}
                      </>
                    )}
                  </span>
                </div>
              ) : (
                <>
                  <Cog6ToothIcon className="size-3.5" />
                  {/* Hover tooltip for inactive */}
                  <span className="bg-base-300 text-base-content pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    Set up LTV Automation
                  </span>
                </>
              )}
            </button>
          )}
          {/* Net Value */}
          <span className="text-base-content/60">
            Net:{" "}
            <span className={positionYieldMetrics.netBalance >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>
              {formatCurrencyCompact(positionYieldMetrics.netBalance)}
            </span>
          </span>
          {/* Net APY */}
          <span className="text-base-content/60">
            APY:{" "}
            <span className={positionYieldMetrics.netApyPercent == null ? "text-base-content/40" : positionYieldMetrics.netApyPercent >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>
              {positionYieldMetrics.netApyPercent != null ? formatSignedPercent(positionYieldMetrics.netApyPercent) : "—"}
            </span>
          </span>
          {/* LTV - show first on mobile since it's important */}
          {row.hasDebt && (
            <span className="text-base-content/60">
              LTV:{" "}
              <span className={row.currentLtv && row.currentLtv > row.lltv * 0.9 ? TEXT_ERROR : TEXT_SUCCESS}>{ltvDisplayValue}</span>
              <span className="text-base-content/50">/{row.lltv.toFixed(0)}%</span>
            </span>
          )}
          {/* 30D Yield - hidden on very small screens */}
          <span className="text-base-content/60 group relative hidden cursor-help min-[400px]:inline">
            30D:{" "}
            <span className={positionYieldMetrics.netYield30d >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>
              {formatCurrencyCompact(positionYieldMetrics.netYield30d)}
            </span>
            <span className="bg-base-300 text-base-content pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Est. annual: <span className={positionYieldMetrics.netAnnualYield >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>{formatCurrencyCompact(positionYieldMetrics.netAnnualYield)}</span>
            </span>
          </span>
        </div>
      </div>

      {/* Side-by-side positions */}
      <div className={`divide-base-300 grid divide-y md:divide-y-0 ${containerColumns}`}>
        {/* Left: Collateral (Supply) */}
        <SupplyPosition
          {...supplyPosition}
          protocolName="morpho-blue"
          networkType="evm"
          chainId={chainId}
          position={positionManager}
          disableMove={!row.hasCollateral}
          containerClassName="rounded-none"
          availableActions={supplyAvailableActions}
          controlledExpanded={isExpanded}
          onToggleExpanded={onToggleExpanded}
          extraStats={extraStats}
          showExpandIndicator={false}
          onSwap={row.hasCollateral ? handleSwapClick : undefined}
          adlActive={hasAnyAutomation}
        />

        {/* Right: Debt (Borrow) */}
        {borrowPosition ? (
          <BorrowPosition
            {...borrowPosition}
            protocolName="morpho-blue"
            networkType="evm"
            chainId={chainId}
            position={positionManager}
            containerClassName="rounded-none"
            availableAssets={availableAssets}
            availableActions={borrowAvailableActions}
            moveSupport={moveSupport}
            showNoDebtLabel={!row.hasDebt}
            controlledExpanded={isExpanded}
            onToggleExpanded={onToggleExpanded}
            onSwap={row.hasDebt && row.hasCollateral ? handleDebtSwapClick : undefined}
          />
        ) : null}
      </div>
    </div>
  );
});

export const MorphoPositionsSection: FC<MorphoPositionsSectionProps> = ({
  title,
  rows,
  userAddress,
  hasLoadedOnce,
  chainId,
  findYield,
}) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Collateral Swap modal state
  const [swapModalState, setSwapModalState] = useState<SwapModalState | null>(null);

  // Debt Swap modal state
  const [debtSwapModalState, setDebtSwapModalState] = useState<DebtSwapModalState | null>(null);

  // ADL modal state
  const [adlModalState, setAdlModalState] = useState<ADLModalState | null>(null);

  // Check if ADL/Auto-Leverage is supported on this chain
  const { isSupported: isADLSupported, ltvTriggerAddress } = useADLContracts(chainId);
  const { autoLeverageTriggerAddress } = useAutoLeverageContracts(chainId);

  // Fetch all conditional orders to find ADL/Auto-Leverage for each position
  const { orders: conditionalOrders } = useConditionalOrders({
    activeOnly: true,
    fetchTriggerStatus: true,
  });

  // Build maps of market ID -> order for quick lookup (separate ADL and Auto-Leverage)
  const { adlByMarketId, autoLevByMarketId } = useMemo(() => {
    const adlMap = new Map<string, ConditionalOrder>();
    const autoLevMap = new Map<string, ConditionalOrder>();

    for (const order of conditionalOrders) {
      if (order.context.status !== ConditionalOrderStatus.Active) continue;
      if (!order.triggerParams) continue;

      // Only match Morpho orders
      if (order.triggerParams.protocolId !== PROTOCOL_IDS.MORPHO_BLUE) continue;

      // Decode the protocol context to get market params
      const morphoContext = decodeMorphoContext(order.triggerParams.protocolContext);
      if (!morphoContext) continue;

      const marketId = morphoContext.marketId.toLowerCase();
      const triggerAddr = order.context.params.trigger.toLowerCase();

      // Separate by trigger type - only compare if addresses are loaded
      if (autoLeverageTriggerAddress && triggerAddr === autoLeverageTriggerAddress.toLowerCase()) {
        autoLevMap.set(marketId, order);
      } else if (ltvTriggerAddress && triggerAddr === ltvTriggerAddress.toLowerCase()) {
        adlMap.set(marketId, order);
      }
    }

    return { adlByMarketId: adlMap, autoLevByMarketId: autoLevMap };
  }, [conditionalOrders, ltvTriggerAddress, autoLeverageTriggerAddress]);

  // Pre-compute ADL info for all rows to avoid creating new objects on each render
  const adlInfoByMarketId = useMemo(() => {
    const infoMap = new Map<string, ADLInfo>();

    for (const row of rows) {
      const marketId = row.market.uniqueKey?.toLowerCase();
      if (!marketId) continue;

      const currentLtvBps = Math.round((row.currentLtv || 0) * 100);

      // Check for ADL order
      const adlOrder = adlByMarketId.get(marketId);
      const adlTriggerLtvBps = adlOrder?.triggerParams?.triggerLtvBps;
      const adlTargetLtvBps = adlOrder?.triggerParams?.targetLtvBps;
      const hasActiveADL = adlTriggerLtvBps !== undefined && adlTargetLtvBps !== undefined;
      const isAboveTrigger = hasActiveADL && currentLtvBps >= Number(adlTriggerLtvBps);

      // Check for Auto-Leverage order
      const autoLevOrder = autoLevByMarketId.get(marketId);
      const autoLevTriggerLtvBps = autoLevOrder?.triggerParams?.triggerLtvBps;
      const autoLevTargetLtvBps = autoLevOrder?.triggerParams?.targetLtvBps;
      const hasActiveAutoLev = autoLevTriggerLtvBps !== undefined && autoLevTargetLtvBps !== undefined;
      const isBelowAutoLevTrigger = hasActiveAutoLev && currentLtvBps < Number(autoLevTriggerLtvBps);

      infoMap.set(marketId, {
        hasActiveADL,
        adlTriggerLtvBps,
        adlTargetLtvBps,
        isAboveTrigger,
        isTriggerMet: adlOrder?.isTriggerMet,
        hasActiveAutoLev,
        autoLevTriggerLtvBps,
        autoLevTargetLtvBps,
        isBelowAutoLevTrigger,
        isAutoLevTriggerMet: autoLevOrder?.isTriggerMet,
      });
    }

    return infoMap;
  }, [rows, adlByMarketId, autoLevByMarketId]);

  const toggleRowExpanded = useCallback((key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Handle swap modal open request
  const handleSwapRequest = useCallback((state: SwapModalState) => {
    setSwapModalState(state);
  }, []);

  // Handle swap modal close
  const handleCloseSwapModal = useCallback(() => {
    setSwapModalState(null);
  }, []);

  // Handle debt swap modal open request
  const handleDebtSwapRequest = useCallback((state: DebtSwapModalState) => {
    setDebtSwapModalState(state);
  }, []);

  // Handle debt swap modal close
  const handleCloseDebtSwapModal = useCallback(() => {
    setDebtSwapModalState(null);
  }, []);

  // Handle ADL modal open request
  const handleADLRequest = useCallback((state: ADLModalState) => {
    setAdlModalState(state);
  }, []);

  // Handle ADL modal close
  const handleCloseADLModal = useCallback(() => {
    setAdlModalState(null);
  }, []);

  const renderPositions = () => {
    if (!userAddress) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          Connect your wallet to view your Morpho Blue positions
        </div>
      );
    }

    if (!hasLoadedOnce) {
      return (
        <div className="flex justify-center py-6">
          <LoadingSpinner size="md" />
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          No positions found
        </div>
      );
    }

    return rows.map((row) => {
      const marketId = row.market.uniqueKey?.toLowerCase();
      const adlInfo = marketId ? adlInfoByMarketId.get(marketId) ?? EMPTY_ADL_INFO : EMPTY_ADL_INFO;
      return (
        <MorphoPositionRowComponent
          key={row.key}
          row={row}
          chainId={chainId}
          isExpanded={!!expandedRows[row.key]}
          onToggleExpanded={() => toggleRowExpanded(row.key)}
          findYield={findYield}
          onSwapRequest={handleSwapRequest}
          onDebtSwapRequest={handleDebtSwapRequest}
          onADLRequest={handleADLRequest}
          isADLSupported={isADLSupported}
          hasActiveADL={adlInfo.hasActiveADL}
          adlTriggerLtvBps={adlInfo.adlTriggerLtvBps}
          adlTargetLtvBps={adlInfo.adlTargetLtvBps}
          isAboveTrigger={adlInfo.isAboveTrigger}
          hasActiveAutoLev={adlInfo.hasActiveAutoLev}
          autoLevTriggerLtvBps={adlInfo.autoLevTriggerLtvBps}
          autoLevTargetLtvBps={adlInfo.autoLevTargetLtvBps}
          isBelowAutoLevTrigger={adlInfo.isBelowAutoLevTrigger}
        />
      );
    });
  };

  // Build available assets for swap modal from current position
  const swapAvailableAssets = useMemo(() => {
    if (!swapModalState) return [];
    // Convert raw balance to human-readable number
    const humanBalance = Number(formatUnits(swapModalState.collateralBalance, swapModalState.collateralDecimals));
    return [{
      symbol: swapModalState.collateralSymbol,
      address: swapModalState.collateralAddress,
      decimals: swapModalState.collateralDecimals,
      rawBalance: swapModalState.collateralBalance,
      balance: humanBalance, // Human-readable token amount, not USD
      icon: tokenNameToLogo(swapModalState.collateralSymbol.toLowerCase()),
      price: swapModalState.collateralPrice, // Price in 1e8 format for USD calculation
    }];
  }, [swapModalState]);

  // Build position prop for swap modal
  const swapPosition = useMemo(() => {
    if (!swapModalState) return null;
    return {
      name: swapModalState.collateralSymbol,
      tokenAddress: swapModalState.collateralAddress,
      decimals: swapModalState.collateralDecimals,
      balance: swapModalState.collateralBalanceUsd,
      type: "supply" as const,
    };
  }, [swapModalState]);

  // Build available assets for debt swap modal from current position
  const debtSwapAvailableAssets = useMemo(() => {
    if (!debtSwapModalState) return [];
    // Convert raw balance to human-readable number
    const humanBalance = Number(formatUnits(debtSwapModalState.debtBalance, debtSwapModalState.debtTokenDecimals));
    return [{
      symbol: debtSwapModalState.debtTokenSymbol,
      address: debtSwapModalState.debtTokenAddress,
      decimals: debtSwapModalState.debtTokenDecimals,
      rawBalance: debtSwapModalState.debtBalance,
      balance: humanBalance, // Human-readable token amount, not USD
      icon: tokenNameToLogo(debtSwapModalState.debtTokenSymbol.toLowerCase()),
      price: debtSwapModalState.debtTokenPrice, // Price in 1e8 format for USD calculation
    }];
  }, [debtSwapModalState]);

  return (
    <>
      <div className="space-y-4">
        {/* Header with title and badge */}
        <div className="border-base-200/50 mb-1 flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary h-5 w-1 rounded-full" />
            <span className="text-base-content/60 text-[11px] font-semibold uppercase tracking-widest">{title}</span>
          </div>
          {rows.length > 0 && (
            <div className="bg-primary/10 text-primary flex items-center gap-1.5 rounded-full px-2 py-0.5">
              <span className="font-mono text-xs font-bold">{rows.length}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-70">{rows.length === 1 ? "market" : "markets"}</span>
            </div>
          )}
        </div>

        {/* Positions list */}
        <div className="space-y-3">{renderPositions()}</div>
      </div>

      {/* Collateral Swap Modal */}
      {swapModalState && swapPosition && (
        <CollateralSwapModal
          isOpen={swapModalState.isOpen}
          onClose={handleCloseSwapModal}
          protocolName="morpho-blue"
          availableAssets={swapAvailableAssets}
          initialFromTokenAddress={swapModalState.collateralAddress}
          chainId={chainId}
          position={swapPosition}
          morphoContext={swapModalState.morphoContext ?? undefined}
          debtTokenAddress={swapModalState.debtTokenAddress}
          currentDebtBalance={swapModalState.debtBalance}
        />
      )}

      {/* Debt Swap Modal */}
      {debtSwapModalState && (
        <DebtSwapEvmModal
          isOpen={debtSwapModalState.isOpen}
          onClose={handleCloseDebtSwapModal}
          protocolName="morpho-blue"
          chainId={chainId}
          debtFromToken={debtSwapModalState.debtTokenAddress as Address}
          debtFromName={debtSwapModalState.debtTokenSymbol}
          debtFromIcon={tokenNameToLogo(debtSwapModalState.debtTokenSymbol.toLowerCase())}
          debtFromDecimals={debtSwapModalState.debtTokenDecimals}
          debtFromPrice={debtSwapModalState.debtTokenPrice}
          currentDebtBalance={debtSwapModalState.debtBalance}
          availableAssets={debtSwapAvailableAssets}
          morphoContext={debtSwapModalState.morphoContext ?? undefined}
          collateralTokenAddress={debtSwapModalState.collateralTokenAddress as Address}
          collateralTokenSymbol={debtSwapModalState.collateralTokenSymbol}
          collateralBalance={debtSwapModalState.collateralBalance}
          collateralDecimals={debtSwapModalState.collateralDecimals}
        />
      )}

      {/* LTV Automation Modal (ADL + Auto-Leverage) */}
      {adlModalState && (
        <LTVAutomationModal
          isOpen={adlModalState.isOpen}
          onClose={handleCloseADLModal}
          protocolName="morpho-blue"
          chainId={chainId}
          currentLtvBps={adlModalState.currentLtvBps}
          liquidationLtvBps={adlModalState.liquidationLtvBps}
          collateralTokens={[{
            symbol: adlModalState.collateralTokenSymbol,
            address: adlModalState.collateralTokenAddress,
            decimals: adlModalState.collateralDecimals,
            rawBalance: adlModalState.collateralBalance,
            balance: Number(formatUnits(adlModalState.collateralBalance, adlModalState.collateralDecimals)),
            icon: tokenNameToLogo(adlModalState.collateralTokenSymbol.toLowerCase()),
            price: adlModalState.collateralPrice,
            usdValue: adlModalState.collateralBalanceUsd,
          }]}
          debtToken={{
            address: adlModalState.debtTokenAddress,
            symbol: adlModalState.debtTokenSymbol,
            decimals: adlModalState.debtTokenDecimals,
          }}
          morphoContext={adlModalState.morphoContext ?? undefined}
          totalCollateralUsd={BigInt(Math.round(adlModalState.collateralBalanceUsd * 1e8))}
          totalDebtUsd={BigInt(Math.round(adlModalState.debtBalanceUsd * 1e8))}
        />
      )}
    </>
  );
};
