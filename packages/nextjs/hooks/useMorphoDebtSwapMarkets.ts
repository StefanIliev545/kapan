import { useMemo } from "react";
import { useMorphoMarketsQuery, type MorphoMarket } from "~~/utils/morpho/marketApi";

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
  // Fetch all markets for this chain (with caching via shared hook)
  const {
    data: allMarkets,
    isLoading,
    error,
  } = useMorphoMarketsQuery(chainId, {
    enabled: enabled && !!chainId && !!collateralTokenAddress,
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
