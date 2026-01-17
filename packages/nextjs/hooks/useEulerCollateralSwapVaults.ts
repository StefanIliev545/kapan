import { useMemo } from "react";
import type { CollateralInfo } from "~~/app/api/euler/[chainId]/vaults/route";
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";

/**
 * Hook to find compatible Euler collateral vaults for collateral swap.
 * Given a borrow vault and target collateral token, finds which collateral vaults
 * are accepted by that borrow vault for the target token.
 */

export interface EulerCollateralSwapTarget {
  /** The collateral vault address to deposit into */
  vaultAddress: string;
  /** The underlying token address */
  tokenAddress: string;
  /** The underlying token symbol */
  tokenSymbol: string;
  /** Token decimals */
  decimals: number;
  /** LTV for this collateral in the borrow vault */
  ltv: number;
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
  /** Map of token address (lowercase) → EulerCollateralSwapTarget */
  targetVaultsByAddress: Record<string, EulerCollateralSwapTarget>;
  /** All accepted collateral vaults for the borrow vault */
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

  const { targetVaultsByAddress, allAcceptedCollaterals } = useMemo(() => {
    if (!allVaults || !borrowVaultAddress) {
      return { targetVaultsByAddress: {}, allAcceptedCollaterals: [] };
    }

    const borrowAddr = borrowVaultAddress.toLowerCase();
    const excludeAddr = currentCollateralAddress?.toLowerCase();

    // Find the borrow vault
    const borrowVault = allVaults.find(v => v.address.toLowerCase() === borrowAddr);
    if (!borrowVault) {
      console.log("[useEulerCollateralSwapVaults] Borrow vault not found:", borrowAddr);
      return { targetVaultsByAddress: {}, allAcceptedCollaterals: [] };
    }

    // Get all collaterals accepted by this borrow vault
    const acceptedCollaterals = borrowVault.collaterals || [];
    console.log("[useEulerCollateralSwapVaults] Accepted collaterals for borrow vault:", acceptedCollaterals.length);

    // Build map of token address -> vault info
    // Include ALL accepted collaterals (excluding current)
    const byAddress: Record<string, EulerCollateralSwapTarget> = {};

    for (const collateral of acceptedCollaterals) {
      // Look up the vault details from allVaults to get token address and decimals
      const vaultDetails = allVaults.find(
        v => v.address.toLowerCase() === collateral.vaultAddress.toLowerCase()
      );

      const tokenAddress = vaultDetails?.asset?.address?.toLowerCase() || "";

      // Skip if no token address found
      if (!tokenAddress) {
        continue;
      }

      // Skip if this is the current collateral (by token address)
      if (excludeAddr && tokenAddress === excludeAddr) {
        continue;
      }

      byAddress[tokenAddress] = {
        vaultAddress: collateral.vaultAddress,
        tokenAddress: vaultDetails?.asset?.address || "",
        tokenSymbol: collateral.tokenSymbol,
        decimals: vaultDetails?.asset?.decimals || 18,
        ltv: 0, // LTV not available in CollateralInfo, will be determined by borrow vault
      };
    }

    console.log("[useEulerCollateralSwapVaults] Target vaults by address:", Object.keys(byAddress));

    return {
      targetVaultsByAddress: byAddress,
      allAcceptedCollaterals: acceptedCollaterals,
    };
  }, [allVaults, borrowVaultAddress, currentCollateralAddress]);

  return {
    targetVaultsByAddress,
    allAcceptedCollaterals,
    isLoading,
    error: error as Error | null,
  };
}
