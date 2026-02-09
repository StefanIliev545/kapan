import { useMemo } from "react";
import type { CompoundMarketPosition } from "~~/hooks/useCompoundLendingPositions";
import type { PositionGroup, TokenPosition, HealthData } from "~~/types/positions";

/**
 * Context stored for Compound multi-topology positions.
 * Contains the market position data needed by modals (base token address, collateral info, etc.)
 */
export interface CompoundPositionGroupContext {
  market: CompoundMarketPosition;
}

function compoundCollateralToToken(col: CompoundMarketPosition["collaterals"][number]): TokenPosition {
  return {
    address: col.address,
    symbol: col.symbol,
    icon: col.icon,
    decimals: col.decimals,
    rawBalance: col.balance,
    usdValue: col.usdValue,
    priceRaw: col.priceRaw,
    rate: 0, // Compound collaterals don't earn yield
    rateLabel: "APR",
  };
}

/** Base token supply represented as a collateral-like token (for supply-only markets) */
function compoundBaseSupplyToToken(market: CompoundMarketPosition): TokenPosition {
  return {
    address: market.baseToken,
    symbol: market.baseSymbol,
    icon: market.baseIcon,
    decimals: market.baseDecimals,
    rawBalance: market.supplyBalance,
    usdValue: market.supplyBalanceUsd,
    priceRaw: market.priceRaw,
    rate: market.supplyApr,
    rateLabel: "APR",
  };
}

function compoundDebtToToken(market: CompoundMarketPosition): TokenPosition {
  return {
    address: market.baseToken,
    symbol: market.baseSymbol,
    icon: market.baseIcon,
    decimals: market.baseDecimals,
    rawBalance: market.borrowBalance,
    usdValue: market.borrowBalanceUsd,
    priceRaw: market.priceRaw,
    rate: market.borrowApr,
    rateLabel: "APR",
  };
}

function compoundHealthData(market: CompoundMarketPosition): HealthData | null {
  if (market.borrowBalance <= 0n) return null;
  if (market.totalCollateralUsd <= 0) return null;

  const currentLtv = (market.borrowBalanceUsd / market.totalCollateralUsd) * 100;
  const lltvPercent = Number(market.weightedLltvBps) / 100;
  // maxLtv: use a reasonable fraction of LLTV (Compound doesn't have a separate maxLtv like Aave)
  // The borrow collateral factor is already in ltvBps on each collateral, but weighted LLTV
  // is the liquidation threshold. We'll use a conservative estimate.
  const maxLtv = lltvPercent * 0.9; // ~90% of liquidation threshold
  const healthFactor = market.borrowBalanceUsd > 0
    ? (market.totalCollateralUsd * (lltvPercent / 100)) / market.borrowBalanceUsd
    : null;

  return {
    currentLtv,
    maxLtv,
    liquidationLtv: lltvPercent,
    healthFactor,
    isHealthy: healthFactor === null || healthFactor >= 1,
  };
}

/**
 * Adapter: transforms CompoundMarketPosition[] into PositionGroup[] with "multi" topology.
 * One PositionGroup per Comet market (N collaterals : 1 base-token debt).
 */
export function useCompoundPositionGroups(
  chainId: number,
  markets: CompoundMarketPosition[],
): PositionGroup[] {
  return useMemo(() => {
    return markets.map((market): PositionGroup => {
      const depositedCollaterals: TokenPosition[] = market.collaterals
        .filter(c => c.balance > 0n)
        .map(compoundCollateralToToken);

      // Supply-only: base token earning yield with no collateral/debt → show as single collateral entry
      const collaterals: TokenPosition[] = depositedCollaterals.length === 0 && market.supplyBalance > 0n
        ? [compoundBaseSupplyToToken(market)]
        : depositedCollaterals;

      const debts: TokenPosition[] = market.borrowBalance > 0n
        ? [compoundDebtToToken(market)]
        : [];

      const context: CompoundPositionGroupContext = { market };

      return {
        id: `compound-${chainId}-${market.baseToken}`,
        protocol: "compound",
        chainId,
        network: "evm",
        topology: "multi",
        label: `${market.baseSymbol} Market`,
        collaterals,
        debts,
        health: compoundHealthData(market),
        context,
      };
    });
  }, [chainId, markets]);
}
