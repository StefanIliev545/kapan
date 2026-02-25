"use client";

import { FC, useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import { Cog6ToothIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { BaseProtocolHeader, type HeaderMetric } from "../common";
import { CollateralLtvBreakdown, type CollateralBreakdownItem } from "../common/UtilizationTooltip";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { MetricColors } from "~~/utils/protocolMetrics";
import {
  useEulerLendingPositions,
  useEulerVaults,
  type EulerPositionGroupWithBalances,
  type EulerVault,
} from "~~/hooks/useEulerLendingPositions";
import { EulerMarketsSection } from "./EulerMarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { AddButton } from "~~/components/common/AddButton";
import { MultiPositionLayout } from "~~/components/positions/MultiPositionLayout";
import { useEulerPositionGroups } from "~~/hooks/adapters/useEulerPositionGroups";
import type { PositionGroup } from "~~/types/positions";
import { CollateralSwapModal } from "~~/components/modals/CollateralSwapModal";
import { DebtSwapEvmModal } from "~~/components/modals/DebtSwapEvmModal";
import { CloseWithCollateralEvmModal } from "~~/components/modals/CloseWithCollateralEvmModal";
import { AddEulerCollateralModal } from "~~/components/modals/AddEulerCollateralModal";
import { EulerBorrowModal } from "~~/components/modals/EulerBorrowModal";
import { LTVAutomationModal } from "~~/components/modals/LTVAutomationModal";
import type { SwapAsset } from "~~/components/modals/SwapModalShell";
import { useADLContracts } from "~~/hooks/useADLOrder";
import { useActiveADL, formatLtvPercent } from "~~/hooks/useConditionalOrders";
import type { Address } from "viem";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { useGlobalState } from "~~/services/store/store";
import { useModal } from "~~/hooks/useModal";
import { BasicCollateral } from "~~/hooks/useMovePositionData";
import { useTxCompletedListenerDelayed } from "~~/hooks/common/useTxCompletedListener";
import { useExternalYields, isPTToken } from "~~/hooks/useExternalYields";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { formatSignedPercent } from "../utils";

// CSS class constants (used by EulerPositionGroupRow)
const TEXT_SUCCESS = "text-success";
const TEXT_ERROR = "text-error";

/** Metrics computed from user positions */
interface PositionMetrics {
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  /** Number of position groups with debt */
  positionsWithDebt: number;
}

/** Default metrics when no positions exist */
const EMPTY_METRICS: PositionMetrics = {
  netBalance: 0,
  netYield30d: 0,
  netApyPercent: null,
  positionsWithDebt: 0,
};

/** Collateral swap state for tracking which collateral is being swapped */
interface CollateralSwapState {
  isOpen: boolean;
  collateralVault: string;
  borrowVault: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  balance: bigint;
  context: `0x${string}`;
  /** All collaterals in the group for target asset selection */
  allCollaterals: BasicCollateral[];
}

const INITIAL_SWAP_STATE: CollateralSwapState = {
  isOpen: false,
  collateralVault: "",
  borrowVault: "",
  tokenAddress: "",
  tokenSymbol: "",
  tokenDecimals: 18,
  balance: 0n,
  context: "0x",
  allCollaterals: [],
};

/** Collateral info for Euler debt swap sub-account migration */
interface EulerCollateralForSwap {
  vaultAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  balance: bigint;
}

/** Debt swap state for tracking which debt is being swapped */
interface DebtSwapState {
  isOpen: boolean;
  borrowVault: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  balance: bigint;
  tokenPrice: bigint;
  context: `0x${string}`;
  /** All collateral vault addresses in the position */
  collateralVaults: string[];
  /** Full collateral info for sub-account migration */
  collaterals: EulerCollateralForSwap[];
  subAccountIndex: number;
}

const INITIAL_DEBT_SWAP_STATE: DebtSwapState = {
  isOpen: false,
  borrowVault: "",
  tokenAddress: "",
  tokenSymbol: "",
  tokenDecimals: 18,
  balance: 0n,
  tokenPrice: 0n,
  context: "0x",
  collateralVaults: [],
  collaterals: [],
  subAccountIndex: 0,
};

/** Close modal state for tracking debt position to close */
interface CloseModalState {
  isOpen: boolean;
  borrowVault: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  balance: bigint;
  tokenPrice: bigint;
  context: `0x${string}`;
  /** All collateral vault addresses in the position */
  collateralVaults: string[];
  subAccountIndex: number;
}

const INITIAL_CLOSE_STATE: CloseModalState = {
  isOpen: false,
  borrowVault: "",
  tokenAddress: "",
  tokenSymbol: "",
  tokenDecimals: 18,
  balance: 0n,
  tokenPrice: 0n,
  context: "0x",
  collateralVaults: [],
  subAccountIndex: 0,
};

/**
 * Display a single position group (1 debt + N collaterals) side by side
 * Uses SupplyPosition for collaterals (left) and BorrowPosition for debt (right)
 */
interface EulerPositionGroupRowProps {
  group: EulerPositionGroupWithBalances;
  /** Unified PositionGroup from the adapter hook (drives the layout component) */
  positionGroup: PositionGroup;
  chainId: number;
  /** Map of lowercase symbol -> price in raw format (8 decimals) */
  pricesRaw: Record<string, bigint>;
  /** All sub-account indices that are currently in use (have positions) */
  usedSubAccountIndices: number[];
  /** Whether ADL is supported on this chain */
  isADLSupported: boolean;
}

const EulerPositionGroupRow: FC<EulerPositionGroupRowProps> = ({ group, positionGroup, chainId, pricesRaw, usedSubAccountIndices, isADLSupported }) => {
  const { debt, collaterals, isMainAccount, subAccount } = group;
  const swapModal = useModal();
  const debtSwapModal = useModal();
  const closeModal = useModal();
  const addCollateralModal = useModal();
  const borrowModal = useModal();
  const adlModal = useModal();

  // ADL highlighting: detect active ADL order for this specific position group
  const { hasActiveADL, activeADL, triggerLtvBps, targetLtvBps } = useActiveADL({
    protocolName: "Euler",
    chainId,
    eulerBorrowVault: debt?.vault.address as Address | undefined,
  });
  const [swapState, setSwapState] = useState<CollateralSwapState>(INITIAL_SWAP_STATE);
  const [debtSwapState, setDebtSwapState] = useState<DebtSwapState>(INITIAL_DEBT_SWAP_STATE);
  const [closeState, setCloseState] = useState<CloseModalState>(INITIAL_CLOSE_STATE);

  // External yields (Pendle PT implied yield, LST staking yield, Maple syrup yield)
  // Used to show accurate supply rates for collateral tokens that have external yield sources
  const { getEffectiveSupplyRate, findYield } = useExternalYields(chainId);

  // Extract sub-account index from sub-account address (last byte)
  // Sub-account address = (userAddress & ~0xFF) | subAccountIndex
  const subAccountIndex = useMemo(() => {
    if (!subAccount) return 0;
    // Get last byte of address
    const lastByte = parseInt(subAccount.slice(-2), 16);
    return lastByte;
  }, [subAccount]);

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
  // Include eulerCollateralVault and eulerSubAccountIndex for each collateral to enable per-collateral source contexts
  const moveSupport = useMemo(() => ({
    preselectedCollaterals: collaterals.map((col) => ({
      token: col.vault.asset.address,
      symbol: col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol,
      decimals: col.vault.asset.decimals,
      amount: col.balance,
      maxAmount: col.balance,
      supported: true,
      // Euler-specific: include the collateral vault address and sub-account index for source context
      eulerCollateralVault: col.vault.address,
      eulerSubAccountIndex: subAccountIndex,
    })),
    // Euler allows multiple collaterals, so don't disable selection
    disableCollateralSelection: false,
  }), [collaterals, subAccountIndex]);

  // Build available collaterals for swap modal (all collaterals in group)
  const allCollateralsForSwap: BasicCollateral[] = useMemo(() =>
    collaterals.map((col) => ({
      address: col.vault.asset.address,
      symbol: col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol,
      decimals: col.vault.asset.decimals,
      rawBalance: col.balance,
      balance: Number(col.balance) / (10 ** col.vault.asset.decimals),
      icon: getIcon(col.vault.asset.symbol),
      price: pricesRaw[col.vault.asset.symbol?.toLowerCase()] ?? 0n,
    })),
    [collaterals, pricesRaw, getIcon]
  );

  // Calculate total collateral and debt USD values for ADL modal (scaled to 8 decimals)
  const { totalCollateralUsd, totalDebtUsd } = useMemo(() => {
    let collateralUsd = 0n;
    for (const col of collaterals) {
      const symbol = col.vault.asset.symbol?.toLowerCase();
      const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
      if (col.balance > 0n && priceRaw > 0n) {
        // balance * price / 10^decimals gives USD value in 8 decimals
        collateralUsd += (col.balance * priceRaw) / BigInt(10 ** col.vault.asset.decimals);
      }
    }

    let debtUsd = 0n;
    if (debt && debt.balance > 0n) {
      const symbol = debt.vault.asset.symbol?.toLowerCase();
      const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
      if (priceRaw > 0n) {
        debtUsd = (debt.balance * priceRaw) / BigInt(10 ** debt.vault.asset.decimals);
      }
    }

    return { totalCollateralUsd: collateralUsd, totalDebtUsd: debtUsd };
  }, [collaterals, debt, pricesRaw]);

  // Per-sub-account net yield metrics (Net APY, 30D yield)
  // For PT tokens, standard oracle prices are often missing — fall back to Pendle's ptPriceUsd
  const subAccountYieldMetrics = useMemo(() => {
    const supplied = collaterals.map(col => {
      const sym = col.vault.asset.symbol;
      const symLower = sym?.toLowerCase() ?? "";
      let priceRaw = pricesRaw[symLower] ?? 0n;

      // PT tokens often lack oracle prices — use Pendle's PT price as fallback
      if (priceRaw === 0n && isPTToken(sym)) {
        const ptYield = findYield(col.vault.asset.address, sym);
        if (ptYield?.metadata?.ptPriceUsd && ptYield.metadata.ptPriceUsd > 0) {
          priceRaw = BigInt(Math.round(ptYield.metadata.ptPriceUsd * 1e8));
        }
      }

      const balanceUsd = priceRaw > 0n
        ? (Number(col.balance) / 10 ** col.vault.asset.decimals) * (Number(priceRaw) / 1e8)
        : 0;
      const rate = getEffectiveSupplyRate(col.vault.asset.address, sym, (col.vault.supplyApy ?? 0) * 100);
      return { balance: balanceUsd, currentRate: rate };
    });

    const borrowed = debt && debt.balance > 0n ? (() => {
      const symLower = debt.vault.asset.symbol?.toLowerCase() ?? "";
      const priceRaw = pricesRaw[symLower] ?? 0n;
      const balanceUsd = priceRaw > 0n
        ? (Number(debt.balance) / 10 ** debt.vault.asset.decimals) * (Number(priceRaw) / 1e8)
        : 0;
      return [{ balance: balanceUsd, currentRate: (debt.vault.borrowApy ?? 0) * 100 }];
    })() : [];

    return calculateNetYieldMetrics(supplied, borrowed);
  }, [collaterals, debt, pricesRaw, getEffectiveSupplyRate, findYield]);

  // Handler to open collateral swap modal
  const handleOpenSwap = useCallback((collateral: typeof collaterals[0]) => {
    const symbol = collateral.vault.asset.symbol === "???" ? "unknown" : collateral.vault.asset.symbol;
    const context = encodeEulerContext({
      borrowVault: borrowVaultAddress,
      collateralVault: collateral.vault.address,
      subAccountIndex,
    }) as `0x${string}`;
    setSwapState({
      isOpen: true,
      collateralVault: collateral.vault.address,
      borrowVault: borrowVaultAddress,
      tokenAddress: collateral.vault.asset.address,
      tokenSymbol: symbol,
      tokenDecimals: collateral.vault.asset.decimals,
      balance: collateral.balance,
      context,
      allCollaterals: allCollateralsForSwap,
    });
    swapModal.open();
  }, [borrowVaultAddress, allCollateralsForSwap, swapModal, subAccountIndex]);

  // Handler to close collateral swap modal
  const handleCloseSwap = useCallback(() => {
    swapModal.close();
    setSwapState(INITIAL_SWAP_STATE);
  }, [swapModal]);

  // Handler to open debt swap modal
  const handleOpenDebtSwap = useCallback(() => {
    if (!debt) return;
    const symbol = debt.vault.asset.symbol === "???" ? "unknown" : debt.vault.asset.symbol;
    const primaryCollateralVault = collaterals[0]?.vault.address || debt.vault.address;
    const context = encodeEulerContext({
      borrowVault: debt.vault.address,
      collateralVault: primaryCollateralVault,
      subAccountIndex,
    }) as `0x${string}`;
    // Build full collateral info for sub-account migration
    const collateralsForSwap: EulerCollateralForSwap[] = collaterals.map(c => ({
      vaultAddress: c.vault.address,
      tokenAddress: c.vault.asset.address,
      tokenSymbol: c.vault.asset.symbol,
      decimals: c.vault.asset.decimals,
      balance: c.balance,
    }));
    setDebtSwapState({
      isOpen: true,
      borrowVault: debt.vault.address,
      tokenAddress: debt.vault.asset.address,
      tokenSymbol: symbol,
      tokenDecimals: debt.vault.asset.decimals,
      balance: debt.balance,
      tokenPrice: pricesRaw[symbol.toLowerCase()] ?? 0n,
      context,
      collateralVaults: collaterals.map(c => c.vault.address),
      collaterals: collateralsForSwap,
      subAccountIndex,
    });
    debtSwapModal.open();
  }, [debt, collaterals, subAccountIndex, pricesRaw, debtSwapModal]);

  // Handler to close debt swap modal
  const handleCloseDebtSwap = useCallback(() => {
    debtSwapModal.close();
    setDebtSwapState(INITIAL_DEBT_SWAP_STATE);
  }, [debtSwapModal]);

  // Handler to open close with collateral modal
  const handleOpenCloseModal = useCallback(() => {
    if (!debt) return;
    const symbol = debt.vault.asset.symbol === "???" ? "unknown" : debt.vault.asset.symbol;
    const primaryCollateralVault = collaterals[0]?.vault.address || debt.vault.address;
    const context = encodeEulerContext({
      borrowVault: debt.vault.address,
      collateralVault: primaryCollateralVault,
      subAccountIndex,
    }) as `0x${string}`;
    setCloseState({
      isOpen: true,
      borrowVault: debt.vault.address,
      tokenAddress: debt.vault.asset.address,
      tokenSymbol: symbol,
      tokenDecimals: debt.vault.asset.decimals,
      balance: debt.balance,
      tokenPrice: pricesRaw[symbol.toLowerCase()] ?? 0n,
      context,
      collateralVaults: collaterals.map(c => c.vault.address),
      subAccountIndex,
    });
    closeModal.open();
  }, [debt, collaterals, subAccountIndex, pricesRaw, closeModal]);

  // Handler to close close modal
  const handleCloseCloseModal = useCallback(() => {
    closeModal.close();
    setCloseState(INITIAL_CLOSE_STATE);
  }, [closeModal]);

  // Get health status color and label based on how close currentLtv is to LLTV
  const getHealthStatus = () => {
    if (!group.liquidity) return null;
    const { currentLtv, effectiveLltv, liquidationHealth } = group.liquidity;

    // Color based on how close to liquidation
    // currentLtv / effectiveLltv gives us utilization of the LLTV
    const utilizationOfLltv = effectiveLltv > 0 ? (currentLtv / effectiveLltv) * 100 : 0;

    let colorClass = TEXT_SUCCESS;
    let label = "Healthy";
    if (liquidationHealth < 1.0) {
      colorClass = TEXT_ERROR;
      label = "Liquidatable";
    } else if (utilizationOfLltv > 90) {
      colorClass = TEXT_ERROR;
      label = "At Risk";
    } else if (utilizationOfLltv > 75) {
      colorClass = "text-warning";
      label = "Caution";
    }

    return { currentLtv, effectiveLltv, colorClass, label };
  };

  const healthStatus = getHealthStatus();

  // Build collateral breakdown for the hover tooltip
  const collateralBreakdown = useMemo((): CollateralBreakdownItem[] => {
    const activeCollaterals = collaterals.filter(c => c.balance > 0n);
    if (activeCollaterals.length === 0 || !group.liquidity) return [];

    const ltvMap = new Map(
      group.liquidity.collateralLtvs.map(l => [l.collateralVault.toLowerCase(), l]),
    );

    const items = activeCollaterals.map(col => {
      const symbol = col.vault.asset.symbol?.toLowerCase() ?? "";
      const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
      const valueUsd = priceRaw > 0n
        ? (Number(col.balance) / 10 ** col.vault.asset.decimals) * (Number(priceRaw) / 1e8)
        : 0;
      const ltv = ltvMap.get(col.vault.address.toLowerCase());
      return {
        name: col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol,
        icon: getIcon(col.vault.asset.symbol),
        valueUsd,
        // borrowLtv/liquidationLtv are percentages (e.g., 80 = 80%), convert to bps
        ltvBps: ltv ? Math.round(ltv.borrowLtv * 100) : 0,
        lltvBps: ltv ? Math.round(ltv.liquidationLtv * 100) : 0,
        weightPct: 0, // filled below
      };
    });

    const totalUsd = items.reduce((sum, i) => sum + i.valueUsd, 0);
    if (totalUsd > 0) {
      for (const item of items) {
        item.weightPct = (item.valueUsd / totalUsd) * 100;
      }
    }
    return items;
  }, [collaterals, group.liquidity, pricesRaw, getIcon]);

  const debtUsdNumber = Number(totalDebtUsd) / 1e8;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <MultiPositionLayout
        group={positionGroup}
        header={
          <div className="mb-2 flex items-center justify-between text-xs">
            {/* Left: label + balance */}
            <div className="flex items-center gap-2">
              {!isMainAccount && (
                <span className="text-base-content/40 text-[10px] font-medium uppercase tracking-wider">
                  Sub-account
                </span>
              )}
              <span className="text-base-content/60 font-mono tabular-nums">
                Balance:{" "}
                <span className={`font-semibold ${subAccountYieldMetrics.netBalance >= 0 ? TEXT_SUCCESS : TEXT_ERROR}`}>
                  {formatCurrencyCompact(subAccountYieldMetrics.netBalance)}
                </span>
              </span>
            </div>
            {/* Right: rates */}
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {/* Net APY */}
              <span className="text-base-content/60 font-mono tabular-nums">
                APY:{" "}
                <span className={`font-semibold ${subAccountYieldMetrics.netApyPercent == null ? "text-base-content/40" : subAccountYieldMetrics.netApyPercent >= 0 ? TEXT_SUCCESS : TEXT_ERROR}`}>
                  {subAccountYieldMetrics.netApyPercent != null ? formatSignedPercent(subAccountYieldMetrics.netApyPercent) : "—"}
                </span>
              </span>
              {/* 30D Yield with annual tooltip */}
              <span className="text-base-content/60 group relative cursor-help font-mono tabular-nums">
                30D:{" "}
                <span className={`font-semibold ${subAccountYieldMetrics.netYield30d >= 0 ? TEXT_SUCCESS : TEXT_ERROR}`}>
                  {formatCurrencyCompact(subAccountYieldMetrics.netYield30d)}
                </span>
                <span className="bg-base-300 text-base-content pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  Est. annual: <span className={subAccountYieldMetrics.netAnnualYield >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>{formatCurrencyCompact(subAccountYieldMetrics.netAnnualYield)}</span>
                </span>
              </span>
              {/* LTV + health */}
              {healthStatus && (
                <>
                  <div className="group/ltv relative inline-flex items-center gap-1 font-mono tabular-nums">
                    <span className="text-base-content/60">
                      LTV:{" "}
                      <span className={`font-semibold ${healthStatus.colorClass}`}>
                        {healthStatus.currentLtv.toFixed(1)}%
                      </span>
                      <span className="text-base-content/50">/{healthStatus.effectiveLltv.toFixed(0)}%</span>
                    </span>
                    {collateralBreakdown.length > 0 && (
                      <>
                        <span className="text-primary text-[8px]">{"\u24d8"}</span>
                        <div className="pointer-events-none absolute right-0 top-full z-[100] mt-2 hidden group-hover/ltv:block">
                          <div className="bg-base-100 ring-base-300/50 pointer-events-auto min-w-[280px] rounded-lg p-3 shadow-xl ring-1">
                            <CollateralLtvBreakdown items={collateralBreakdown} totalDebtUsd={debtUsdNumber} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium uppercase ${healthStatus.colorClass}`}>
                    {healthStatus.label}
                  </span>
                </>
              )}
              {/* Automate button */}
              {isADLSupported && debt && collaterals.length > 0 && (
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
          collaterals.length === 0 ? undefined : (
            <div className="space-y-2">
              {collaterals.map((col, idx) => {
                const symbol = col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol;
                const context = encodeEulerContext({
                  borrowVault: borrowVaultAddress,
                  collateralVault: col.vault.address,
                  subAccountIndex,
                });
                return (
                  <SupplyPosition
                    key={col.vault.address || idx}
                    icon={getIcon(col.vault.asset.symbol)}
                    name={symbol}
                    tokenSymbol={symbol}
                    balance={0}
                    tokenBalance={col.balance}
                    currentRate={getEffectiveSupplyRate(col.vault.asset.address, col.vault.asset.symbol, (col.vault.supplyApy ?? 0) * 100)}
                    tokenAddress={col.vault.asset.address}
                    tokenDecimals={col.vault.asset.decimals}
                    tokenPrice={getPrice(col.vault.asset.symbol)}
                    protocolName="Euler"
                    networkType="evm"
                    chainId={chainId}
                    protocolContext={context}
                    availableActions={{ deposit: true, withdraw: true, move: true, swap: true }}
                    onSwap={() => handleOpenSwap(col)}
                    adlActive={
                      activeADL?.triggerParams?.collateralToken?.toLowerCase() === col.vault.asset.address.toLowerCase()
                    }
                  />
                );
              })}
            </div>
          )
        }
        collateralFooter={
          debt ? (
            <AddButton onClick={addCollateralModal.open} label="Add Collateral" />
          ) : undefined
        }
        debtContent={
          !debt ? undefined : (() => {
            const debtSymbol = debt.vault.asset.symbol === "???" ? "unknown" : debt.vault.asset.symbol;
            const primaryCollateralVault = collaterals[0]?.vault.address || debt.vault.address;
            const debtContext = encodeEulerContext({
              borrowVault: debt.vault.address,
              collateralVault: primaryCollateralVault,
              subAccountIndex,
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
                availableActions={{ borrow: true, repay: true, move: true, close: collaterals.length > 0, swap: collaterals.length > 0 }}
                moveSupport={moveSupport}
                availableAssets={allCollateralsForSwap}
                onSwap={collaterals.length > 0 ? handleOpenDebtSwap : undefined}
                onClosePosition={collaterals.length > 0 ? handleOpenCloseModal : undefined}
                adlProtected={
                  activeADL?.triggerParams?.debtToken?.toLowerCase() === debt.vault.asset.address.toLowerCase()
                }
              />
            );
          })()
        }
        debtFooter={
          !debt && collaterals.length > 0 ? (
            <AddButton onClick={borrowModal.open} label="Borrow" />
          ) : undefined
        }
      />

      {/* Collateral Swap Modal */}
      <CollateralSwapModal
        isOpen={swapModal.isOpen}
        onClose={handleCloseSwap}
        protocolName="Euler"
        availableAssets={swapState.allCollaterals}
        initialFromTokenAddress={swapState.tokenAddress}
        chainId={chainId}
        context={swapState.context}
        position={{
          name: swapState.tokenSymbol,
          tokenAddress: swapState.tokenAddress,
          decimals: swapState.tokenDecimals,
          balance: swapState.balance,
          type: "supply",
        }}
        eulerBorrowVault={swapState.borrowVault}
        eulerCollateralVault={swapState.collateralVault}
        eulerSubAccountIndex={subAccountIndex}
      />

      {/* Debt Swap Modal */}
      <DebtSwapEvmModal
        isOpen={debtSwapModal.isOpen}
        onClose={handleCloseDebtSwap}
        protocolName="Euler"
        chainId={chainId}
        debtFromToken={debtSwapState.tokenAddress as `0x${string}`}
        debtFromName={debtSwapState.tokenSymbol}
        debtFromIcon={getIcon(debtSwapState.tokenSymbol)}
        debtFromDecimals={debtSwapState.tokenDecimals}
        debtFromPrice={debtSwapState.tokenPrice}
        currentDebtBalance={debtSwapState.balance}
        availableAssets={[]}
        context={debtSwapState.context}
        eulerBorrowVault={debtSwapState.borrowVault}
        eulerCollateralVaults={debtSwapState.collateralVaults}
        eulerSubAccountIndex={debtSwapState.subAccountIndex}
        eulerUsedSubAccountIndices={usedSubAccountIndices}
        eulerCollaterals={debtSwapState.collaterals}
      />

      {/* Close with Collateral Modal */}
      <CloseWithCollateralEvmModal
        isOpen={closeModal.isOpen}
        onClose={handleCloseCloseModal}
        protocolName="Euler"
        chainId={chainId}
        debtToken={closeState.tokenAddress as `0x${string}`}
        debtName={closeState.tokenSymbol}
        debtIcon={getIcon(closeState.tokenSymbol)}
        debtDecimals={closeState.tokenDecimals}
        debtPrice={closeState.tokenPrice}
        debtBalance={closeState.balance}
        availableCollaterals={collaterals.map((col): SwapAsset => ({
          symbol: col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol,
          address: col.vault.asset.address,
          decimals: col.vault.asset.decimals,
          rawBalance: col.balance,
          balance: Number(col.balance) / (10 ** col.vault.asset.decimals),
          icon: getIcon(col.vault.asset.symbol),
          price: pricesRaw[col.vault.asset.symbol?.toLowerCase()] ?? 0n,
          eulerCollateralVault: col.vault.address,
        }))}
        context={closeState.context}
        eulerBorrowVault={closeState.borrowVault}
        eulerCollateralVaults={closeState.collateralVaults}
        eulerSubAccountIndex={closeState.subAccountIndex}
      />

      {/* Add Collateral Modal */}
      {debt && (
        <AddEulerCollateralModal
          isOpen={addCollateralModal.isOpen}
          onClose={addCollateralModal.close}
          chainId={chainId}
          borrowVaultAddress={debt.vault.address}
          existingCollateralVaults={collaterals.map(c => c.vault.address)}
        />
      )}

      {/* Borrow Modal - shown when user has collateral but no debt */}
      {!debt && collaterals.length > 0 && (
        <EulerBorrowModal
          isOpen={borrowModal.isOpen}
          onClose={borrowModal.close}
          chainId={chainId}
          collateralVaultAddresses={collaterals.map(c => c.vault.address)}
          subAccountIndex={subAccountIndex}
          collateralData={collaterals.map(col => ({
            vaultAddress: col.vault.address,
            tokenAddress: col.vault.asset.address,
            tokenSymbol: col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol,
            tokenDecimals: col.vault.asset.decimals,
            balance: col.balance,
            priceRaw: pricesRaw[col.vault.asset.symbol?.toLowerCase()] ?? 0n,
          }))}
        />
      )}

      {/* ADL Automation Modal */}
      {debt && collaterals.length > 0 && healthStatus && (
        <LTVAutomationModal
          isOpen={adlModal.isOpen}
          onClose={adlModal.close}
          protocolName="Euler"
          chainId={chainId}
          currentLtvBps={Math.round(healthStatus.currentLtv * 100)}
          liquidationLtvBps={Math.round(healthStatus.effectiveLltv * 100)}
          collateralTokens={collaterals.map((col): SwapAsset => {
            const symbol = col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol;
            const priceRaw = pricesRaw[symbol.toLowerCase()] ?? 0n;
            const balance = Number(col.balance) / (10 ** col.vault.asset.decimals);
            const usdValue = balance * (Number(priceRaw) / 1e8);
            return {
              symbol,
              address: col.vault.asset.address,
              decimals: col.vault.asset.decimals,
              rawBalance: col.balance,
              balance,
              icon: getIcon(col.vault.asset.symbol),
              price: priceRaw,
              usdValue,
            };
          })}
          debtToken={{
            address: debt.vault.asset.address,
            symbol: debt.vault.asset.symbol === "???" ? "unknown" : debt.vault.asset.symbol,
            decimals: debt.vault.asset.decimals,
            balance: debt.balance,
          }}
          totalCollateralUsd={totalCollateralUsd}
          totalDebtUsd={totalDebtUsd}
          eulerBorrowVault={debt.vault.address}
          eulerCollateralVaults={collaterals.map(c => c.vault.address)}
          eulerSubAccountIndex={subAccountIndex}
        />
      )}
    </div>
  );
};

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
  const openPositionModal = useModal();

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
    enrichedPositionGroups,
    hasLoadedOnce,
    isLoadingPositions,
    refetchPositions,
  } = useEulerLendingPositions(effectiveChainId, connectedAddress);

  // Check if ADL is supported on this chain
  const { isSupported: isADLSupported } = useADLContracts(effectiveChainId);

  // External yields for protocol-level metrics (Pendle PT, LST, Maple)
  const { getEffectiveSupplyRate: getProtocolEffectiveRate, findYield: findProtocolYield } = useExternalYields(effectiveChainId);

  // Refetch positions after transactions complete (with delay for subgraph indexing)
  useTxCompletedListenerDelayed(
    useCallback(() => {
      refetchPositions();
    }, [refetchPositions]),
    3000, // 3 second delay for subgraph to index
    hasLoadedOnce
  );

  // Extract unique token addresses and build address→symbol mapping for price fetching.
  // Stabilize the tokenAddresses array by value (sorted join) so the downstream
  // price query doesn't restart every time enrichedPositionGroups re-renders
  // with the same token set but a new object reference.
  const prevAddrKeyRef = useRef("");
  const prevTokenAddressesRef = useRef<string[]>([]);

  const { tokenAddresses, addressToSymbol } = useMemo(() => {
    const addrs = new Set<string>();
    const mapping: Record<string, string> = {};
    for (const group of enrichedPositionGroups) {
      if (group.debt?.vault.asset.address && group.debt.vault.asset.symbol !== "???") {
        const addr = group.debt.vault.asset.address.toLowerCase();
        addrs.add(addr);
        mapping[addr] = group.debt.vault.asset.symbol.toLowerCase();
      }
      for (const col of group.collaterals) {
        if (col.vault.asset.address && col.vault.asset.symbol !== "???") {
          const addr = col.vault.asset.address.toLowerCase();
          addrs.add(addr);
          mapping[addr] = col.vault.asset.symbol.toLowerCase();
        }
      }
    }
    const sorted = Array.from(addrs).sort();
    const key = sorted.join(",");
    // Only produce a new array reference if the actual addresses changed
    if (key !== prevAddrKeyRef.current) {
      prevAddrKeyRef.current = key;
      prevTokenAddressesRef.current = sorted;
    }
    return { tokenAddresses: prevTokenAddressesRef.current, addressToSymbol: mapping };
  }, [enrichedPositionGroups]);

  // Fetch token prices by contract address (no symbol ambiguity)
  const { pricesRaw: pricesRawByAddress, isLoading: isPricesLoading, isSuccess: hasPricesLoaded } = useTokenPricesByAddress(
    effectiveChainId,
    tokenAddresses,
    { enabled: tokenAddresses.length > 0 },
  );

  // Map address-keyed prices back to symbol keys (downstream code uses symbol lookups)
  const pricesRaw = useMemo(() => {
    const result: Record<string, bigint> = {};
    for (const [addr, price] of Object.entries(pricesRawByAddress)) {
      const symbol = addressToSymbol[addr.toLowerCase()];
      if (symbol) {
        result[symbol] = price;
      }
    }
    return result;
  }, [pricesRawByAddress, addressToSymbol]);

  // Check if we have meaningful price data (at least one non-zero price)
  const hasPrices = hasPricesLoaded && Object.keys(pricesRaw).length > 0;

  // Helper: calculate USD value from balance and price (8 decimal prices)
  const calcUsdValue = (balance: bigint, decimals: number, priceRaw: bigint): number => {
    if (balance <= 0n || priceRaw <= 0n) return 0;
    return (Number(balance) / 10 ** decimals) * (Number(priceRaw) / 1e8);
  };

  // Helper: sum collateral and debt USD values across position groups
  const sumPositionValues = (groups: typeof enrichedPositionGroups) => {
    let totalCollateral = 0;
    let totalDebt = 0;
    let debtCount = 0;
    for (const group of groups) {
      for (const col of group.collaterals) {
        const symbol = col.vault.asset.symbol?.toLowerCase();
        const price = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
        totalCollateral += calcUsdValue(col.balance, col.vault.asset.decimals, price);
      }
      if (group.debt && group.debt.balance > 0n) {
        debtCount++;
        const symbol = group.debt.vault.asset.symbol?.toLowerCase();
        const price = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
        totalDebt += calcUsdValue(group.debt.balance, group.debt.vault.asset.decimals, price);
      }
    }
    return { totalCollateral, totalDebt, debtCount };
  };

  // Compute metrics from enriched position groups using balances and prices
  // This handles both positions with debt (have liquidity data) and supply-only positions
  // Note: We still calculate metrics even while prices are loading to avoid UI flicker,
  // but keepPreviousData in useTokenPrices ensures we show stale prices rather than $0
  const metrics = useMemo((): PositionMetrics => {
    if (!enrichedPositionGroups.length) return EMPTY_METRICS;
    // If prices are still loading on initial load (no previous data), show null metrics
    if (isPricesLoading && !hasPrices) return EMPTY_METRICS;

    const { totalCollateral, totalDebt, debtCount } = sumPositionValues(enrichedPositionGroups);

    // Aggregate supply/borrow positions across all sub-accounts for net yield calculation
    const supplied: Array<{ balance: number; currentRate: number }> = [];
    const borrowed: Array<{ balance: number; currentRate: number }> = [];
    for (const group of enrichedPositionGroups) {
      for (const col of group.collaterals) {
        const sym = col.vault.asset.symbol;
        const symLower = sym?.toLowerCase() ?? "";
        let price = pricesRaw[symLower] ?? 0n;

        // PT tokens often lack oracle prices — use Pendle's PT price as fallback
        if (price === 0n && isPTToken(sym)) {
          const ptYield = findProtocolYield(col.vault.asset.address, sym);
          if (ptYield?.metadata?.ptPriceUsd && ptYield.metadata.ptPriceUsd > 0) {
            price = BigInt(Math.round(ptYield.metadata.ptPriceUsd * 1e8));
          }
        }

        const balanceUsd = calcUsdValue(col.balance, col.vault.asset.decimals, price);
        if (balanceUsd <= 0) continue;
        const rate = getProtocolEffectiveRate(col.vault.asset.address, sym, (col.vault.supplyApy ?? 0) * 100);
        supplied.push({ balance: balanceUsd, currentRate: rate });
      }
      if (group.debt && group.debt.balance > 0n) {
        const symbol = group.debt.vault.asset.symbol?.toLowerCase() ?? "";
        const price = pricesRaw[symbol] ?? 0n;
        const balanceUsd = calcUsdValue(group.debt.balance, group.debt.vault.asset.decimals, price);
        if (balanceUsd > 0) {
          borrowed.push({ balance: balanceUsd, currentRate: (group.debt.vault.borrowApy ?? 0) * 100 });
        }
      }
    }
    const yieldMetrics = calculateNetYieldMetrics(supplied, borrowed);

    return {
      netBalance: totalCollateral - totalDebt,
      netYield30d: yieldMetrics.netYield30d,
      netApyPercent: yieldMetrics.netApyPercent,
      positionsWithDebt: debtCount,
    };
  }, [enrichedPositionGroups, pricesRaw, isPricesLoading, hasPrices, getProtocolEffectiveRate, findProtocolYield]);

  // Compute all used sub-account indices (for debt swap to find next available)
  const usedSubAccountIndices = useMemo(() => {
    return enrichedPositionGroups.map(group => {
      if (!group.subAccount) return 0;
      // Extract last byte of address as index
      return parseInt(group.subAccount.slice(-2), 16);
    });
  }, [enrichedPositionGroups]);

  // Next available sub-account index for fresh positions
  const nextSubAccountIndex = useMemo(() => {
    if (usedSubAccountIndices.length === 0) return 0;
    const maxUsed = Math.max(...usedSubAccountIndices);
    return maxUsed + 1;
  }, [usedSubAccountIndices]);

  // Adapter hook: convert enriched groups to unified PositionGroup[] for topology layout
  const positionGroups = useEulerPositionGroups(effectiveChainId, enrichedPositionGroups);

  // Report totals to global state (using balance + price calculation from metrics)
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce) return;
    // Don't report $0 totals while prices are loading for the first time
    if (isPricesLoading && !hasPrices) return;

    const { totalCollateral, totalDebt } = sumPositionValues(enrichedPositionGroups);
    setProtocolTotals("Euler", totalCollateral, totalDebt);
  }, [hasLoadedOnce, enrichedPositionGroups, pricesRaw, setProtocolTotals, effectiveChainId, isPricesLoading, hasPrices]);

  // Use enrichedPositionGroups for hasPositions check - this comes from subgraph data
  // and ensures auto-expand works even before balance fetching completes
  const hasPositions = enrichedPositionGroups.length > 0;

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

  // Track which vault the user clicked "Borrow" on in the markets table
  const [preselectedBorrowVault, setPreselectedBorrowVault] = useState<string | null>(null);

  // Handle "Borrow" click from a market row — opens EulerBorrowModal with the vault pre-selected
  const handleMarketBorrow = useCallback((vault: EulerVault) => {
    setPreselectedBorrowVault(vault.address);
    openPositionModal.open();
  }, [openPositionModal]);

  const handleCloseOpenPosition = useCallback(() => {
    setPreselectedBorrowVault(null);
    openPositionModal.close();
  }, [openPositionModal]);

  // Build metrics array for the header
  const headerMetrics: HeaderMetric[] = useMemo(() => [
    { label: "Balance", value: metrics.netBalance, type: "currency" },
    { label: "30D Yield", mobileLabel: "30D", value: metrics.netYield30d, type: "currency" },
    { label: "Net APY", value: metrics.netApyPercent, type: "apy" },
    {
      label: "Positions",
      value: metrics.positionsWithDebt,
      type: "custom",
      customRender: (hasData: boolean) => (
        <span className={`font-mono text-xs font-bold tabular-nums ${hasData ? 'text-base-content' : MetricColors.MUTED}`}>
          {hasData ? metrics.positionsWithDebt : "—"}
        </span>
      ),
    },
  ], [metrics]);

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 py-2 sm:p-3'}`}>
      {/* Protocol Header */}
      <BaseProtocolHeader
        protocolName="Euler"
        protocolIcon="/logos/euler.svg"
        protocolUrl="https://app.euler.finance"
        isCollapsed={isCollapsed}
        isMarketsOpen={isMarketsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={toggleMarketsOpen}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

      {/* Markets Section - expandable */}
      <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
        <EulerMarketsSection
          vaults={vaults}
          isLoading={isLoadingMarkets}
          chainId={effectiveChainId}
          onBorrow={connectedAddress ? handleMarketBorrow : undefined}
        />
      </CollapsibleSection>

      {/* Positions Section - grouped by sub-account with collaterals left, debt right */}
      {!isCollapsed && hasPositions && (
        <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
          <div className="card-body p-4">
            {isLoadingPositions && !hasLoadedOnce ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="divide-base-content/10 divide-y">
                {enrichedPositionGroups.map((group, idx) => (
                  <EulerPositionGroupRow key={group.subAccount || idx} group={group} positionGroup={positionGroups[idx]} chainId={chainId} pricesRaw={pricesRaw} usedSubAccountIndices={usedSubAccountIndices} isADLSupported={isADLSupported} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Borrow modal triggered from market rows (deposit collateral + borrow in one tx) */}
      <EulerBorrowModal
        isOpen={openPositionModal.isOpen}
        onClose={handleCloseOpenPosition}
        chainId={effectiveChainId}
        collateralVaultAddresses={[]}
        subAccountIndex={nextSubAccountIndex}
        needsCollateral
        defaultBorrowVault={preselectedBorrowVault}
      />
    </div>
  );
};
