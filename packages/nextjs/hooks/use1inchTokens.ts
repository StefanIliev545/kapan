import { useQuery } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { Address } from "viem";
import { fetch1inchTokens, OneInchToken } from "../utils/1inch";
import { is1inchSupported } from "../utils/chainFeatures";
import { getEffectiveChainId } from "../utils/forkChain";

interface Use1inchTokensProps {
  chainId: number;
  enabled?: boolean;
}

/**
 * Hook to fetch all available tokens from 1inch for a chain.
 * Returns tokens sorted by symbol, with common tokens first.
 */
export function use1inchTokens({ chainId, enabled = true }: Use1inchTokensProps) {
  const isSupported = is1inchSupported(chainId);
  const effectiveChainId = getEffectiveChainId(chainId);

  const query = useQuery({
    queryKey: ["1inch-tokens", effectiveChainId],
    queryFn: async () => {
      const response = await fetch1inchTokens(effectiveChainId);
      return response.tokens;
    },
    enabled: enabled && isSupported,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });

  // Convert to array and sort with common tokens first
  const tokens = useMemo(() => {
    if (!query.data) return [];

    const commonSymbols = new Set([
      "WETH", "ETH", "USDC", "USDT", "DAI", "WBTC", "USDC.e",
      "wstETH", "rETH", "cbETH", "stETH", "LINK", "UNI", "AAVE",
    ]);

    const tokenList = Object.values(query.data) as OneInchToken[];

    // Sort: common tokens first, then alphabetically
    return tokenList.sort((a, b) => {
      const aIsCommon = commonSymbols.has(a.symbol);
      const bIsCommon = commonSymbols.has(b.symbol);

      if (aIsCommon && !bIsCommon) return -1;
      if (!aIsCommon && bIsCommon) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [query.data]);

  // Create a lookup map by address (lowercase)
  const tokensByAddress = useMemo(() => {
    const map = new Map<string, OneInchToken>();
    tokens.forEach(t => map.set(t.address.toLowerCase(), t));
    return map;
  }, [tokens]);

  // Find a token by address - memoized to maintain stable reference
  const findToken = useCallback(
    (address: Address | string): OneInchToken | undefined => {
      return tokensByAddress.get(address.toLowerCase());
    },
    [tokensByAddress]
  );

  return {
    tokens,
    tokensByAddress,
    findToken,
    isLoading: query.isLoading,
    isSupported,
    error: query.error,
  };
}
