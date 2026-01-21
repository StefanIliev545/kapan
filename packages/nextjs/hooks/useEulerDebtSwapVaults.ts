import { useMemo } from "react";
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";

/**
 * Hook to find compatible Euler borrow vaults for debt swap.
 * Given a user's current collateral vaults, finds other borrow vaults that:
 * 1. Have a different underlying debt token
 * 2. Accept ALL of the user's current collateral vaults (strict filtering)
 *
 * Strict filtering is required because debt swap migrates all collaterals
 * to the new sub-account - partial migration is not supported.
 */

export interface EulerDebtSwapTarget {
  /** The borrow vault address */
  vaultAddress: string;
  /** The underlying debt token address */
  tokenAddress: string;
  /** The underlying debt token symbol */
  tokenSymbol: string;
  /** Token decimals */
  decimals: number;
  /** Current borrow APY */
  borrowApy: number;
  /** List of user's collateral vault addresses that this borrow vault accepts */
  acceptedCollateralVaults: string[];
}

export interface UseEulerDebtSwapVaultsParams {
  chainId: number;
  /** Current debt token address (to exclude from results) */
  currentDebtTokenAddress: string;
  /** User's current collateral vault addresses */
  userCollateralVaultAddresses: string[];
  enabled?: boolean;
}

export interface UseEulerDebtSwapVaultsResult {
  /** Map of debt token address (lowercase) → EulerDebtSwapTarget */
  targetVaultsByAddress: Record<string, EulerDebtSwapTarget>;
  /** All compatible borrow vaults */
  allCompatibleVaults: EulerDebtSwapTarget[];
  isLoading: boolean;
  error: Error | null;
}

export function useEulerDebtSwapVaults({
  chainId,
  currentDebtTokenAddress,
  userCollateralVaultAddresses,
  enabled = true,
}: UseEulerDebtSwapVaultsParams): UseEulerDebtSwapVaultsResult {
  const {
    data: allVaults,
    isLoading,
    error,
  } = useEulerVaultsQuery(chainId, {
    enabled: enabled && !!chainId && userCollateralVaultAddresses.length > 0,
  });

  const { targetVaultsByAddress, allCompatibleVaults } = useMemo(() => {
    if (!allVaults || userCollateralVaultAddresses.length === 0) {
      return { targetVaultsByAddress: {}, allCompatibleVaults: [] };
    }

    const currentDebtAddr = currentDebtTokenAddress.toLowerCase();

    const byAddress: Record<string, EulerDebtSwapTarget> = {};
    const compatibleVaults: EulerDebtSwapTarget[] = [];

    // Find borrow vaults that accept ALL of the user's collateral vaults
    for (const vault of allVaults) {
      const debtTokenAddr = vault.asset?.address?.toLowerCase();

      // Skip if no debt token address
      if (!debtTokenAddr) continue;

      // Skip the current debt token (we're looking for alternatives)
      if (debtTokenAddr === currentDebtAddr) continue;

      // Build set of collateral vaults this borrow vault accepts
      const vaultAcceptedCollaterals = new Set(
        (vault.collaterals || []).map(col => col.vaultAddress.toLowerCase())
      );

      // Check if ALL user's collateral vaults are accepted by this borrow vault
      const allCollateralsAccepted = userCollateralVaultAddresses.every(
        userCol => vaultAcceptedCollaterals.has(userCol.toLowerCase())
      );

      // Skip if this vault doesn't accept ALL of the user's collaterals
      if (!allCollateralsAccepted) continue;

      // All user collaterals are accepted
      const acceptedCollaterals = userCollateralVaultAddresses;

      const target: EulerDebtSwapTarget = {
        vaultAddress: vault.address,
        tokenAddress: vault.asset.address,
        tokenSymbol: vault.asset.symbol,
        decimals: vault.asset.decimals,
        borrowApy: vault.borrowApy,
        acceptedCollateralVaults: acceptedCollaterals,
      };

      // Only keep the best (lowest APY) vault for each debt token
      const existing = byAddress[debtTokenAddr];
      if (!existing || target.borrowApy < existing.borrowApy) {
        byAddress[debtTokenAddr] = target;
      }

      compatibleVaults.push(target);
    }

    // Sort by borrow APY (lowest first)
    compatibleVaults.sort((a, b) => a.borrowApy - b.borrowApy);

    console.log("[useEulerDebtSwapVaults] Found", Object.keys(byAddress).length,
      "compatible vaults that accept ALL", userCollateralVaultAddresses.length, "collaterals"
    );

    return {
      targetVaultsByAddress: byAddress,
      allCompatibleVaults: compatibleVaults,
    };
  }, [allVaults, currentDebtTokenAddress, userCollateralVaultAddresses]);

  return {
    targetVaultsByAddress,
    allCompatibleVaults,
    isLoading,
    error: error as Error | null,
  };
}
