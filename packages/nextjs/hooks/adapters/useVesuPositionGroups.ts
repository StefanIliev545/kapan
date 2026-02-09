import { useMemo } from "react";
import type { VesuPositionRow } from "~~/hooks/useVesuLendingPositions";
import type { PositionGroup, TokenPosition, HealthData } from "~~/types/positions";

/**
 * Context stored for Vesu isolated positions.
 * Contains the full VesuPositionRow needed by modals (borrowContext, moveCollaterals, etc.).
 */
export interface VesuPositionGroupContext {
  row: VesuPositionRow;
}

function vesuCollateralToToken(row: VesuPositionRow): TokenPosition {
  const supply = row.supply;
  return {
    address: supply.tokenAddress,
    symbol: supply.tokenSymbol || supply.name,
    icon: supply.icon,
    decimals: supply.tokenDecimals || 18,
    rawBalance: supply.tokenBalance,
    usdValue: Math.abs(supply.balance),
    priceRaw: supply.tokenPrice || 0n,
    rate: supply.currentRate,
    // Vesu uses APY for supply rates
    rateLabel: "APY",
  };
}

function vesuDebtToToken(row: VesuPositionRow): TokenPosition | null {
  if (!row.borrow) return null;
  const borrow = row.borrow;
  return {
    address: borrow.tokenAddress,
    symbol: borrow.tokenSymbol || borrow.name,
    icon: borrow.icon,
    decimals: borrow.tokenDecimals || 18,
    rawBalance: borrow.tokenBalance,
    usdValue: Math.abs(borrow.balance),
    priceRaw: borrow.tokenPrice || 0n,
    rate: borrow.currentRate,
    // Vesu uses APR for borrow rates
    rateLabel: "APR",
  };
}

function vesuHealthData(row: VesuPositionRow): HealthData | null {
  if (!row.hasDebt) return null;

  const currentLtv = row.ltvPercent ?? null;

  // Vesu doesn't expose a health factor directly.
  // TODO: Compute healthFactor from on-chain liquidation threshold when available.
  return {
    currentLtv,
    // Vesu doesn't expose separate max/liquidation LTV thresholds through the row data.
    // These should be sourced from the pool config in a future iteration.
    maxLtv: 0,
    liquidationLtv: 0,
    healthFactor: null,
    isHealthy: currentLtv !== null ? currentLtv < 100 : true,
  };
}

/**
 * Adapter: transforms VesuPositionRow[] into PositionGroup[] with "isolated" topology.
 * One PositionGroup per Vesu collateral/debt pair.
 *
 * The protocolKey on each row distinguishes "vesu" vs "vesu-v2", but both
 * map to the ProtocolId "vesu" in the unified type system.
 */
export function useVesuPositionGroups(
  chainId: number,
  rows: VesuPositionRow[],
): PositionGroup[] {
  return useMemo(() => {
    return rows.map((row): PositionGroup => {
      const collaterals: TokenPosition[] = [vesuCollateralToToken(row)];
      const debt = vesuDebtToToken(row);
      const debts: TokenPosition[] = debt && row.hasDebt ? [debt] : [];

      const label = row.debtSymbol
        ? `${row.collateralSymbol}/${row.debtSymbol}`
        : row.collateralSymbol;

      const context: VesuPositionGroupContext = {
        row,
      };

      return {
        id: row.key,
        protocol: "vesu",
        chainId,
        network: "starknet",
        topology: "isolated",
        label,
        collaterals,
        debts,
        health: vesuHealthData(row),
        context,
      };
    });
  }, [chainId, rows]);
}
