import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { logger } from "~~/utils/logger";

// ============ Types ============

export interface MorphoMarketAsset {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
}

export interface MorphoMarketState {
  supplyAssets: number;
  borrowAssets: number;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  // Prefer these if the API returns them
  liquidityAssets?: number;
  liquidityAssetsUsd?: number;
  supplyAssetsUsd?: number;
  borrowAssetsUsd?: number;
}

export interface MorphoMarket {
  id: string;
  uniqueKey: string;
  collateralAsset: MorphoMarketAsset | null;
  loanAsset: MorphoMarketAsset;
  oracle: { address: string } | null;
  irmAddress: string;
  lltv: string; // BigInt string like "860000000000000000"
  state: MorphoMarketState;
}

export interface MorphoPosition {
  market: MorphoMarket;
  supplyShares: string;
  supplyAssets: number;
  borrowShares: string;
  borrowAssets: number;
  collateral: number;
  healthFactor: number | null;
}

export interface MorphoUserData {
  address: string;
  marketPositions: MorphoPosition[];
}

// ============ Market Context (for lending instructions) ============

export interface MorphoMarketContext {
  marketId: string;
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: bigint;
}

export function createMorphoContext(market: MorphoMarket): MorphoMarketContext {
  return {
    marketId: market.uniqueKey,
    loanToken: market.loanAsset.address,
    collateralToken: market.collateralAsset?.address || "",
    oracle: market.oracle?.address || "",
    irm: market.irmAddress,
    lltv: BigInt(market.lltv),
  };
}

// ============ Position Row (for display) ============

export interface MorphoPositionRow {
  key: string;
  market: MorphoMarket;
  context: MorphoMarketContext;
  collateralSymbol: string;
  loanSymbol: string;
  // Collateral position
  collateralBalance: bigint;
  collateralBalanceUsd: number;
  collateralDecimals: number;
  // Borrow position  
  borrowBalance: bigint;
  borrowBalanceUsd: number;
  borrowDecimals: number;
  // Rates
  supplyApy: number;
  borrowApy: number;
  // Risk
  lltv: number; // as percentage (0-100)
  currentLtv: number | null; // as percentage
  healthFactor: number | null;
  isHealthy: boolean;
  // Display
  hasCollateral: boolean;
  hasDebt: boolean;
}

// ============ Liquidity Sorting ============

/**
 * Get USD-normalized liquidity for a market (preferred sort key)
 */
function getLiquidityUsd(m: MorphoMarket): number {
  // Best: direct USD metric from the API
  const apiUsd = m.state.liquidityAssetsUsd;
  if (typeof apiUsd === "number" && Number.isFinite(apiUsd)) return apiUsd;

  // Fallback #1: compute liquidityAssets * priceUsd (loan token)
  const liquidityAssets =
    (typeof m.state.liquidityAssets === "number" && Number.isFinite(m.state.liquidityAssets))
      ? m.state.liquidityAssets
      : Math.max(0, (m.state.supplyAssets || 0) - (m.state.borrowAssets || 0));

  const loanPrice = m.loanAsset.priceUsd ?? 0;
  return liquidityAssets * loanPrice;
}

/**
 * Sort markets by liquidity (USD-first, asset fallback)
 * Stable sort (preserves original order on ties)
 */
export function sortMarketsByLiquidityDesc(markets: MorphoMarket[]): MorphoMarket[] {
  return markets
    .map((m, i) => ({ m, i, liqUsd: getLiquidityUsd(m) }))
    .sort((a, b) => {
      if (b.liqUsd !== a.liqUsd) return b.liqUsd - a.liqUsd;

      // Secondary tie-breakers (nice-to-have):
      const bSupplyUsd = b.m.state.supplyAssetsUsd ?? 0;
      const aSupplyUsd = a.m.state.supplyAssetsUsd ?? 0;
      if (bSupplyUsd !== aSupplyUsd) return bSupplyUsd - aSupplyUsd;

      return a.i - b.i;
    })
    .map(x => x.m);
}

// ============ API Fetchers ============

async function fetchMorphoMarkets(chainId: number, search?: string): Promise<MorphoMarket[]> {
  try {
    const params = new URLSearchParams({
      first: "2000",
      // Use curated mode (default): includes whitelisted markets + markets listed via vaults, excludes HIGH warnings
      curation: "curated",
      // Optional safety rails (opt-in to avoid filtering everything)
      minLiquidityUsd: "10000",
      hideSaturated: "true",
    });

    // Forward search parameter to API if provided
    if (search && search.trim().length > 0) {
      params.set("search", search.trim());
    }

    const response = await fetch(`/api/morpho/${chainId}/markets?${params.toString()}`);
    if (!response.ok) {
      console.error(`[useMorphoLendingPositions] Markets API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const items: MorphoMarket[] = data?.markets?.items || [];

    console.log(`[useMorphoLendingPositions] Fetched ${items.length} markets`);

    // Client-side safety net (ensures liquidity-first ordering even if server-side ordering was unavailable)
    return sortMarketsByLiquidityDesc(items);
  } catch (error) {
    console.error("[useMorphoLendingPositions] Failed to fetch markets:", error);
    return [];
  }
}

async function fetchMorphoPositions(
  chainId: number,
  userAddress: string
): Promise<MorphoPosition[]> {
  try {
    // Use the hybrid endpoint that combines on-chain and GraphQL data
    // On-chain data ensures positions created through our UI are visible
    // even if Morpho's indexer hasn't picked them up yet
    const response = await fetch(
      `/api/morpho/${chainId}/positions-onchain?user=${userAddress}`
    );
    if (!response.ok) {
      console.error(`[useMorphoLendingPositions] Positions API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data?.userByAddress?.marketPositions || [];
  } catch (error) {
    console.error("[useMorphoLendingPositions] Failed to fetch positions:", error);
    return [];
  }
}

// ============ Hook Result ============

interface UseMorphoLendingPositionsResult {
  // All markets available on this chain
  markets: MorphoMarket[];
  // User positions as rows
  rows: MorphoPositionRow[];
  // Positions with collateral (for supply display)
  suppliedPositions: ProtocolPosition[];
  // Positions with debt (for borrow display)
  borrowedPositions: ProtocolPosition[];
  // Loading states
  isLoadingMarkets: boolean;
  isLoadingPositions: boolean;
  hasLoadedOnce: boolean;
  isUpdating: boolean;
  // Refetch
  refetchPositions: () => void;
  refetchMarkets: () => void;
  // Errors
  marketsError: unknown;
  positionsError: unknown;
}

// ============ Main Hook ============

export function useMorphoLendingPositions(
  chainId: number,
  userAddress: string | undefined
): UseMorphoLendingPositionsResult {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Fetch markets
  const {
    data: markets = [],
    isLoading: isLoadingMarkets,
    isFetching: isFetchingMarkets,
    error: marketsError,
    refetch: refetchMarkets,
  } = useQuery({
    queryKey: ["morpho-markets", chainId],
    queryFn: () => fetchMorphoMarkets(chainId),
    staleTime: 10_000, // 1 minute
    refetchOnWindowFocus: false,
    enabled: chainId > 0,
  });

  // Fetch user positions
  const {
    data: positions = [],
    isLoading: isLoadingPositions,
    isFetching: isFetchingPositions,
    error: positionsError,
    refetch: refetchPositions,
  } = useQuery({
    queryKey: ["morpho-positions", chainId, userAddress],
    queryFn: () => fetchMorphoPositions(chainId, userAddress as string),
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: false,
    enabled: chainId > 0 && !!userAddress,
  });

  // Track first load
  useEffect(() => {
    if (!isLoadingPositions && !hasLoadedOnce && userAddress) {
      setHasLoadedOnce(true);
    }
  }, [isLoadingPositions, hasLoadedOnce, userAddress]);

  // Reset on address or chainId change
  useEffect(() => {
    setHasLoadedOnce(false);
  }, [userAddress, chainId]);

  // Build position rows
  const rows = useMemo<MorphoPositionRow[]>(() => {
    if (!positions.length) return [];

    return positions
      .filter((pos) => pos.collateral > 0 || pos.borrowAssets > 0)
      .map((pos): MorphoPositionRow => {
        const market = pos.market;
        const context = createMorphoContext(market);

        const collateralDecimals = market.collateralAsset?.decimals || 18;
        const loanDecimals = market.loanAsset.decimals;

        const collateralBalance = BigInt(Math.floor(pos.collateral));
        const borrowBalance = BigInt(Math.floor(pos.borrowAssets));

        const collateralPriceUsd = market.collateralAsset?.priceUsd || 0;
        const loanPriceUsd = market.loanAsset.priceUsd || 0;

        const collateralBalanceNum = Number(
          formatUnits(collateralBalance, collateralDecimals)
        );
        const borrowBalanceNum = Number(formatUnits(borrowBalance, loanDecimals));

        const collateralBalanceUsd = collateralBalanceNum * collateralPriceUsd;
        const borrowBalanceUsd = borrowBalanceNum * loanPriceUsd;

        // LTV calculation
        const lltv = Number(market.lltv) / 1e18;
        let currentLtv: number | null = null;
        if (collateralBalanceUsd > 0 && borrowBalanceUsd > 0) {
          currentLtv = (borrowBalanceUsd / collateralBalanceUsd) * 100;
        }

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
          supplyApy: market.state.supplyApy * 100,
          borrowApy: market.state.borrowApy * 100,
          lltv: lltv * 100,
          currentLtv,
          healthFactor: pos.healthFactor,
          isHealthy: pos.healthFactor === null || pos.healthFactor >= 1,
          hasCollateral: pos.collateral > 0,
          hasDebt: pos.borrowAssets > 0,
        };
      });
  }, [positions]);

  // Convert to ProtocolPosition format for compatibility
  const suppliedPositions = useMemo<ProtocolPosition[]>(() => {
    return rows
      .filter((r) => r.hasCollateral)
      .map((row) => ({
        icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
        name: row.collateralSymbol,
        balance: row.collateralBalanceUsd,
        tokenBalance: row.collateralBalance,
        currentRate: row.supplyApy,
        tokenAddress: row.market.collateralAsset?.address || "",
        tokenDecimals: row.collateralDecimals,
        tokenPrice: BigInt(
          Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)
        ),
        tokenSymbol: row.collateralSymbol,
      }));
  }, [rows]);

  const borrowedPositions = useMemo<ProtocolPosition[]>(() => {
    return rows
      .filter((r) => r.hasDebt)
      .map((row) => ({
        icon: tokenNameToLogo(row.loanSymbol.toLowerCase()),
        name: row.loanSymbol,
        balance: row.borrowBalanceUsd,
        tokenBalance: row.borrowBalance,
        currentRate: row.borrowApy,
        tokenAddress: row.market.loanAsset.address,
        tokenDecimals: row.borrowDecimals,
        tokenPrice: BigInt(
          Math.floor((row.market.loanAsset.priceUsd || 0) * 1e8)
        ),
        tokenSymbol: row.loanSymbol,
      }));
  }, [rows]);

  const isUpdating =
    (isFetchingMarkets && !isLoadingMarkets) ||
    (isFetchingPositions && !isLoadingPositions);

  return {
    markets,
    rows,
    suppliedPositions,
    borrowedPositions,
    isLoadingMarkets,
    isLoadingPositions,
    hasLoadedOnce,
    isUpdating,
    refetchPositions: useCallback(() => refetchPositions(), [refetchPositions]),
    refetchMarkets: useCallback(() => refetchMarkets(), [refetchMarkets]),
    marketsError,
    positionsError,
  };
}

// ============ Markets-only Hook (for market selection UI) ============

export function useMorphoMarkets(chainId: number, search?: string) {
  // Normalize search: empty string or undefined both mean no search
  const normalizedSearch = search?.trim() || undefined;
  
  const {
    data: markets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["morpho-markets", chainId, normalizedSearch],
    queryFn: () => {
      logger.debug("[useMorphoMarkets] Fetching markets with search:", normalizedSearch || "(none)");
      return fetchMorphoMarkets(chainId, normalizedSearch);
    },
    staleTime: 30_000, // Reduced from 60s to 30s for search responsiveness
    refetchOnWindowFocus: false,
    enabled: chainId > 0,
    // Use select so sorting does not rerun unnecessarily
    select: (ms) => sortMarketsByLiquidityDesc(ms),
  });

  // Filter to only markets with both collateral and loan assets
  // Keep original conditions, but preserve the sorted order
  const validMarkets = useMemo(() => {
    return markets.filter(
      (m) => m.collateralAsset && m.loanAsset && 
        // Check either supplyAssets or supplyAssetsUsd (API may return one or both)
        ((m.state.supplyAssets ?? 0) > 0 || (m.state.supplyAssetsUsd ?? 0) > 0)
    );
  }, [markets]);

  // Group by collateral/loan pair for display
  const marketPairs = useMemo(() => {
    const pairs = new Map<string, MorphoMarket[]>();
    validMarkets.forEach((m) => {
      const key = `${m.collateralAsset?.symbol}/${m.loanAsset.symbol}`;
      const existing = pairs.get(key) || [];
      existing.push(m);
      pairs.set(key, existing);
    });
    return pairs;
  }, [validMarkets]);

  return {
    markets: validMarkets,
    marketPairs,
    isLoading,
    error,
    refetch,
  };
}

