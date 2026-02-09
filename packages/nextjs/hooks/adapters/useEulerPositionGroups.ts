import { useMemo } from "react";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import type {
  EulerPositionGroupWithBalances,
  EulerCollateralWithBalance,
  EulerDebtWithBalance,
  EulerAccountLiquidity,
} from "~~/hooks/useEulerLendingPositions";
import type { PositionGroup, TokenPosition, HealthData } from "~~/types/positions";

/**
 * Context stored for Euler multi-topology positions.
 * Contains the enriched position group + sub-account info needed by modals.
 */
export interface EulerPositionGroupContext {
  group: EulerPositionGroupWithBalances;
  subAccount: string;
  isMainAccount: boolean;
}

/** Resolve an icon path from an Euler vault's asset symbol */
function eulerAssetIcon(symbol: string): string {
  if (symbol === "???" || symbol === "unknown") {
    return "/logos/default.svg";
  }
  return tokenNameToLogo(symbol.toLowerCase());
}

function eulerCollateralToToken(col: EulerCollateralWithBalance): TokenPosition {
  const symbol = col.vault.asset.symbol;
  return {
    address: col.vault.asset.address,
    symbol,
    icon: eulerAssetIcon(symbol),
    decimals: col.vault.asset.decimals,
    rawBalance: col.balance,
    // TODO: USD value requires price data. Euler enriched groups don't currently
    // carry per-asset USD prices. Wire this up when a price feed is available.
    usdValue: 0,
    // TODO: priceRaw requires an on-chain or API price feed per asset.
    priceRaw: 0n,
    rate: (col.vault.supplyApy ?? 0) * 100,
    rateLabel: "APY",
    vaultAddress: col.vault.address,
  };
}

function eulerDebtToToken(debt: EulerDebtWithBalance): TokenPosition {
  const symbol = debt.vault.asset.symbol;
  return {
    address: debt.vault.asset.address,
    symbol,
    icon: eulerAssetIcon(symbol),
    decimals: debt.vault.asset.decimals,
    rawBalance: debt.balance,
    // TODO: USD value requires price data (see collateral note above).
    usdValue: 0,
    priceRaw: 0n,
    rate: (debt.vault.borrowApy ?? 0) * 100,
    rateLabel: "APY",
    vaultAddress: debt.vault.address,
  };
}

function eulerHealthData(liquidity: EulerAccountLiquidity | null): HealthData | null {
  if (!liquidity) return null;
  return {
    currentLtv: liquidity.currentLtv,
    maxLtv: liquidity.effectiveMaxLtv,
    liquidationLtv: liquidity.effectiveLltv,
    healthFactor: liquidity.liquidationHealth,
    isHealthy: liquidity.liquidationHealth >= 1,
  };
}

/** Build a human-readable label for a sub-account */
function subAccountLabel(isMainAccount: boolean, subAccount: string): string {
  if (isMainAccount) return "Main account";
  // Show last 4 hex chars for non-main sub-accounts
  const short = subAccount.slice(-4);
  return `Sub-account ...${short}`;
}

/**
 * Adapter: transforms EulerPositionGroupWithBalances[] into PositionGroup[] with "multi" topology.
 * One PositionGroup per Euler sub-account (N collaterals : 1 debt).
 */
export function useEulerPositionGroups(
  chainId: number,
  enrichedGroups: EulerPositionGroupWithBalances[],
): PositionGroup[] {
  return useMemo(() => {
    // NOTE: We do NOT filter out zero-balance groups here. The caller
    // (EulerProtocolView) iterates enrichedPositionGroups by index and
    // expects a 1:1 correspondence with this array. Filtering is the
    // caller's responsibility.
    return enrichedGroups.map((group): PositionGroup => {
      const collaterals: TokenPosition[] = group.collaterals
        .filter(c => c.balance > 0n)
        .map(eulerCollateralToToken);

      const debts: TokenPosition[] = group.debt && group.debt.balance > 0n
        ? [eulerDebtToToken(group.debt)]
        : [];

      const context: EulerPositionGroupContext = {
        group,
        subAccount: group.subAccount,
        isMainAccount: group.isMainAccount,
      };

      return {
        id: `euler-${chainId}-${group.subAccount}`,
        protocol: "euler",
        chainId,
        network: "evm",
        topology: "multi",
        label: subAccountLabel(group.isMainAccount, group.subAccount),
        collaterals,
        debts,
        health: eulerHealthData(group.liquidity),
        context,
      };
    });
  }, [chainId, enrichedGroups]);
}
