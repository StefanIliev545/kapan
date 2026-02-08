import { useMemo } from "react";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import type { MorphoPositionRow, MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";
import type { PositionGroup, TokenPosition, HealthData } from "~~/types/positions";

/**
 * Context stored for Morpho isolated positions.
 * Contains the market context needed by modals + original row data.
 */
export interface MorphoPositionGroupContext {
  marketContext: MorphoMarketContext;
  row: MorphoPositionRow;
}

function morphoCollateralToToken(row: MorphoPositionRow): TokenPosition {
  return {
    address: row.market.collateralAsset?.address || "",
    symbol: row.collateralSymbol,
    icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
    decimals: row.collateralDecimals,
    rawBalance: row.collateralBalance,
    usdValue: row.collateralBalanceUsd,
    priceRaw: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
    rate: row.supplyApy,
    rateLabel: "APY",
  };
}

function morphoDebtToToken(row: MorphoPositionRow): TokenPosition {
  return {
    address: row.market.loanAsset.address,
    symbol: row.loanSymbol,
    icon: tokenNameToLogo(row.loanSymbol.toLowerCase()),
    decimals: row.borrowDecimals,
    rawBalance: row.borrowBalance,
    usdValue: row.borrowBalanceUsd,
    priceRaw: BigInt(Math.floor((row.market.loanAsset.priceUsd || 0) * 1e8)),
    rate: row.borrowApy,
    rateLabel: "APY",
  };
}

function morphoHealthData(row: MorphoPositionRow): HealthData | null {
  if (!row.hasDebt) return null;
  return {
    currentLtv: row.currentLtv,
    maxLtv: row.lltv, // Morpho LLTV is both max and liquidation
    liquidationLtv: row.lltv,
    healthFactor: row.healthFactor,
    isHealthy: row.isHealthy,
  };
}

/**
 * Adapter: transforms MorphoPositionRow[] into PositionGroup[] with "isolated" topology.
 * One PositionGroup per Morpho market.
 */
export function useMorphoPositionGroups(
  chainId: number,
  rows: MorphoPositionRow[],
): PositionGroup[] {
  return useMemo(() => {
    return rows.map((row): PositionGroup => {
      const collaterals: TokenPosition[] = row.hasCollateral ? [morphoCollateralToToken(row)] : [];
      const debts: TokenPosition[] = row.hasDebt ? [morphoDebtToToken(row)] : [];

      const context: MorphoPositionGroupContext = {
        marketContext: row.context,
        row,
      };

      return {
        id: row.key,
        protocol: "morpho",
        chainId,
        network: "evm",
        topology: "isolated",
        label: `${row.collateralSymbol}/${row.loanSymbol}`,
        collaterals,
        debts,
        health: morphoHealthData(row),
        context,
      };
    });
  }, [chainId, rows]);
}
