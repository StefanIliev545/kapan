"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import type { UniswapPosition } from "~~/utils/uniswapMath";
import { fetchUniswapV3Positions, isUniswapV3Supported } from "~~/utils/uniswapV3";
import { fetchUniswapV4Positions, isUniswapV4Supported } from "~~/utils/uniswapV4";

export function isUniswapSupported(chainId: number): boolean {
  return isUniswapV3Supported(chainId) || isUniswapV4Supported(chainId);
}

export interface UseUniswapPositionsResult {
  positions: UniswapPosition[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  supported: boolean;
}

/**
 * Fetch a user's Uniswap V3 + V4 LP positions on a chain (view-only).
 *
 * V3 is enumerated on-chain (ERC-721 Enumerable); V4 is enumerated via the Alchemy NFT API
 * (its PositionManager isn't enumerable) then read on-chain. Both readers batch via multicall.
 * Returns the two merged, open positions first.
 */
export function useUniswapPositions(chainId: number, user: string | undefined): UseUniswapPositionsResult {
  const client = usePublicClient({ chainId });
  const supported = isUniswapSupported(chainId);

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ["uniswap-positions", chainId, user],
    queryFn: async (): Promise<UniswapPosition[]> => {
      if (!client || !user) return [];
      const pc = client as unknown as PublicClient;
      const addr = user as Address;
      const [v4, v3] = await Promise.all([
        isUniswapV4Supported(chainId)
          ? fetchUniswapV4Positions(pc, chainId, addr, scaffoldConfig.alchemyApiKey).catch(() => [])
          : Promise.resolve([] as UniswapPosition[]),
        isUniswapV3Supported(chainId)
          ? fetchUniswapV3Positions(pc, chainId, addr).catch(() => [])
          : Promise.resolve([] as UniswapPosition[]),
      ]);
      // Open positions first (closed = fully withdrawn, fee-dust only), then by version.
      return [...v4, ...v3].sort((a, b) => Number(a.closed) - Number(b.closed));
    },
    enabled: supported && !!client && !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { positions: data ?? [], isLoading, hasLoadedOnce: isFetched, supported };
}
