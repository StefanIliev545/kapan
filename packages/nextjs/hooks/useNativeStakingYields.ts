import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { qk } from "~~/lib/queryKeys";

interface YieldPoolEntry {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  category?: string;
  apy?: number;
  underlyingTokens?: string[];
}

export interface NativeYieldRequest {
  tokenAddress?: string;
  tokenSymbol?: string;
  nativeAssetId?: string;
}

interface NativeYieldResult {
  apy: number;
  source?: string;
  pool?: string;
}

const DEFILLAMA_POOLS_ENDPOINT = "https://yields.llama.fi/pools";

const nativeAssetFallback: Record<string, string> = {
  ETH: "ethereum:0x0000000000000000000000000000000000000000",
  WETH: "ethereum:0x0000000000000000000000000000000000000000",
  MATIC: "polygon:0x0000000000000000000000000000000000000000",
  WMATIC: "polygon:0x0000000000000000000000000000000000000000",
  BNB: "bsc:0x0000000000000000000000000000000000000000",
  WBNB: "bsc:0x0000000000000000000000000000000000000000",
  SOL: "solana:So11111111111111111111111111111111111111112",
};

const chainPrefixes: Record<string, string> = {
  ethereum: "ethereum",
  polygon: "polygon",
  matic: "polygon",
  bsc: "bsc",
  binance: "bsc",
  solana: "solana",
  arbitrum: "arbitrum",
  optimism: "optimism",
  avalanche: "avax",
};

const fetchYieldPools = async (): Promise<YieldPoolEntry[]> => {
  const response = await fetch(DEFILLAMA_POOLS_ENDPOINT);
  if (!response.ok) {
    throw new Error("Failed to fetch yield pools from DefiLlama");
  }

  const json = await response.json();
  if (!json?.data || !Array.isArray(json.data)) return [];

  return json.data as YieldPoolEntry[];
};

const resolveNativeAssetId = ({ tokenSymbol, nativeAssetId }: NativeYieldRequest) => {
  if (nativeAssetId) return nativeAssetId.toLowerCase();
  if (!tokenSymbol) return undefined;
  const fallback = nativeAssetFallback[tokenSymbol.toUpperCase()];
  return fallback?.toLowerCase();
};

const normalizeAssetId = (tokenId: string, chain?: string) => {
  const lowerToken = tokenId.toLowerCase();
  if (lowerToken.includes(":")) return lowerToken;

  const chainKey = chain?.toLowerCase() ?? "";
  const chainPrefix = chainPrefixes[chainKey] ?? chainKey;
  if (!chainPrefix) return undefined;

  return `${chainPrefix}:${lowerToken}`;
};

export const useNativeStakingYields = (requests: NativeYieldRequest[] = []) => {
  const nativeAssetIds = useMemo(() => {
    const ids = new Set<string>();
    requests.forEach(request => {
      const id = resolveNativeAssetId(request);
      if (id) ids.add(id);
    });
    return Array.from(ids);
  }, [requests]);

  const nativeAssetIdSet = useMemo(() => new Set(nativeAssetIds), [nativeAssetIds]);

  const { data: pools = [], isLoading } = useQuery({
    queryKey: qk.nativeStakingYields(),
    queryFn: fetchYieldPools,
    enabled: nativeAssetIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const apyByAssetId = useMemo(() => {
    const map = new Map<string, NativeYieldResult>();

    if (!pools.length || !nativeAssetIdSet.size) return map;

    pools.forEach(pool => {
      if (!pool.underlyingTokens?.length) return;
      const poolApy = Number(pool.apy) || 0;

      pool.underlyingTokens.forEach(tokenId => {
        const normalizedId = normalizeAssetId(tokenId, pool.chain);
        if (!normalizedId || !nativeAssetIdSet.has(normalizedId)) return;

        const existing = map.get(normalizedId);
        if (!existing || poolApy > existing.apy) {
          map.set(normalizedId, { apy: poolApy, source: pool.project, pool: pool.pool });
        }
      });
    });

    return map;
  }, [nativeAssetIdSet, pools]);

  const yieldsByToken = useMemo(() => {
    const map = new Map<string, NativeYieldResult>();
    if (!apyByAssetId.size) return map;

    requests.forEach(request => {
      const assetId = resolveNativeAssetId(request);
      if (!assetId) return;
      const yieldInfo = apyByAssetId.get(assetId);
      if (!yieldInfo) return;

      const key = request.tokenAddress?.toLowerCase() ?? request.tokenSymbol?.toLowerCase();
      if (key) {
        map.set(key, yieldInfo);
      }
    });

    return map;
  }, [apyByAssetId, requests]);

  return { yieldsByToken, isLoading };
};
