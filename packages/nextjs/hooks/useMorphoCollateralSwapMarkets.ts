import { useMemo } from "react";
import { useMorphoMarketsQuery, type MorphoMarket } from "~~/utils/morpho/marketApi";

// ============ Types ============

export interface UseMorphoCollateralSwapMarketsParams {
  chainId: number;
  /** The debt token address (same across old and new markets) */
  debtTokenAddress: string;
  /** The current collateral token address (to exclude from results) */
  currentCollateralAddress: string;
  /** Only fetch when enabled */
  enabled?: boolean;
}

export interface UseMorphoCollateralSwapMarketsResult {
  /** Available target markets (same debt, different collateral) */
  targetMarkets: MorphoMarket[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

// ============ Hook ============

/**
 * Find Morpho markets suitable for collateral swapping.
 * Returns markets with the same debt token but different collateral.
 *
 * For collateral swap on Morpho (pair-isolated):
 * - User has position in OLD market (currentCollateral + debt)
 * - User wants to swap to NEW market (newCollateral + same debt)
 * - This hook finds all markets with matching debt token, excluding current collateral
 */
export function useMorphoCollateralSwapMarkets({
  chainId,
  debtTokenAddress,
  currentCollateralAddress,
  enabled = true,
}: UseMorphoCollateralSwapMarketsParams): UseMorphoCollateralSwapMarketsResult {
  // Fetch all markets for this chain (with caching via shared hook)
  const {
    data: allMarkets,
    isLoading,
    error,
  } = useMorphoMarketsQuery(chainId, {
    enabled: enabled && !!chainId && !!debtTokenAddress,
  });

  // Filter markets: same debt token, different collateral
  const targetMarkets = useMemo(() => {
    if (!allMarkets || !debtTokenAddress || !currentCollateralAddress) {
      return [];
    }

    const debtAddr = debtTokenAddress.toLowerCase();
    const currentCollAddr = currentCollateralAddress.toLowerCase();

    // Filter to markets that:
    // 1. Have the same loan (debt) token
    // 2. Have a different collateral token
    // 3. Have a collateral token (not null)
    const compatible = allMarkets.filter(market => {
      const marketDebt = market.loanAsset.address.toLowerCase();
      const marketCollateral = market.collateralAsset?.address?.toLowerCase();

      return (
        marketDebt === debtAddr &&
        marketCollateral &&
        marketCollateral !== currentCollAddr
      );
    });

    // Sort by borrow APY (lowest first - best for borrower)
    // Since user will borrow from new market, lower APY is better
    return compatible.sort((a, b) => a.state.borrowApy - b.state.borrowApy);
  }, [allMarkets, debtTokenAddress, currentCollateralAddress]);

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
