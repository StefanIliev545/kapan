"use client";

import { FC, useState, useMemo, useEffect, useCallback } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { Address, encodeAbiParameters } from "viem";
import { Cog6ToothIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { BaseProtocolHeader, type HeaderMetric } from "../common";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { MetricColors } from "~~/utils/protocolMetrics";
import { useCompoundLendingPositions, type CompoundMarketPosition } from "~~/hooks/useCompoundLendingPositions";
import { useCompoundPositionGroups } from "~~/hooks/adapters/useCompoundPositionGroups";
import { CompoundMarketsSection } from "./CompoundMarketsSection";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { MultiPositionLayout } from "~~/components/positions/MultiPositionLayout";
import type { PositionGroup } from "~~/types/positions";
import { DepositModal } from "~~/components/modals/DepositModal";
import { BorrowModal } from "~~/components/modals/BorrowModal";
import { DepositAndBorrowModal } from "~~/components/modals/DepositAndBorrowModal";
import { WithdrawModal } from "~~/components/modals/WithdrawModal";
import { CollateralSwapModal } from "~~/components/modals/CollateralSwapModal";
import { TokenSelectModal } from "~~/components/modals/TokenSelectModal";
import { LTVAutomationModal } from "~~/components/modals/LTVAutomationModal";
import { buildModalTokenInfo } from "~~/components/modals/common/modalUtils";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { SwapAsset } from "~~/components/modals/SwapModalShell";
import { useADLContracts } from "~~/hooks/useADLOrder";
import { useActiveADL, formatLtvPercent } from "~~/hooks/useConditionalOrders";
import { AddButton } from "~~/components/common/AddButton";
import { useGlobalState } from "~~/services/store/store";
import { useModal } from "~~/hooks/useModal";
import { PositionManager } from "~~/utils/position";
import { formatBps } from "~~/utils/risk";
import { CollateralLtvBreakdown, type CollateralBreakdownItem } from "../common/UtilizationTooltip";

// CSS class constants
const TEXT_SUCCESS = "text-success";
const TEXT_ERROR = "text-error";

/** Encode Compound market address as context for modals */
function encodeCompoundMarket(marketAddress: Address): string {
  return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
}

// ── Position row for each Comet market ─────────────────────────────

interface CompoundMarketRowProps {
  market: CompoundMarketPosition;
  positionGroup: PositionGroup;
  chainId: number;
  isADLSupported: boolean;
}

const CompoundMarketRow: FC<CompoundMarketRowProps> = ({
  market,
  positionGroup,
  chainId,
  isADLSupported,
}) => {
  const depositModal = useModal();
  const withdrawModal = useModal();
  const swapModal = useModal();
  const adlModal = useModal();
  const collateralSelectModal = useModal();
  const borrowModal = useModal();
  const borrowCollateralSelectModal = useModal();
  const [selectedCollateral, setSelectedCollateral] = useState<CompoundMarketPosition["collaterals"][number] | null>(null);
  const [selectedAction, setSelectedAction] = useState<"deposit" | "withdraw" | null>(null);
  /** Collateral selected for the deposit-and-borrow flow (fresh position) */
  const [borrowCollateral, setBorrowCollateral] = useState<ProtocolPosition | null>(null);

  const compoundContext = useMemo(() => encodeCompoundMarket(market.baseToken), [market.baseToken]);

  // Track active ADL/AL orders for this specific market
  const { hasActiveADL, activeADL, triggerLtvBps, targetLtvBps } = useActiveADL({
    protocolName: "compound",
    chainId,
    compoundMarket: market.baseToken as Address,
  });

  // All collaterals for the market as ProtocolPosition[] for the token selector
  const allCollateralPositions: ProtocolPosition[] = useMemo(
    () => market.collaterals.map(col => ({
      icon: col.icon,
      name: col.symbol,
      tokenSymbol: col.symbol,
      balance: col.usdValue,
      tokenBalance: col.balance,
      currentRate: 0,
      tokenAddress: col.address,
      tokenDecimals: col.decimals,
      tokenPrice: col.priceRaw,
      protocolContext: compoundContext,
    })),
    [market.collaterals, compoundContext],
  );

  // Build available assets for swap modal
  const allCollateralsForSwap: SwapAsset[] = useMemo(() =>
    market.collaterals.map(col => ({
      symbol: col.symbol,
      address: col.address as Address,
      decimals: col.decimals,
      rawBalance: col.balance,
      balance: Number(col.balance) / (10 ** col.decimals),
      icon: col.icon,
      usdValue: col.usdValue,
      price: col.priceRaw,
    })),
    [market.collaterals],
  );

  // Collateral swap handlers
  const handleOpenSwap = useCallback((col: CompoundMarketPosition["collaterals"][number]) => {
    setSelectedCollateral(col);
    swapModal.open();
  }, [swapModal]);

  const handleCloseSwap = useCallback(() => {
    swapModal.close();
    setSelectedCollateral(null);
  }, [swapModal]);

  // Deposit handler for collateral
  const handleOpenDeposit = useCallback((col: CompoundMarketPosition["collaterals"][number]) => {
    setSelectedCollateral(col);
    setSelectedAction("deposit");
    depositModal.open();
  }, [depositModal]);

  // Withdraw handler for collateral
  const handleOpenWithdraw = useCallback((col: CompoundMarketPosition["collaterals"][number]) => {
    setSelectedCollateral(col);
    setSelectedAction("withdraw");
    withdrawModal.open();
  }, [withdrawModal]);

  const handleCloseDepositWithdraw = useCallback(() => {
    depositModal.close();
    withdrawModal.close();
    setSelectedCollateral(null);
    setSelectedAction(null);
  }, [depositModal, withdrawModal]);

  // Per-collateral breakdown for the LTV tooltip
  const collateralBreakdown = useMemo((): CollateralBreakdownItem[] => {
    const activeCollaterals = market.collaterals.filter(c => c.balance > 0n);
    if (activeCollaterals.length === 0) return [];
    const totalUsd = activeCollaterals.reduce((sum, c) => sum + c.usdValue, 0);
    return activeCollaterals.map(col => ({
      name: col.symbol,
      icon: col.icon,
      valueUsd: col.usdValue,
      ltvBps: Number(col.ltvBps),
      lltvBps: Number(col.lltvBps),
      weightPct: totalUsd > 0 ? (col.usdValue / totalUsd) * 100 : 0,
    }));
  }, [market.collaterals]);

  // Health status computation
  const healthStatus = useMemo(() => {
    if (market.borrowBalance <= 0n || market.totalCollateralUsd <= 0) return null;
    const currentLtv = market.utilizationPercent;
    const lltvPercent = Number(market.weightedLltvBps) / 100;
    const utilizationOfLltv = lltvPercent > 0 ? (currentLtv / lltvPercent) * 100 : 0;

    let colorClass = TEXT_SUCCESS;
    let label = "Healthy";
    if (utilizationOfLltv > 90) {
      colorClass = TEXT_ERROR;
      label = "At Risk";
    } else if (utilizationOfLltv > 75) {
      colorClass = "text-warning";
      label = "Caution";
    }

    return { currentLtv, lltvPercent, colorClass, label };
  }, [market]);

  const hasDebt = market.borrowBalance > 0n;
  const hasCollateral = market.collaterals.some(c => c.balance > 0n);
  const hasSupplyOnly = market.supplyBalance > 0n && !hasDebt && !hasCollateral;

  // Borrow flow: when user has collateral but no debt, open BorrowModal directly.
  // When opening a fresh position (deposit + borrow), use collateral picker → DepositAndBorrowModal.
  const handleBorrowClick = useCallback(() => {
    if (hasCollateral) {
      borrowModal.open();
    } else {
      borrowCollateralSelectModal.open();
    }
  }, [hasCollateral, borrowModal, borrowCollateralSelectModal]);

  const handleBorrowCollateralSelected = useCallback((token: ProtocolPosition) => {
    setBorrowCollateral(token);
    borrowModal.open();
  }, [borrowModal]);

  const handleCloseBorrowFlow = useCallback(() => {
    borrowModal.close();
    borrowCollateralSelectModal.close();
    setBorrowCollateral(null);
  }, [borrowModal, borrowCollateralSelectModal]);

  // Debt token info for BorrowModal / DepositAndBorrowModal
  const debtTokenInfo = useMemo(() => buildModalTokenInfo({
    name: market.baseSymbol,
    icon: market.baseIcon,
    tokenAddress: market.baseToken,
    currentRate: market.borrowApr,
    usdPrice: Number(market.priceRaw) / 1e8,
    tokenDecimals: market.baseDecimals,
  }), [market.baseSymbol, market.baseIcon, market.baseToken, market.borrowApr, market.priceRaw, market.baseDecimals]);

  // Position manager for borrow modal (no existing debt — used when opening first borrow)
  const borrowPosition = useMemo(() => {
    if (market.totalCollateralUsd <= 0) return undefined;
    const ltvBps = Number(market.weightedLltvBps) > 0 ? Number(market.weightedLltvBps) : 7500;
    return new PositionManager(market.totalCollateralUsd, 0, ltvBps);
  }, [market.totalCollateralUsd, market.weightedLltvBps]);

  // Position manager with existing debt — used by BorrowPosition for "borrow more" and repay modals
  const existingPosition = useMemo(() => {
    if (market.totalCollateralUsd <= 0) return undefined;
    const ltvBps = Number(market.weightedLltvBps) > 0 ? Number(market.weightedLltvBps) : 7500;
    return new PositionManager(market.totalCollateralUsd, market.borrowBalanceUsd, ltvBps);
  }, [market.totalCollateralUsd, market.borrowBalanceUsd, market.weightedLltvBps]);

  // Collateral token info for DepositAndBorrowModal (when opening fresh position)
  const borrowCollateralTokenInfo = useMemo(() => {
    if (!borrowCollateral) return null;
    return buildModalTokenInfo({
      name: borrowCollateral.name,
      icon: borrowCollateral.icon,
      tokenAddress: borrowCollateral.tokenAddress,
      currentRate: 0,
      usdPrice: borrowCollateral.tokenPrice ? Number(borrowCollateral.tokenPrice) / 1e8 : 0,
      tokenDecimals: borrowCollateral.tokenDecimals,
    });
  }, [borrowCollateral]);

  // LTV from selected collateral for DepositAndBorrowModal
  const borrowCollateralLtvBps = useMemo(() => {
    if (!borrowCollateral) return undefined;
    const col = market.collaterals.find(
      c => c.address.toLowerCase() === borrowCollateral.tokenAddress.toLowerCase(),
    );
    return col ? Number(col.ltvBps) : undefined;
  }, [borrowCollateral, market.collaterals]);

  const borrowCollateralLltvBps = useMemo(() => {
    if (!borrowCollateral) return undefined;
    const col = market.collaterals.find(
      c => c.address.toLowerCase() === borrowCollateral.tokenAddress.toLowerCase(),
    );
    return col ? Number(col.lltvBps) : undefined;
  }, [borrowCollateral, market.collaterals]);

  // Supply-only: base token earning yield, no collateral/debt → simple single-column layout
  if (hasSupplyOnly) {
    return (
      <div className="py-3 first:pt-0 last:pb-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Image src={market.baseIcon} alt={market.baseSymbol} width={16} height={16} className="rounded-full" />
            <span className="text-sm font-medium">{market.baseSymbol} Market</span>
          </div>
          <span className="text-success text-xs font-mono tabular-nums">
            {market.supplyApr.toFixed(2)}% APR
          </span>
        </div>
        <SupplyPosition
          icon={market.baseIcon}
          name={market.baseSymbol}
          tokenSymbol={market.baseSymbol}
          balance={market.supplyBalanceUsd}
          tokenBalance={market.supplyBalance}
          currentRate={market.supplyApr}
          tokenAddress={market.baseToken}
          tokenDecimals={market.baseDecimals}
          tokenPrice={market.priceRaw}
          protocolName="Compound"
          networkType="evm"
          chainId={chainId}
          protocolContext={compoundContext}
          position={existingPosition}
        />
      </div>
    );
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <MultiPositionLayout
        group={positionGroup}
        header={
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Image src={market.baseIcon} alt={market.baseSymbol} width={16} height={16} className="rounded-full" />
              <span className="text-sm font-medium">{market.baseSymbol} Market</span>
            </div>
            <div className="flex items-center gap-2">
              {healthStatus && (
                <div className="group/ltv relative flex items-center gap-2 text-xs">
                  <span className="text-base-content/60">
                    LTV:{" "}
                    <span className={`font-mono font-semibold ${healthStatus.colorClass}`}>
                      {healthStatus.currentLtv.toFixed(1)}%
                    </span>
                    <span className="text-base-content/50">/{formatBps(market.weightedLltvBps)}%</span>
                  </span>
                  <span className={`text-[10px] font-medium uppercase ${healthStatus.colorClass}`}>
                    {healthStatus.label}
                  </span>
                  {collateralBreakdown.length > 0 && (
                    <>
                      <span className="text-primary text-[8px]">{"\u24d8"}</span>
                      <div className="pointer-events-none absolute right-0 top-full z-[100] mt-2 hidden group-hover/ltv:block">
                        <div className="bg-base-100 ring-base-300/50 pointer-events-auto min-w-[280px] rounded-lg p-3 shadow-xl ring-1">
                          <CollateralLtvBreakdown items={collateralBreakdown} totalDebtUsd={market.borrowBalanceUsd} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {isADLSupported && hasDebt && hasCollateral && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adlModal.open();
                  }}
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
                  {hasActiveADL ? <ShieldCheckIcon className="size-3.5" /> : <Cog6ToothIcon className="size-3.5" />}
                  <span>Automate</span>
                  {hasActiveADL && <span className="bg-success size-2 rounded-full" />}
                </button>
              )}
            </div>
          </div>
        }
        collateralContent={
          market.collaterals.filter(c => c.balance > 0n).length === 0 ? undefined : (
            <div className="space-y-2">
              {market.collaterals
                .filter(c => c.balance > 0n)
                .map((col) => (
                  <SupplyPosition
                    key={col.address}
                    icon={col.icon}
                    name={col.symbol}
                    tokenSymbol={col.symbol}
                    balance={col.usdValue}
                    tokenBalance={col.balance}
                    currentRate={0}
                    tokenAddress={col.address}
                    tokenDecimals={col.decimals}
                    tokenPrice={col.priceRaw}
                    protocolName="Compound"
                    networkType="evm"
                    chainId={chainId}
                    protocolContext={compoundContext}
                    position={existingPosition}
                    availableActions={{ deposit: true, withdraw: true, swap: true }}
                    onSwap={() => handleOpenSwap(col)}
                    onDeposit={() => handleOpenDeposit(col)}
                    onWithdraw={() => handleOpenWithdraw(col)}
                    adlActive={
                      activeADL?.triggerParams?.collateralToken?.toLowerCase() === col.address.toLowerCase()
                    }
                  />
                ))}
            </div>
          )
        }
        collateralFooter={
          <AddButton onClick={collateralSelectModal.open} label="Add Collateral" />
        }
        debtContent={
          !hasDebt ? undefined : (
            <BorrowPosition
              icon={market.baseIcon}
              name={market.baseSymbol}
              tokenSymbol={market.baseSymbol}
              balance={-market.borrowBalanceUsd}
              tokenBalance={market.borrowBalance}
              currentRate={market.borrowApr}
              tokenAddress={market.baseToken}
              tokenDecimals={market.baseDecimals}
              tokenPrice={market.priceRaw}
              protocolName="Compound"
              networkType="evm"
              chainId={chainId}
              protocolContext={compoundContext}
              position={existingPosition}
              availableActions={{ borrow: true, repay: true, move: true, close: hasCollateral, swap: false }}
              availableAssets={allCollateralsForSwap}
              collateralValue={market.totalCollateralUsd}
              collaterals={allCollateralsForSwap}
              adlProtected={
                activeADL?.triggerParams?.debtToken?.toLowerCase() === market.baseToken.toLowerCase()
              }
            />
          )
        }
        debtFooter={
          !hasDebt ? (
            <AddButton onClick={handleBorrowClick} label={`Borrow ${market.baseSymbol}`} />
          ) : undefined
        }
      />

      {/* Collateral Token Selector */}
      <TokenSelectModal
        isOpen={collateralSelectModal.isOpen}
        onClose={collateralSelectModal.close}
        tokens={allCollateralPositions}
        protocolName="compound"
        chainId={chainId}
        context={compoundContext}
        title="Select Collateral to Deposit"
      />

      {/* Collateral Swap Modal */}
      {selectedCollateral && swapModal.isOpen && (
        <CollateralSwapModal
          isOpen={swapModal.isOpen}
          onClose={handleCloseSwap}
          protocolName="compound"
          availableAssets={allCollateralsForSwap}
          initialFromTokenAddress={selectedCollateral.address}
          chainId={chainId}
          context={compoundContext}
          position={{
            name: selectedCollateral.symbol,
            tokenAddress: selectedCollateral.address,
            decimals: selectedCollateral.decimals,
            balance: selectedCollateral.balance,
            type: "supply",
          }}
        />
      )}

      {/* Deposit Modal */}
      {selectedCollateral && selectedAction === "deposit" && depositModal.isOpen && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={handleCloseDepositWithdraw}
          token={{
            name: selectedCollateral.symbol,
            icon: selectedCollateral.icon,
            address: selectedCollateral.address,
            decimals: selectedCollateral.decimals,
            currentRate: 0,
          }}
          protocolName="compound"
          chainId={chainId}
          context={compoundContext}
        />
      )}

      {/* Withdraw Modal */}
      {selectedCollateral && selectedAction === "withdraw" && withdrawModal.isOpen && (
        <WithdrawModal
          isOpen={withdrawModal.isOpen}
          onClose={handleCloseDepositWithdraw}
          token={{
            name: selectedCollateral.symbol,
            icon: selectedCollateral.icon,
            address: selectedCollateral.address,
            decimals: selectedCollateral.decimals,
            currentRate: 0,
          }}
          protocolName="compound"
          supplyBalance={selectedCollateral.balance}
          chainId={chainId}
          context={compoundContext}
        />
      )}

      {/* Borrow Modal - when user has collateral but no debt, simple borrow */}
      {!hasDebt && hasCollateral && (
        <BorrowModal
          isOpen={borrowModal.isOpen}
          onClose={borrowModal.close}
          token={debtTokenInfo}
          protocolName="compound"
          currentDebt={0}
          chainId={chainId}
          context={compoundContext}
          position={borrowPosition}
        />
      )}

      {/* Collateral Selector for fresh deposit+borrow position */}
      <TokenSelectModal
        isOpen={borrowCollateralSelectModal.isOpen}
        onClose={borrowCollateralSelectModal.close}
        tokens={allCollateralPositions}
        protocolName="compound"
        chainId={chainId}
        context={compoundContext}
        title="Select Collateral to Deposit"
        onTokenSelected={handleBorrowCollateralSelected}
      />

      {/* Deposit + Borrow Modal for fresh positions (no existing collateral) */}
      {borrowCollateralTokenInfo && (
        <DepositAndBorrowModal
          isOpen={borrowModal.isOpen && !hasCollateral}
          onClose={handleCloseBorrowFlow}
          protocolName="Compound"
          chainId={chainId}
          collateralToken={borrowCollateralTokenInfo}
          debtToken={debtTokenInfo}
          context={compoundContext}
          maxLtvBps={borrowCollateralLtvBps}
          lltvBps={borrowCollateralLltvBps}
        />
      )}

      {/* ADL Automation Modal */}
      {hasDebt && hasCollateral && healthStatus && (
        <LTVAutomationModal
          isOpen={adlModal.isOpen}
          onClose={adlModal.close}
          protocolName="compound"
          chainId={chainId}
          currentLtvBps={Math.round(healthStatus.currentLtv * 100)}
          liquidationLtvBps={Number(market.weightedLltvBps)}
          collateralTokens={allCollateralsForSwap.filter(a => a.balance > 0)}
          debtToken={{
            address: market.baseToken,
            symbol: market.baseSymbol,
            decimals: market.baseDecimals,
            balance: market.borrowBalance,
          }}
          totalCollateralUsd={BigInt(Math.round(market.totalCollateralUsd * 1e8))}
          totalDebtUsd={BigInt(Math.round(market.borrowBalanceUsd * 1e8))}
          compoundMarket={market.baseToken}
        />
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────

interface CompoundProtocolViewProps {
  chainId?: number;
  enabledFeatures?: { swap?: boolean; move?: boolean };
}

/** Metrics computed from user positions */
interface PositionMetrics {
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  positionsWithDebt: number;
}

const EMPTY_METRICS: PositionMetrics = {
  netBalance: 0,
  netYield30d: 0,
  netApyPercent: null,
  positionsWithDebt: 0,
};

export const CompoundProtocolView: FC<CompoundProtocolViewProps> = ({ chainId }) => {
  const { address: connectedAddress } = useAccount();

  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // State for borrow-from-markets flow
  const marketBorrowCollateralSelect = useModal();
  const marketBorrowModal = useModal();
  const [marketBorrowMarket, setMarketBorrowMarket] = useState<CompoundMarketPosition | null>(null);
  const [marketBorrowCollateral, setMarketBorrowCollateral] = useState<ProtocolPosition | null>(null);

  // Reset state on chain change
  useEffect(() => {
    setIsCollapsed(true);
    setIsMarketsOpen(false);
  }, [chainId]);

  // Fetch positions via the extracted hook
  const { markets, hasLoadedOnce, isLoading } = useCompoundLendingPositions(chainId);

  // Check if ADL is supported
  const { isSupported: isADLSupported } = useADLContracts(chainId || 1);

  // Adapter: convert to unified PositionGroup[]
  const positionGroups = useCompoundPositionGroups(chainId || 1, markets);

  // Determine which markets have user positions (collateral or debt)
  const activeMarkets = useMemo(
    () => markets.filter(m =>
      m.supplyBalance > 0n ||
      m.borrowBalance > 0n ||
      m.collaterals.some(c => c.balance > 0n)
    ),
    [markets],
  );

  // Compute metrics
  const metrics = useMemo((): PositionMetrics => {
    if (activeMarkets.length === 0) return EMPTY_METRICS;

    let totalCollateral = 0;
    let totalSupply = 0;
    let totalDebt = 0;
    let debtCount = 0;

    for (const market of activeMarkets) {
      totalCollateral += market.totalCollateralUsd;
      totalSupply += market.supplyBalanceUsd;
      totalDebt += market.borrowBalanceUsd;
      if (market.borrowBalance > 0n) debtCount++;
    }

    return {
      netBalance: totalCollateral + totalSupply - totalDebt,
      netYield30d: 0,
      netApyPercent: null,
      positionsWithDebt: debtCount,
    };
  }, [activeMarkets]);

  // Report totals to global state
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce) return;

    let totalSupplied = 0;
    let totalBorrowed = 0;
    for (const market of markets) {
      totalSupplied += market.totalCollateralUsd + market.supplyBalanceUsd;
      totalBorrowed += market.borrowBalanceUsd;
    }

    setProtocolTotals("Compound", totalSupplied, totalBorrowed);
  }, [hasLoadedOnce, markets, setProtocolTotals, chainId]);

  const hasPositions = activeMarkets.length > 0;

  // Auto-expand when positions are found
  useEffect(() => {
    if (!hasLoadedOnce) return;
    setIsCollapsed(!hasPositions);
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

  // Handle "Borrow" click from markets table — opens collateral picker → DepositAndBorrowModal
  const handleMarketBorrow = useCallback((market: CompoundMarketPosition) => {
    setMarketBorrowMarket(market);
    marketBorrowCollateralSelect.open();
  }, [marketBorrowCollateralSelect]);

  const handleMarketBorrowCollateralSelected = useCallback((token: ProtocolPosition) => {
    setMarketBorrowCollateral(token);
    marketBorrowModal.open();
  }, [marketBorrowModal]);

  const handleCloseMarketBorrowFlow = useCallback(() => {
    marketBorrowModal.close();
    marketBorrowCollateralSelect.close();
    setMarketBorrowCollateral(null);
    setMarketBorrowMarket(null);
  }, [marketBorrowModal, marketBorrowCollateralSelect]);

  // Memoized data for market-level borrow flow
  const marketBorrowContext = useMemo(() => {
    if (!marketBorrowMarket) return "";
    return encodeCompoundMarket(marketBorrowMarket.baseToken);
  }, [marketBorrowMarket]);

  const marketBorrowDebtTokenInfo = useMemo(() => {
    if (!marketBorrowMarket) return null;
    return buildModalTokenInfo({
      name: marketBorrowMarket.baseSymbol,
      icon: marketBorrowMarket.baseIcon,
      tokenAddress: marketBorrowMarket.baseToken,
      currentRate: marketBorrowMarket.borrowApr,
      usdPrice: Number(marketBorrowMarket.priceRaw) / 1e8,
      tokenDecimals: marketBorrowMarket.baseDecimals,
    });
  }, [marketBorrowMarket]);

  const marketBorrowCollateralTokenInfo = useMemo(() => {
    if (!marketBorrowCollateral) return null;
    return buildModalTokenInfo({
      name: marketBorrowCollateral.name,
      icon: marketBorrowCollateral.icon,
      tokenAddress: marketBorrowCollateral.tokenAddress,
      currentRate: 0,
      usdPrice: marketBorrowCollateral.tokenPrice ? Number(marketBorrowCollateral.tokenPrice) / 1e8 : 0,
      tokenDecimals: marketBorrowCollateral.tokenDecimals,
    });
  }, [marketBorrowCollateral]);

  // For market-level borrow, look up LTV from acceptedCollaterals (always populated with
  // on-chain collateral factors), falling back to user's collaterals if found
  const marketBorrowLtvBps = useMemo(() => {
    if (!marketBorrowCollateral || !marketBorrowMarket) return undefined;
    const addr = marketBorrowCollateral.tokenAddress.toLowerCase();
    // acceptedCollaterals now carries ltvBps from getCollateralFactors
    const accepted = marketBorrowMarket.acceptedCollaterals.find(
      c => c.address.toLowerCase() === addr,
    );
    if (accepted && accepted.ltvBps > 0) return accepted.ltvBps;
    // Fallback to user's deposited collateral data
    const deposited = marketBorrowMarket.collaterals.find(
      c => c.address.toLowerCase() === addr,
    );
    return deposited ? Number(deposited.ltvBps) : 7500;
  }, [marketBorrowCollateral, marketBorrowMarket]);

  const marketBorrowLltvBps = useMemo(() => {
    if (!marketBorrowCollateral || !marketBorrowMarket) return undefined;
    const addr = marketBorrowCollateral.tokenAddress.toLowerCase();
    const accepted = marketBorrowMarket.acceptedCollaterals.find(
      c => c.address.toLowerCase() === addr,
    );
    if (accepted && accepted.lltvBps > 0) return accepted.lltvBps;
    const deposited = marketBorrowMarket.collaterals.find(
      c => c.address.toLowerCase() === addr,
    );
    return deposited ? Number(deposited.lltvBps) : 8500;
  }, [marketBorrowCollateral, marketBorrowMarket]);

  // Collateral positions for the market-level borrow flow's collateral picker
  // Uses acceptedCollaterals which now carries decimals from ERC20 contract
  const marketBorrowCollateralPositions: ProtocolPosition[] = useMemo(() => {
    if (!marketBorrowMarket) return [];
    return marketBorrowMarket.acceptedCollaterals.map(col => ({
      icon: col.icon,
      name: col.symbol,
      tokenSymbol: col.symbol,
      balance: 0,
      tokenBalance: 0n,
      currentRate: 0,
      tokenAddress: col.address,
      tokenDecimals: col.decimals,
      tokenPrice: 0n,
      protocolContext: marketBorrowContext,
    }));
  }, [marketBorrowMarket, marketBorrowContext]);

  // Build metrics for header
  const headerMetrics: HeaderMetric[] = useMemo(() => [
    { label: "Balance", value: metrics.netBalance, type: "currency" },
    { label: "30D Yield", mobileLabel: "30D", value: metrics.netYield30d, type: "currency" },
    { label: "Net APY", value: metrics.netApyPercent, type: "apy" },
    {
      label: "Positions",
      value: metrics.positionsWithDebt,
      type: "custom",
      customRender: (hasData: boolean) => (
        <span className={`font-mono text-xs font-bold tabular-nums ${hasData ? "text-base-content" : MetricColors.MUTED}`}>
          {hasData ? metrics.positionsWithDebt : "\u2014"}
        </span>
      ),
    },
  ], [metrics]);

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? "p-1" : "space-y-2 py-2 sm:p-3"}`}>
      {/* Protocol Header */}
      <BaseProtocolHeader
        protocolName="Compound V3"
        protocolIcon="/logos/compound.svg"
        protocolUrl="https://app.compound.finance"
        isCollapsed={isCollapsed}
        isMarketsOpen={isMarketsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={toggleMarketsOpen}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

      {/* Markets Section */}
      <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
        <CompoundMarketsSection
          markets={markets}
          isLoading={isLoading}
          chainId={chainId || 1}
          onBorrow={connectedAddress ? handleMarketBorrow : undefined}
        />
      </CollapsibleSection>

      {/* Positions Section - one row per Comet market */}
      {!isCollapsed && hasPositions && (
        <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
          <div className="card-body p-4">
            {isLoading && !hasLoadedOnce ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="divide-base-content/10 divide-y">
                {activeMarkets.map((market) => {
                  // Find the corresponding positionGroup
                  const pgIdx = markets.indexOf(market);
                  const pg = positionGroups[pgIdx];
                  if (!pg) return null;
                  return (
                    <CompoundMarketRow
                      key={market.baseToken}
                      market={market}
                      positionGroup={pg}
                      chainId={chainId || 1}
                      isADLSupported={isADLSupported}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Market-level borrow: collateral picker */}
      <TokenSelectModal
        isOpen={marketBorrowCollateralSelect.isOpen}
        onClose={marketBorrowCollateralSelect.close}
        tokens={marketBorrowCollateralPositions}
        protocolName="compound"
        chainId={chainId || 1}
        context={marketBorrowContext}
        title="Select Collateral to Deposit"
        onTokenSelected={handleMarketBorrowCollateralSelected}
      />

      {/* Market-level borrow: deposit + borrow modal */}
      {marketBorrowCollateralTokenInfo && marketBorrowDebtTokenInfo && marketBorrowContext && (
        <DepositAndBorrowModal
          isOpen={marketBorrowModal.isOpen}
          onClose={handleCloseMarketBorrowFlow}
          protocolName="Compound"
          chainId={chainId || 1}
          collateralToken={marketBorrowCollateralTokenInfo}
          debtToken={marketBorrowDebtTokenInfo}
          context={marketBorrowContext}
          maxLtvBps={marketBorrowLtvBps}
          lltvBps={marketBorrowLltvBps}
        />
      )}
    </div>
  );
};

export default CompoundProtocolView;
