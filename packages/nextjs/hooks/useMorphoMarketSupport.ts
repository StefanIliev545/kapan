import { useMemo } from "react";
import { useMorphoMarketsQuery, type MorphoMarket } from "~~/utils/morpho/marketApi";

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

// ============ Hook ============

export function useMorphoMarketSupport({
  chainId,
  loanTokenAddress,
  collateralAddresses,
  enabled = true,
}: UseMorphoMarketSupportParams): UseMorphoMarketSupportResult {
  // Fetch all markets for this chain (with caching via shared hook)
  const {
    data: allMarkets,
    isLoading,
    error,
  } = useMorphoMarketsQuery(chainId, {
    enabled: enabled && !!chainId,
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
