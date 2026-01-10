import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MorphoMarket } from "./useMorphoLendingPositions";
import { sortMarketsByLiquidityDesc } from "./useMorphoLendingPositions";

// ============ Types ============

export interface UseMorphoMarketSupportParams {
  chainId: number;
  loanTokenAddress: string; // The debt token being refinanced
  collateralAddresses: string[]; // All user's collaterals
  enabled?: boolean; // Only fetch when Morpho is selected
}

export interface UseMorphoMarketSupportResult {
  // Map of collateral address (lowercase) → boolean (true if at least one market exists)
  supportedCollaterals: Record<string, boolean>;
  // Map of collateral address (lowercase) → MorphoMarket[] (all compatible markets)
  marketsByCollateral: Record<string, MorphoMarket[]>;
  // All markets for the loan token (unfiltered by collateral)
  allMarketsForLoanToken: MorphoMarket[];
  // Loading state
  isLoading: boolean;
  // Error
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
      console.error(`[useMorphoMarketSupport] Markets API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const items: MorphoMarket[] = data?.markets?.items || [];
    return sortMarketsByLiquidityDesc(items);
  } catch (error) {
    console.error("[useMorphoMarketSupport] Failed to fetch markets:", error);
    return [];
  }
}

// ============ Hook ============

export function useMorphoMarketSupport({
  chainId,
  loanTokenAddress,
  collateralAddresses,
  enabled = true,
}: UseMorphoMarketSupportParams): UseMorphoMarketSupportResult {
  // Fetch all markets for this chain (with caching)
  const {
    data: allMarkets,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["morpho-markets-support", chainId],
    queryFn: () => fetchMorphoMarkets(chainId),
    enabled: enabled && !!chainId,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000, // 10 min garbage collection
  });

  // Filter and group markets by collateral
  const { supportedCollaterals, marketsByCollateral, allMarketsForLoanToken } = useMemo(() => {
    if (!allMarkets || !loanTokenAddress) {
      return { supportedCollaterals: {}, marketsByCollateral: {}, allMarketsForLoanToken: [] };
    }

    const loanAddr = loanTokenAddress.toLowerCase();
    const collateralSet = new Set(collateralAddresses.map(a => a.toLowerCase()));

    // First, filter markets that match the loan token
    const marketsWithMatchingLoan = allMarkets.filter(
      m => m.loanAsset.address.toLowerCase() === loanAddr
    );

    // Then filter to only those that also match one of user's collaterals
    const relevantMarkets = marketsWithMatchingLoan.filter(
      m => m.collateralAsset?.address && collateralSet.has(m.collateralAsset.address.toLowerCase())
    );

    // Group by collateral
    const byCollateral: Record<string, MorphoMarket[]> = {};
    const supported: Record<string, boolean> = {};

    for (const market of relevantMarkets) {
      // collateralAsset is guaranteed to exist due to filter above
      const collAddr = market.collateralAsset?.address?.toLowerCase();
      if (!collAddr) continue;
      if (!byCollateral[collAddr]) byCollateral[collAddr] = [];
      byCollateral[collAddr].push(market);
      supported[collAddr] = true;
    }

    // Sort markets within each collateral group by borrow APY (lowest first - best for borrower)
    for (const addr of Object.keys(byCollateral)) {
      byCollateral[addr].sort((a, b) => a.state.borrowApy - b.state.borrowApy);
    }

    return {
      supportedCollaterals: supported,
      marketsByCollateral: byCollateral,
      allMarketsForLoanToken: marketsWithMatchingLoan,
    };
  }, [allMarkets, loanTokenAddress, collateralAddresses]);

  return {
    supportedCollaterals,
    marketsByCollateral,
    allMarketsForLoanToken,
    isLoading,
    error: error as Error | null,
  };
}
