/**
 * Shared Morpho Blue market API utilities
 *
 * Consolidates market fetching logic that was previously duplicated across:
 * - useMorphoMarketSupport
 * - useMorphoCollateralSwapMarkets
 * - useMorphoDebtSwapMarkets
 * - useMorphoLendingPositions
 */

import { useQuery } from "@tanstack/react-query";
import { qk } from "~~/lib/queryKeys";
// Re-export types from the main positions hook
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { sortMarketsByLiquidityDesc } from "~~/hooks/useMorphoLendingPositions";

export type { MorphoMarket };
export { sortMarketsByLiquidityDesc };

/**
 * Fetch Morpho Blue markets from the API
 * @param chainId - Chain ID to fetch markets for
 * @param options - Optional parameters
 * @param options.search - Search term to filter markets
 * @param options.first - Max number of markets to fetch (default: 2000)
 * @param options.curation - Curation mode (default: "curated")
 * @param options.minLiquidityUsd - Minimum liquidity in USD (default: "1000")
 * @param options.hideSaturated - Hide saturated markets (default: true)
 */
export async function fetchMorphoMarkets(
  chainId: number,
  options?: {
    search?: string;
    first?: number;
    curation?: string;
    minLiquidityUsd?: string;
    hideSaturated?: boolean;
  }
): Promise<MorphoMarket[]> {
  try {
    const params = new URLSearchParams({
      first: String(options?.first ?? 2000),
      curation: options?.curation ?? "curated",
      minLiquidityUsd: options?.minLiquidityUsd ?? "1000",
      hideSaturated: String(options?.hideSaturated ?? true),
    });

    if (options?.search?.trim()) {
      params.set("search", options.search.trim());
    }

    const response = await fetch(`/api/morpho/${chainId}/markets?${params.toString()}`);
    if (!response.ok) {
      console.error(`[morpho/marketApi] Markets API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const items: MorphoMarket[] = data?.markets?.items || [];

    // Client-side safety net for liquidity-first ordering
    return sortMarketsByLiquidityDesc(items);
  } catch (error) {
    console.error("[morpho/marketApi] Failed to fetch markets:", error);
    return [];
  }
}

/** Default stale time for market queries (5 minutes) */
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

interface UseMorphoMarketsOptions {
  /** Whether to enable the query */
  enabled?: boolean;
  /** Search term to filter markets */
  search?: string;
  /** Stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;
}

/**
 * Hook to fetch Morpho Blue markets with proper caching
 *
 * Uses centralized query keys from qk.morpho.markets() to ensure
 * cache sharing across all components that need market data.
 */
export function useMorphoMarketsQuery(chainId: number, options: UseMorphoMarketsOptions = {}) {
  const { enabled = true, search, staleTime = DEFAULT_STALE_TIME } = options;
  const normalizedSearch = search?.trim() || undefined;

  return useQuery({
    queryKey: qk.morpho.markets(chainId, normalizedSearch),
    queryFn: () => fetchMorphoMarkets(chainId, { search: normalizedSearch }),
    staleTime,
    refetchOnWindowFocus: false,
    enabled: enabled && chainId > 0,
  });
}
