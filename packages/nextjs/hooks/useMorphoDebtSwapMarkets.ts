import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MorphoMarket } from "./useMorphoLendingPositions";
import { sortMarketsByLiquidityDesc } from "./useMorphoLendingPositions";

// ============ Types ============

export interface UseMorphoDebtSwapMarketsParams {
  chainId: number;
  /** The collateral token address (same across old and new markets) */
  collateralTokenAddress: string;
  /** The current debt token address (to exclude from results) */
  currentDebtAddress: string;
  /** Only fetch when enabled */
  enabled?: boolean;
}

export interface UseMorphoDebtSwapMarketsResult {
  /** Available target markets (same collateral, different debt) */
  targetMarkets: MorphoMarket[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

// ============ API Fetcher ============

async function fetchMorphoMarkets(chainId: number): Promise<MorphoMarket[]> {
  try {
    const params = new URLSearchParams({
      first: "2000",
      curation: "curated",
      minLiquidityUsd: "10000",
      hideSaturated: "true",
    });

    const response = await fetch(`/api/morpho/${chainId}/markets?${params.toString()}`);
    if (!response.ok) {
      console.error(`[useMorphoDebtSwapMarkets] Markets API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const items: MorphoMarket[] = data?.markets?.items || [];
    return sortMarketsByLiquidityDesc(items);
  } catch (error) {
    console.error("[useMorphoDebtSwapMarkets] Failed to fetch markets:", error);
    return [];
  }
}

// ============ Hook ============

/**
 * Find Morpho markets suitable for debt swapping.
 * Returns markets with the same collateral token but different debt.
 *
 * For debt swap on Morpho (pair-isolated):
 * - User has position in OLD market (collateral + currentDebt)
 * - User wants to swap to NEW market (same collateral + newDebt)
 * - This hook finds all markets with matching collateral token, excluding current debt
 */
export function useMorphoDebtSwapMarkets({
  chainId,
  collateralTokenAddress,
  currentDebtAddress,
  enabled = true,
}: UseMorphoDebtSwapMarketsParams): UseMorphoDebtSwapMarketsResult {
  // Fetch all markets for this chain (with caching)
  const {
    data: allMarkets,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["morpho-markets-debt-swap", chainId],
    queryFn: () => fetchMorphoMarkets(chainId),
    enabled: enabled && !!chainId && !!collateralTokenAddress,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000, // 10 min garbage collection
  });

  // Filter markets: same collateral token, different debt token
  const targetMarkets = useMemo(() => {
    if (!allMarkets || !collateralTokenAddress || !currentDebtAddress) {
      console.log("[useMorphoDebtSwapMarkets] Missing data:", {
        hasMarkets: !!allMarkets,
        collateralTokenAddress,
        currentDebtAddress
      });
      return [];
    }

    const collateralAddr = collateralTokenAddress.toLowerCase();
    const currentDebtAddr = currentDebtAddress.toLowerCase();

    console.log("[useMorphoDebtSwapMarkets] Filtering markets:", {
      collateralAddr,
      currentDebtAddr,
      totalMarkets: allMarkets.length,
    });

    // Filter to markets that:
    // 1. Have the same collateral token
    // 2. Have a different loan (debt) token
    // 3. Have a loan token (not null)
    // 4. Loan token is not the same as collateral (edge case protection)
    const compatible = allMarkets.filter(market => {
      const marketCollateral = market.collateralAsset?.address?.toLowerCase();
      const marketDebt = market.loanAsset?.address?.toLowerCase();

      const matches = (
        marketCollateral === collateralAddr &&
        marketDebt &&
        marketDebt !== currentDebtAddr &&
        marketDebt !== collateralAddr // Prevent same-token markets
      );

      // Log markets that have matching collateral (to see what's available)
      if (marketCollateral === collateralAddr) {
        console.log("[useMorphoDebtSwapMarkets] Market with matching collateral:", {
          marketId: market.uniqueKey,
          collateral: market.collateralAsset?.symbol,
          loan: market.loanAsset?.symbol,
          loanAddr: marketDebt,
          passes: matches,
        });
      }

      return matches;
    });

    console.log("[useMorphoDebtSwapMarkets] Compatible markets found:", compatible.length);

    // Sort by borrow APY (lowest first - best for borrower)
    // Since user will borrow from new market, lower APY is better
    return compatible.sort((a, b) => a.state.borrowApy - b.state.borrowApy);
  }, [allMarkets, collateralTokenAddress, currentDebtAddress]);

  return {
    targetMarkets,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Convert MorphoMarket to the context format needed for instructions
 */
export function marketToContext(market: MorphoMarket) {
  return {
    marketId: market.uniqueKey,
    loanToken: market.loanAsset.address,
    collateralToken: market.collateralAsset?.address || "",
    oracle: market.oracle?.address || "",
    irm: market.irmAddress,
    lltv: BigInt(market.lltv),
  };
}
