import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount } from "wagmi";

import {
  fetchPendlePortfolio,
  type PendlePortfolioPosition,
} from "~~/utils/pendlePortfolio";

/**
 * User-specific Pendle position data (entry APY, cost basis, unrealized P&L).
 *
 * Distinct from `usePendlePTYields`, which exposes the *market*-implied APY
 * for a freshly purchased PT. This hook surfaces what the user actually
 * locked in at entry — the number that's meaningful for a portfolio view.
 */
export interface UsePendlePortfolioResult {
  isLoading: boolean;
  error: unknown;
  /** All positions, across chains. */
  positions: PendlePortfolioPosition[];
  /** Lookup by `${chainId}:${ptAddressLowercase}`. */
  byPtAddress: Map<string, PendlePortfolioPosition>;
}

const portfolioKey = (chainId: number, ptAddress: string) =>
  `${chainId}:${ptAddress.toLowerCase()}`;

export function getPendlePortfolioKey(chainId: number, ptAddress: string): string {
  return portfolioKey(chainId, ptAddress);
}

export function usePendlePortfolio(address?: Address): UsePendlePortfolioResult {
  const { address: connected } = useAccount();
  const target = address ?? connected;

  const query = useQuery({
    queryKey: ["pendle-portfolio", target?.toLowerCase()],
    queryFn: async () => {
      if (!target) return { positions: [], raw: undefined } as const;
      return fetchPendlePortfolio(target);
    },
    enabled: !!target,
    // Position data changes slowly relative to price — keep fresh but don't
    // hammer the proxy. 2min refresh matches how often rates drift.
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const byPtAddress = useMemo(() => {
    const map = new Map<string, PendlePortfolioPosition>();
    const positions = query.data?.positions ?? [];
    for (const p of positions) {
      map.set(portfolioKey(p.chainId, p.ptAddress), p);
    }
    return map;
  }, [query.data]);

  return {
    isLoading: query.isLoading,
    error: query.error,
    positions: query.data?.positions ?? [],
    byPtAddress,
  };
}
