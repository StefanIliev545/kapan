import { useMemo } from "react";
import type { CollateralInfo } from "~~/app/api/euler/[chainId]/vaults/route";
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";

/**
 * Hook to find compatible Euler collateral vaults for collateral swap.
 *
 * Given a borrow vault, returns EVERY collateral vault that borrow vault accepts (its on-chain
 * LTVList, surfaced as `borrowVault.collaterals`). This is the correct set of swap targets — the
 * protocol genuinely accepts these as collateral — even if some are not in the curated/verified
 * market list (e.g. PT vaults). We read each target's metadata straight from `CollateralInfo`
 * (which the vaults route now fully populates incl. decimals) rather than re-looking it up in the
 * curated top-level vault list, which would drop un-verified-but-accepted vaults like the
 * `ePT-USDai-15OCT2026` vault.
 *
 * Targets are returned PER VAULT (not collapsed by underlying token) so the picker can list
 * multiple vaults for the same asset (e.g. `eUSD₮0-1` vs `eUSD₮0-2`, or different PT maturities).
 */

export interface EulerCollateralSwapTarget {
  /** The collateral vault address to deposit into */
  vaultAddress: string;
  /** The Euler vault symbol (e.g. "ePT-USDai-15OCT2026-1") — used to disambiguate same-asset vaults */
  vaultSymbol: string;
  /** The underlying token address */
  tokenAddress: string;
  /** The underlying token symbol */
  tokenSymbol: string;
  /** Token decimals */
  decimals: number;
}

export interface UseEulerCollateralSwapVaultsParams {
  chainId: number;
  /** The user's current borrow vault address */
  borrowVaultAddress: string;
  /** Optional: Current collateral token address to exclude from targets */
  currentCollateralAddress?: string;
  enabled?: boolean;
}

export interface UseEulerCollateralSwapVaultsResult {
  /** All accepted collateral vaults for the borrow vault, one entry per vault */
  targets: EulerCollateralSwapTarget[];
  /**
   * Map of token address (lowercase) → target. Kept for backwards compat; when multiple vaults
   * share an underlying token the last one wins, so prefer `targets` for the full list.
   */
  targetVaultsByAddress: Record<string, EulerCollateralSwapTarget>;
  /** Raw accepted collateral list from the borrow vault */
  allAcceptedCollaterals: CollateralInfo[];
  isLoading: boolean;
  error: Error | null;
}

export function useEulerCollateralSwapVaults({
  chainId,
  borrowVaultAddress,
  currentCollateralAddress,
  enabled = true,
}: UseEulerCollateralSwapVaultsParams): UseEulerCollateralSwapVaultsResult {
  const {
    data: allVaults,
    isLoading,
    error,
  } = useEulerVaultsQuery(chainId, {
    enabled: enabled && !!chainId && !!borrowVaultAddress,
  });

  const { targets, targetVaultsByAddress, allAcceptedCollaterals } = useMemo(() => {
    if (!allVaults || !borrowVaultAddress) {
      return { targets: [], targetVaultsByAddress: {}, allAcceptedCollaterals: [] };
    }

    const borrowAddr = borrowVaultAddress.toLowerCase();
    const excludeAddr = currentCollateralAddress?.toLowerCase();

    const borrowVault = allVaults.find(v => v.address.toLowerCase() === borrowAddr);
    if (!borrowVault) {
      return { targets: [], targetVaultsByAddress: {}, allAcceptedCollaterals: [] };
    }

    // Accepted collaterals already carry full metadata (vault symbol, underlying token + decimals)
    // from the vaults route, so we don't need to re-resolve them against the curated vault list.
    const acceptedCollaterals = borrowVault.collaterals || [];

    const targetsList: EulerCollateralSwapTarget[] = [];
    for (const c of acceptedCollaterals) {
      const tokenAddress = c.tokenAddress?.toLowerCase() || "";
      if (!tokenAddress) continue;
      // Don't offer the token you're swapping out of as a target. NOTE: this excludes by underlying
      // TOKEN, not vault — so a same-token-different-vault migration (e.g. eUSD₮0-1 -> eUSD₮0-2) is
      // intentionally not offered here (that's a vault move, not a swap; the swap path expects
      // from-token != to-token). Distinct-token targets incl. all PT maturities are unaffected.
      // FUTURE: if we want same-token vault moves, switch this + buildTargetAssets to vault-address
      // exclusion and ensure the swap/encode path handles from==to. Also: `decimals` here comes from
      // CollateralInfo (KNOWN_TOKENS / 18 fallback) — fine for current collaterals, but a non-listed
      // 6-decimal token would mis-scale; resolve decimals on-chain in the route if that ever happens.
      if (excludeAddr && tokenAddress === excludeAddr) continue;
      targetsList.push({
        vaultAddress: c.vaultAddress,
        vaultSymbol: c.vaultSymbol,
        tokenAddress: c.tokenAddress,
        tokenSymbol: c.tokenSymbol,
        decimals: c.decimals ?? 18,
      });
    }

    const byAddress: Record<string, EulerCollateralSwapTarget> = {};
    for (const t of targetsList) byAddress[t.tokenAddress.toLowerCase()] = t;

    return { targets: targetsList, targetVaultsByAddress: byAddress, allAcceptedCollaterals: acceptedCollaterals };
  }, [allVaults, borrowVaultAddress, currentCollateralAddress]);

  return {
    targets,
    targetVaultsByAddress,
    allAcceptedCollaterals,
    isLoading,
    error: error as Error | null,
  };
}
