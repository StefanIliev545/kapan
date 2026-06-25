"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import type { UniswapPosition } from "~~/utils/uniswapMath";
import { fetchSlipstreamPositions, isSlipstreamSupported } from "~~/utils/aerodromeSlipstream";

export interface UseAerodromePositionsResult {
  positions: UniswapPosition[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  supported: boolean;
}

/**
 * Fetch a user's unstaked Aerodrome (Base) / Velodrome (Optimism) Slipstream CL positions.
 * On-chain enumeration + multicall (no API key). Staked-in-gauge positions are a future add.
 */
export function useAerodromePositions(chainId: number, user: string | undefined): UseAerodromePositionsResult {
  const client = usePublicClient({ chainId });
  const supported = isSlipstreamSupported(chainId);

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ["slipstream-positions", chainId, user],
    queryFn: async (): Promise<UniswapPosition[]> => {
      if (!client || !user) return [];
      return fetchSlipstreamPositions(client as unknown as PublicClient, chainId, user as Address).catch(() => []);
    },
    enabled: supported && !!client && !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { positions: data ?? [], isLoading, hasLoadedOnce: isFetched, supported };
}
