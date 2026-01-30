"use client";

import { FC, useState, useMemo, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { BaseProtocolHeader, type HeaderMetric } from "../common";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { MetricColors } from "~~/utils/protocolMetrics";
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
import { CollateralSwapModal } from "~~/components/modals/CollateralSwapModal";
import { DebtSwapEvmModal } from "~~/components/modals/DebtSwapEvmModal";
import { CloseWithCollateralEvmModal } from "~~/components/modals/CloseWithCollateralEvmModal";
import { AddEulerCollateralModal } from "~~/components/modals/AddEulerCollateralModal";
import { EulerBorrowModal } from "~~/components/modals/EulerBorrowModal";
import { LTVAutomationModal } from "~~/components/modals/LTVAutomationModal";
import type { SwapAsset } from "~~/components/modals/SwapModalShell";
import { useADLContracts } from "~~/hooks/useADLOrder";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";
import { useTokenPrices } from "~~/hooks/useTokenPrice";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { useGlobalState } from "~~/services/store/store";
import { useModal } from "~~/hooks/useModal";
import { BasicCollateral } from "~~/hooks/useMovePositionData";
import { useTxCompletedListenerDelayed } from "~~/hooks/common/useTxCompletedListener";

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
  chainId: number;
  /** Map of lowercase symbol -> price in raw format (8 decimals) */
  pricesRaw: Record<string, bigint>;
  /** All sub-account indices that are currently in use (have positions) */
  usedSubAccountIndices: number[];
  /** Whether ADL is supported on this chain */
  isADLSupported: boolean;
}

const EulerPositionGroupRow: FC<EulerPositionGroupRowProps> = ({ group, chainId, pricesRaw, usedSubAccountIndices, isADLSupported }) => {
  const { debt, collaterals, isMainAccount, subAccount } = group;
  const swapModal = useModal();
  const debtSwapModal = useModal();
  const closeModal = useModal();
  const addCollateralModal = useModal();
  const borrowModal = useModal();
  const adlModal = useModal();
  const [swapState, setSwapState] = useState<CollateralSwapState>(INITIAL_SWAP_STATE);
  const [debtSwapState, setDebtSwapState] = useState<DebtSwapState>(INITIAL_DEBT_SWAP_STATE);
  const [closeState, setCloseState] = useState<CloseModalState>(INITIAL_CLOSE_STATE);

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

  return (
    <div className="bg-base-300/30 rounded-lg p-3">
      {/* Header: Sub-account label + Health indicator */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          {!isMainAccount && (
            <span className="text-base-content/40 text-[10px] font-medium uppercase tracking-wider">
              Sub-account
            </span>
          )}
        </div>
        {/* Health indicator for positions with debt - similar to Morpho display */}
        {healthStatus && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base-content/60">
              LTV:{" "}
              <span className={`font-mono font-semibold ${healthStatus.colorClass}`}>
                {healthStatus.currentLtv.toFixed(1)}%
              </span>
              <span className="text-base-content/50">/{healthStatus.effectiveLltv.toFixed(0)}%</span>
            </span>
            <span className={`text-[10px] font-medium uppercase ${healthStatus.colorClass}`}>
              {healthStatus.label}
            </span>
            {/* ADL Settings Cog - only show if ADL is supported and user has debt and collateral */}
            {isADLSupported && debt && collaterals.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adlModal.open();
                }}
                className="text-base-content/50 hover:text-base-content hover:bg-base-200 rounded-lg p-1 transition-colors"
                title="Auto-Deleverage Protection"
              >
                <Cog6ToothIcon className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Left side: Collaterals */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-base-content/50 text-[10px] font-semibold uppercase tracking-wider">
              Collateral
            </div>
            {debt && (
              <button
                type="button"
                className="btn btn-xs btn-ghost text-primary hover:bg-primary/10"
                onClick={addCollateralModal.open}
              >
                Add Collateral
              </button>
            )}
          </div>
          {collaterals.length === 0 ? (
            <div className="text-base-content/40 text-sm italic">None</div>
          ) : (
            <div className="space-y-2">
              {collaterals.map((col, idx) => {
                const symbol = col.vault.asset.symbol === "???" ? "unknown" : col.vault.asset.symbol;
                // Encode Euler context: borrowVault + collateralVault + subAccountIndex
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
                    currentRate={(col.vault.supplyApy ?? 0) * 100}
                    tokenAddress={col.vault.asset.address}
                    tokenDecimals={col.vault.asset.decimals}
                    tokenPrice={getPrice(col.vault.asset.symbol)}
                    protocolName="Euler"
                    networkType="evm"
                    chainId={chainId}
                    protocolContext={context}
                    availableActions={{ deposit: true, withdraw: true, move: true, swap: true }}
                    onSwap={() => handleOpenSwap(col)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="bg-base-content/10 hidden w-px self-stretch sm:block" />
        <div className="bg-base-content/10 h-px w-full sm:hidden" />

        {/* Right side: Debt */}
        <div className="min-w-0 flex-1">
          <div className="text-base-content/50 mb-2 text-[10px] font-semibold uppercase tracking-wider">
            Debt
          </div>
          {!debt ? (
            <div className="flex items-center justify-between">
              <span className="text-base-content/40 text-sm italic">None</span>
              {collaterals.length > 0 && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost text-primary hover:bg-primary/10"
                  onClick={borrowModal.open}
                >
                  Borrow
                </button>
              )}
            </div>
          ) : (() => {
            const debtSymbol = debt.vault.asset.symbol === "???" ? "unknown" : debt.vault.asset.symbol;
            // For debt, use the first collateral vault (or borrow vault itself if no collaterals)
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
              />
            );
          })()}
        </div>
      </div>

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

  // Refetch positions after transactions complete (with delay for subgraph indexing)
  useTxCompletedListenerDelayed(
    useCallback(() => {
      refetchPositions();
    }, [refetchPositions]),
    3000, // 3 second delay for subgraph to index
    hasLoadedOnce
  );

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

  // Compute metrics from enriched position groups using balances and prices
  // This handles both positions with debt (have liquidity data) and supply-only positions
  const metrics = useMemo((): PositionMetrics => {
    if (!enrichedPositionGroups.length) return EMPTY_METRICS;

    let totalCollateralValueUsd = 0;
    let totalDebtValueUsd = 0;
    let positionsWithDebt = 0;

    for (const group of enrichedPositionGroups) {
      // Calculate collateral value from balances and prices
      for (const col of group.collaterals) {
        const symbol = col.vault.asset.symbol?.toLowerCase();
        const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
        const decimals = col.vault.asset.decimals;

        // balance is in underlying asset units, price is in 8 decimals (USD)
        // USD value = balance * price / 10^decimals / 10^8
        if (col.balance > 0n && priceRaw > 0n) {
          const valueUsd = (Number(col.balance) / 10 ** decimals) * (Number(priceRaw) / 1e8);
          totalCollateralValueUsd += valueUsd;
        }
      }

      // Calculate debt value from balance and price
      if (group.debt && group.debt.balance > 0n) {
        positionsWithDebt++;
        const symbol = group.debt.vault.asset.symbol?.toLowerCase();
        const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
        const decimals = group.debt.vault.asset.decimals;

        if (priceRaw > 0n) {
          const valueUsd = (Number(group.debt.balance) / 10 ** decimals) * (Number(priceRaw) / 1e8);
          totalDebtValueUsd += valueUsd;
        }
      }
    }

    return {
      netBalance: totalCollateralValueUsd - totalDebtValueUsd,
      netYield30d: 0, // Would need APY-weighted calculation
      netApyPercent: null, // Would need APY data
      positionsWithDebt,
    };
  }, [enrichedPositionGroups, pricesRaw]);

  // Compute all used sub-account indices (for debt swap to find next available)
  const usedSubAccountIndices = useMemo(() => {
    return enrichedPositionGroups.map(group => {
      if (!group.subAccount) return 0;
      // Extract last byte of address as index
      return parseInt(group.subAccount.slice(-2), 16);
    });
  }, [enrichedPositionGroups]);

  // Report totals to global state (using balance + price calculation from metrics)
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!hasLoadedOnce) return;

    // Calculate totals from balances and prices (same logic as metrics)
    let totalSupplied = 0;
    let totalBorrowed = 0;

    for (const group of enrichedPositionGroups) {
      // Sum collateral values
      for (const col of group.collaterals) {
        const symbol = col.vault.asset.symbol?.toLowerCase();
        const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
        const decimals = col.vault.asset.decimals;

        if (col.balance > 0n && priceRaw > 0n) {
          totalSupplied += (Number(col.balance) / 10 ** decimals) * (Number(priceRaw) / 1e8);
        }
      }

      // Sum debt values
      if (group.debt && group.debt.balance > 0n) {
        const symbol = group.debt.vault.asset.symbol?.toLowerCase();
        const priceRaw = symbol ? (pricesRaw[symbol] ?? 0n) : 0n;
        const decimals = group.debt.vault.asset.decimals;

        if (priceRaw > 0n) {
          totalBorrowed += (Number(group.debt.balance) / 10 ** decimals) * (Number(priceRaw) / 1e8);
        }
      }
    }

    setProtocolTotals("Euler", totalSupplied, totalBorrowed);
  }, [hasLoadedOnce, enrichedPositionGroups, pricesRaw, setProtocolTotals, effectiveChainId]);

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
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 p-3'}`}>
      {/* Protocol Header */}
      <BaseProtocolHeader
        protocolName="Euler"
        protocolIcon="/logos/euler.svg"
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
                  <EulerPositionGroupRow key={group.subAccount || idx} group={group} chainId={chainId} pricesRaw={pricesRaw} usedSubAccountIndices={usedSubAccountIndices} isADLSupported={isADLSupported} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
