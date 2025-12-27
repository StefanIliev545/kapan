import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import type { AllowedChainIds } from "~~/utils/scaffold-eth";
import type { MorphoMarket, MorphoPositionRow } from "./useMorphoLendingPositions";
import { createMorphoContext } from "./useMorphoLendingPositions";

/**
 * Secondary hook for fast refresh of Morpho positions after interactions
 * Only queries markets where user has positions (from initial API call)
 * Much faster than the full API fetch
 * 
 * @param markets - Array of markets where user has positions (from initial API call)
 * @param chainId - Chain ID to query
 * @param enabled - Whether the hook should be enabled
 * @returns Refreshed position rows matching MorphoPositionRow format
 * 
 * @example
 * // In your component, after getting initial positions from API:
 * const { markets, rows: initialRows } = useMorphoLendingPositions(chainId, userAddress);
 * 
 * // Get markets where user has positions
 * const marketsWithPositions = initialRows.map(row => row.market);
 * 
 * // Use refresh hook for fast updates after transactions
 * const { rows: refreshedRows, refetch } = useMorphoPositionsRefresh(
 *   marketsWithPositions,
 *   chainId,
 *   true
 * );
 * 
 * // After a transaction, call refetch() to update positions immediately
 */
export function useMorphoPositionsRefresh(
  markets: MorphoMarket[],
  chainId: number,
  enabled = true
): {
  rows: MorphoPositionRow[];
  refetch: () => void;
  isLoading: boolean;
  isFetching: boolean;
} {
  const { address: userAddress } = useAccount();

  // Convert MorphoMarket[] to MarketParams[] format for contract call
  const marketParams = useMemo(() => {
    if (!markets.length) return [];
    
    return markets.map((market) => ({
      loanToken: market.loanAsset.address as `0x${string}`,
      collateralToken: (market.collateralAsset?.address || "0x") as `0x${string}`,
      oracle: (market.oracle?.address || "0x") as `0x${string}`,
      irm: market.irmAddress as `0x${string}`,
      lltv: BigInt(market.lltv),
    }));
  }, [markets]);

  // Query positions for these specific markets
  const { data: positions, refetch, isLoading, isFetching } = useScaffoldReadContract({
    contractName: "MorphoBlueGatewayView",
    functionName: "getPositionsForMarkets",
    args: [marketParams, userAddress],
    ...(chainId > 0 && { chainId: chainId as AllowedChainIds }),
    query: {
      enabled: enabled && !!userAddress && marketParams.length > 0 && chainId > 0,
      staleTime: 5_000, // 5 seconds - very short for fast refresh after interactions
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  });

  // Convert contract UserPosition[] back to MorphoPositionRow format
  const rows = useMemo(() => {
    if (!positions || !markets.length) return [];

    return positions
      .map((pos, idx) => {
        const market = markets[idx];
        if (!market) return null;

        // Only include positions with actual balances
        if (pos.collateralBalance === 0n && pos.borrowBalance === 0n && pos.supplyBalance === 0n) {
          return null;
        }

        const context = createMorphoContext(market);
        const collateralDecimals = market.collateralAsset?.decimals || 18;
        const loanDecimals = market.loanAsset.decimals;

        const collateralBalance = pos.collateralBalance;
        const borrowBalance = pos.borrowBalance;

        const collateralPriceUsd = market.collateralAsset?.priceUsd || 0;
        const loanPriceUsd = market.loanAsset.priceUsd || 0;

        // Convert from contract format (already in underlying units)
        const collateralBalanceNum = Number(collateralBalance) / 10 ** collateralDecimals;
        const borrowBalanceNum = Number(borrowBalance) / 10 ** loanDecimals;

        const collateralBalanceUsd = collateralBalanceNum * collateralPriceUsd;
        const borrowBalanceUsd = borrowBalanceNum * loanPriceUsd;

        // LTV calculation
        const lltv = Number(market.lltv) / 1e18;
        let currentLtv: number | null = null;
        if (collateralBalanceUsd > 0 && borrowBalanceUsd > 0) {
          currentLtv = (borrowBalanceUsd / collateralBalanceUsd) * 100;
        }

        // Health factor from contract (in 18 decimals, 1e18 = 1.0)
        const healthFactor = pos.healthFactor === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
          ? null
          : Number(pos.healthFactor) / 1e18;

        return {
          key: market.uniqueKey,
          market,
          context,
          collateralSymbol: market.collateralAsset?.symbol || "?",
          loanSymbol: market.loanAsset.symbol,
          collateralBalance,
          collateralBalanceUsd,
          collateralDecimals,
          borrowBalance,
          borrowBalanceUsd,
          borrowDecimals: loanDecimals,
          supplyApy: market.state.supplyApy * 100, // Keep from market data
          borrowApy: market.state.borrowApy * 100, // Keep from market data
          lltv: lltv * 100,
          currentLtv,
          healthFactor,
          isHealthy: pos.isHealthy,
          hasCollateral: pos.collateralBalance > 0n,
          hasDebt: pos.borrowBalance > 0n,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [positions, markets]);

  return {
    rows,
    refetch,
    isLoading,
    isFetching,
  };
}

