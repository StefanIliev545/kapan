/**
 * Shared Euler V2 vault API utilities
 *
 * Consolidates vault fetching logic that was previously duplicated across:
 * - EulerBorrowModal
 * - AddEulerCollateralModal
 * - useEulerCollateralSwapVaults
 * - useEulerDebtSwapVaults
 * - useEulerMarketSupport
 * - useEulerLendingPositions
 */

import { useQuery } from "@tanstack/react-query";
import { qk } from "~~/lib/queryKeys";
import type { EulerVaultResponse } from "~~/app/api/euler/[chainId]/vaults/route";

// Re-export the type for convenience
export type { EulerVaultResponse };

/**
 * Fetch Euler V2 vaults from the API
 * @param chainId - Chain ID to fetch vaults for
 * @param options - Optional parameters
 * @param options.first - Max number of vaults to fetch (default: 500)
 * @param options.search - Search term to filter vaults
 */
export async function fetchEulerVaults(
  chainId: number,
  options?: { first?: number; search?: string }
): Promise<EulerVaultResponse[]> {
  try {
    const params = new URLSearchParams();
    params.set("first", String(options?.first ?? 500));
    if (options?.search?.trim()) {
      params.set("search", options.search.trim());
    }

    const response = await fetch(`/api/euler/${chainId}/vaults?${params.toString()}`);
    if (!response.ok) {
      console.error(`[euler/vaultApi] Vaults API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data?.vaults || [];
  } catch (error) {
    console.error("[euler/vaultApi] Failed to fetch vaults:", error);
    return [];
  }
}

/** Default stale time for vault queries (5 minutes) */
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

interface UseEulerVaultsOptions {
  /** Whether to enable the query */
  enabled?: boolean;
  /** Search term to filter vaults */
  search?: string;
  /** Max number of vaults to fetch */
  first?: number;
  /** Stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;
}

/**
 * Hook to fetch Euler V2 vaults with proper caching
 *
 * Uses centralized query keys from qk.euler.vaults() to ensure
 * cache sharing across all components that need vault data.
 */
export function useEulerVaultsQuery(chainId: number, options: UseEulerVaultsOptions = {}) {
  const { enabled = true, search, first, staleTime = DEFAULT_STALE_TIME } = options;
  const normalizedSearch = search?.trim() || undefined;

  return useQuery({
    queryKey: qk.euler.vaults(chainId, normalizedSearch),
    queryFn: () => fetchEulerVaults(chainId, { first, search: normalizedSearch }),
    staleTime,
    refetchOnWindowFocus: false,
    enabled: enabled && chainId > 0,
  });
}
