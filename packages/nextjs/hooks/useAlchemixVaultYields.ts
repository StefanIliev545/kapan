import { useQuery } from "@tanstack/react-query";
import { qk } from "~~/lib/queryKeys";

/**
 * Fetch the Morpho V2 Vault yield for each Alchemix MYT on a chain.
 *
 * Background
 * ----------
 * The MYT (Meta-Yield Token) deposited collateral is wrapped in is a Morpho V2 Vault — see
 * `AlchemistCurator.sol`:
 *   "The MYT is a Morpho V2 Vault, and each strategy is just a vault adapter which interfaces
 *    with a third party protocol"
 *
 * Data source: server-side route at `/api/alchemix/[chainId]/vault-yields` which samples
 * `IERC4626(myt).convertToAssets(1e18)` at two block heights ~7 days apart and computes APY
 * from the share-price growth. Live on-chain data, no third-party indexer dependency.
 */

export interface VaultYield {
  /** Address of the MYT (key matches market.myt). */
  vaultAddress: string;
  /** NetAPY as a percentage (e.g. 5.32 means 5.32% APY). 0 means "couldn't compute" — show as —. */
  netApyPct: number;
  /** Total assets currently in the vault (raw bigint stringified). */
  totalAssets: string | null;
  /** Actual time window used for the on-chain rate sample (seconds). */
  windowSeconds?: number;
}

export interface VaultYieldMap {
  [vaultAddressLower: string]: VaultYield;
}

async function fetchAlchemixVaultYields(chainId: number): Promise<VaultYieldMap> {
  if (chainId <= 0) return {};
  try {
    const res = await fetch(`/api/alchemix/${chainId}/vault-yields`);
    if (!res.ok) {
      console.warn(`[useAlchemixVaultYields] /api/alchemix/${chainId}/vault-yields ${res.status}`);
      return {};
    }
    const json = await res.json();
    return (json?.yields ?? {}) as VaultYieldMap;
  } catch (err) {
    console.warn("[useAlchemixVaultYields] fetch failed:", err);
    return {};
  }
}

export function useAlchemixVaultYields(chainId: number) {
  return useQuery({
    queryKey: [...qk.alchemix.all(chainId), "vault-yields"] as const,
    queryFn: () => fetchAlchemixVaultYields(chainId),
    staleTime: 5 * 60_000, // APYs don't move fast — 5 min is plenty
    refetchOnWindowFocus: false,
    enabled: chainId > 0,
  });
}

/**
 * Compute the effective leveraged APY on equity for an Alchemix position.
 *
 * Math: the entire collateral earns the MYT yield. That yield is diverted to the transmuter
 * to repay the debt. Leftover yield (if collateral_yield > debt_growth) accrues to equity.
 * For self-repaying loans where debt growth = 0 (no interest charged), the user's effective
 * APY on equity is:
 *
 *   APY_equity = collateral_yield × (collateral_value / equity_value)
 *              = collateral_yield × leverage
 *
 * where leverage = collateral / (collateral - debt). For an unleveraged position (debt = 0),
 * this reduces to the underlying MYT APY.
 */
export function computeLeveragedApyPct(
  vaultApyPct: number,
  collateralUnderlyingRaw: bigint,
  debtRaw: bigint,
  underlyingDecimals: number,
  debtDecimals: number,
): number {
  if (vaultApyPct <= 0 || collateralUnderlyingRaw === 0n) return 0;

  // Bridge debt to collateral decimals (alAsset ≈ underlying at face value for Alchemix).
  const decimalsDiff = BigInt(debtDecimals - underlyingDecimals);
  const scale = decimalsDiff >= 0n ? 10n ** decimalsDiff : 1n;
  const debtAsCollateral = debtRaw / scale;

  if (debtAsCollateral >= collateralUnderlyingRaw) return 0; // underwater / fully levered

  // leverage = collateral / equity = collateral / (collateral - debt)
  // Use number math here — accuracy-to-the-decimal isn't critical for a percentage display.
  const decFactor = 10 ** underlyingDecimals;
  const collateral = Number(collateralUnderlyingRaw) / decFactor;
  const debt = Number(debtAsCollateral) / decFactor;
  const equity = collateral - debt;
  if (equity <= 0) return 0;

  const leverage = collateral / equity;
  return vaultApyPct * leverage;
}
