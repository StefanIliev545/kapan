import { useQuery } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { Address } from "viem";

// Pendle API base URL
const PENDLE_API = "https://api-v2.pendle.finance/core/v1";

// Chain IDs supported by Pendle
const PENDLE_CHAIN_IDS = [1, 42161, 10, 8453, 56];

export interface PendleToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Expiry timestamp for PT/YT tokens */
  expiry?: string;
  /** Type: PT, YT, SY, LP */
  type: "PT" | "YT" | "SY" | "LP";
  /** Chain ID */
  chainId: number;
  /** Price in USD if available */
  priceUsd?: number;
  /** Logo URL */
  logoURI?: string;
  /** Underlying asset info */
  underlying?: {
    address: string;
    symbol: string;
  };
  /** Days until expiry (for PT/YT) */
  daysToExpiry?: number;
  /** Fixed APY for PT tokens */
  impliedApy?: number;
}

interface PendleMarketResponse {
  pt: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  expiry: string;
  impliedApy: number;
  underlyingAsset?: {
    address: string;
    symbol: string;
  };
}

/**
 * Fetch PT tokens with APY data from markets endpoint
 */
async function fetchPendlePTFromMarkets(chainId: number): Promise<PendleToken[]> {
  try {
    const url = `${PENDLE_API}/${chainId}/markets?limit=100&order_by=name:1`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const markets: PendleMarketResponse[] = data.results || data || [];
    const now = Date.now();
    const seen = new Set<string>();

    return markets
      .filter(m => m.pt && m.expiry)
      .map(m => {
        const expiry = new Date(m.expiry).getTime();
        const daysToExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

        return {
          address: m.pt.address.toLowerCase() as Address,
          symbol: m.pt.symbol,
          name: m.pt.name,
          decimals: m.pt.decimals,
          expiry: m.expiry,
          type: "PT" as const,
          chainId,
          daysToExpiry,
          impliedApy: m.impliedApy,
          underlying: m.underlyingAsset,
        };
      })
      .filter(t => {
        if (t.daysToExpiry <= 0) return false;
        const key = t.address;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch (error) {
    console.warn(`[usePendleTokens] Failed to fetch markets for chain ${chainId}:`, error);
    return [];
  }
}

/**
 * Hook to fetch Pendle PT tokens for a specific chain
 * Returns tokens that haven't matured yet, suitable for swap targets
 */
export function usePendleTokens({
  chainId,
  enabled = true,
}: {
  chainId: number;
  enabled?: boolean;
}) {
  const isSupported = PENDLE_CHAIN_IDS.includes(chainId);

  const query = useQuery({
    queryKey: ["pendle-pt-tokens", chainId],
    queryFn: async () => {
      if (!isSupported) return [];
      // Use markets endpoint as it has more reliable data with APY
      return fetchPendlePTFromMarkets(chainId);
    },
    enabled: enabled && isSupported,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Create lookup map
  const tokensByAddress = useMemo(() => {
    const map = new Map<string, PendleToken>();
    query.data?.forEach(t => map.set(t.address.toLowerCase(), t));
    return map;
  }, [query.data]);

  // Find token function
  const findToken = useCallback(
    (address: string): PendleToken | undefined => {
      return tokensByAddress.get(address.toLowerCase());
    },
    [tokensByAddress]
  );

  return {
    tokens: query.data || [],
    tokensByAddress,
    findToken,
    isLoading: query.isLoading,
    isSupported,
    error: query.error,
  };
}

/**
 * Get the icon path for a PT token
 * Uses PT-specific icon (e.g., ptusdai.svg) - most PT tokens have dedicated icons
 */
export function getPTTokenIcon(symbol: string): string {
  // Normalize symbol: "PT-sUSDai-20NOV2025-(ARB)" -> "ptsusdai"
  const ptSymbol = symbol
    .toLowerCase()
    .replace(/^pt-/i, "pt")  // PT-xxx -> ptxxx
    .replace(/-?\([a-z]+\)$/i, "")  // Remove chain suffix like -(ARB) or (ARB)
    .replace(/-\d+[a-z]+\d+$/i, "")  // Remove date suffix like -20NOV2025
    .replace(/-/g, "");  // Remove remaining dashes

  // Use PT-specific icon - Image component will use fallback if not found
  return `/logos/${ptSymbol}.svg`;
}

/**
 * Format PT token for display in picker
 */
export function formatPTTokenForPicker(token: PendleToken): {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  badge?: string;
  subtitle?: string;
} {
  // Parse maturity date for display
  let maturityStr = "";
  if (token.expiry) {
    const expiry = new Date(token.expiry);
    maturityStr = expiry.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }

  // Format APY if available
  const apyStr = token.impliedApy !== undefined
    ? `${(token.impliedApy * 100).toFixed(1)}% APY`
    : undefined;

  // Build subtitle with maturity and APY
  const subtitleParts: string[] = [];
  if (maturityStr) subtitleParts.push(`Exp: ${maturityStr}`);
  if (apyStr) subtitleParts.push(apyStr);

  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    icon: getPTTokenIcon(token.symbol),
    badge: token.daysToExpiry !== undefined ? `${token.daysToExpiry}d` : undefined,
    subtitle: subtitleParts.join(" • "),
  };
}
