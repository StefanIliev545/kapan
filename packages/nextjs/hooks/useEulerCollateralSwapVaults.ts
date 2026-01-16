import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EulerVaultResponse, CollateralInfo } from "~~/app/api/euler/[chainId]/vaults/route";

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
  /** Symbols of tokens user wants to swap TO (for matching) */
  targetCollateralSymbols: string[];
  enabled?: boolean;
}

export interface UseEulerCollateralSwapVaultsResult {
  /** Map of token symbol (lowercase) → EulerCollateralSwapTarget */
  targetVaultsBySymbol: Record<string, EulerCollateralSwapTarget>;
  /** All accepted collateral vaults for the borrow vault */
  allAcceptedCollaterals: CollateralInfo[];
  isLoading: boolean;
  error: Error | null;
}

async function fetchEulerVaults(chainId: number): Promise<EulerVaultResponse[]> {
  try {
    const response = await fetch(`/api/euler/${chainId}/vaults?first=500`);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.vaults || [];
  } catch {
    return [];
  }
}

function normalizeSymbol(symbol: string): string {
  const s = symbol.toLowerCase().trim();
  if (s === "weth" || s === "eth") return "eth";
  if (s === "wbtc" || s === "btc") return "btc";
  if (s === "wsteth" || s === "steth") return "steth";
  return s;
}

export function useEulerCollateralSwapVaults({
  chainId,
  borrowVaultAddress,
  targetCollateralSymbols,
  enabled = true,
}: UseEulerCollateralSwapVaultsParams): UseEulerCollateralSwapVaultsResult {
  const {
    data: allVaults,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["euler-vaults-collateral-swap", chainId],
    queryFn: () => fetchEulerVaults(chainId),
    enabled: enabled && !!chainId && !!borrowVaultAddress,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { targetVaultsBySymbol, allAcceptedCollaterals } = useMemo(() => {
    if (!allVaults || !borrowVaultAddress) {
      return { targetVaultsBySymbol: {}, allAcceptedCollaterals: [] };
    }

    const borrowAddr = borrowVaultAddress.toLowerCase();

    // Find the borrow vault
    const borrowVault = allVaults.find(v => v.address.toLowerCase() === borrowAddr);
    if (!borrowVault) {
      return { targetVaultsBySymbol: {}, allAcceptedCollaterals: [] };
    }

    // Get all collaterals accepted by this borrow vault
    const acceptedCollaterals = borrowVault.collaterals || [];

    // Build map of target symbols to vault info
    const targetSymbolsNormalized = new Set(
      targetCollateralSymbols.map(s => normalizeSymbol(s))
    );

    const bySymbol: Record<string, EulerCollateralSwapTarget> = {};

    for (const collateral of acceptedCollaterals) {
      const normalized = normalizeSymbol(collateral.tokenSymbol);
      if (targetSymbolsNormalized.has(normalized)) {
        // Look up the vault details from allVaults to get token address and decimals
        const vaultDetails = allVaults.find(
          v => v.address.toLowerCase() === collateral.vaultAddress.toLowerCase()
        );
        bySymbol[normalized] = {
          vaultAddress: collateral.vaultAddress,
          tokenAddress: vaultDetails?.asset?.address || "",
          tokenSymbol: collateral.tokenSymbol,
          decimals: vaultDetails?.asset?.decimals || 18,
          ltv: 0, // LTV not available in CollateralInfo, will be determined by borrow vault
        };
      }
    }

    return {
      targetVaultsBySymbol: bySymbol,
      allAcceptedCollaterals: acceptedCollaterals,
    };
  }, [allVaults, borrowVaultAddress, targetCollateralSymbols]);

  return {
    targetVaultsBySymbol,
    allAcceptedCollaterals,
    isLoading,
    error: error as Error | null,
  };
}
