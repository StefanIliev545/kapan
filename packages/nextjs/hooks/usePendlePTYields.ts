import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Address } from "viem";

// Try direct Pendle API first (often works), fall back to proxy if CORS blocked
const PENDLE_API_DIRECT = "https://api-v2.pendle.finance/core/v1";
const PENDLE_API_PROXY = "/api/pendle";

// Pendle market data from their API
export interface PendleMarket {
  address: string;
  name: string;
  symbol: string;
  expiry: string; // ISO date string
  pt: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  yt: {
    address: string;
    symbol: string;
  };
  sy: {
    address: string;
    symbol: string;
  };
  underlyingAsset: {
    address: string;
    symbol: string;
    name: string;
  };
  impliedApy: number; // The fixed APY for holding PT to maturity
  underlyingApy: number;
  liquidity: {
    usd: number;
  };
}

export interface PTYield {
  address: Address;
  symbol: string;
  name: string;
  fixedApy: number; // Implied APY as percentage (e.g., 15.5 for 15.5%)
  expiry: Date;
  daysToExpiry: number;
  underlyingSymbol: string;
  marketAddress: string;
  liquidity: number;
}

// Map chain IDs to Pendle API chain names
const PENDLE_CHAIN_MAP: Record<number, string> = {
  1: "1",        // Ethereum
  42161: "42161", // Arbitrum
  10: "10",      // Optimism
  8453: "8453",  // Base
  56: "56",      // BSC
  9745: "9745",  // Plasma
};

/**
 * Fetch all active Pendle markets for a chain
 */
async function fetchPendleMarkets(chainId: number): Promise<PendleMarket[]> {
  const pendleChainId = PENDLE_CHAIN_MAP[chainId];
  if (!pendleChainId) {
    console.warn(`[usePendlePTYields] Chain ${chainId} not supported by Pendle`);
    return [];
  }

  const endpoint = `/${pendleChainId}/markets?order_by=name%3A1&skip=0&limit=100`;
  
  // Try direct API first (faster, no proxy compile time)
  try {
    const directResponse = await fetch(`${PENDLE_API_DIRECT}${endpoint}`, {
      headers: { Accept: "application/json" },
    });
    if (directResponse.ok) {
      const data = await directResponse.json();
      return data.results || data || [];
    }
  } catch {
    // CORS blocked or network error, fall back to proxy
  }

  // Fall back to local proxy
  try {
    const response = await fetch(`${PENDLE_API_PROXY}${endpoint}`);
    
    if (!response.ok) {
      console.error(`[usePendlePTYields] Pendle API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || data || [];
  } catch (error) {
    console.error("[usePendlePTYields] Failed to fetch Pendle markets:", error);
    return [];
  }
}

/**
 * Check if a token symbol looks like a PT token
 */
export function isPTToken(symbol: string): boolean {
  const lower = symbol.toLowerCase();
  return lower.startsWith("pt-") || lower.startsWith("pt ");
}

/**
 * Extract the base token from a PT token name
 * e.g., "PT-USDe-15JAN2026" -> "usde"
 */
export function extractPTBaseToken(symbol: string): string {
  const lower = symbol.toLowerCase();
  if (!lower.startsWith("pt-") && !lower.startsWith("pt ")) return "";
  
  // Remove "pt-" prefix
  const withoutPrefix = lower.replace(/^pt[-\s]/, "");
  // Remove date suffix (e.g., "-15jan2026")
  const baseToken = withoutPrefix.replace(/-?\d{1,2}[a-z]{3}\d{4}$/i, "");
  return baseToken.replace(/-$/, ""); // Remove trailing dash if any
}

/**
 * Hook to fetch PT token yields from Pendle
 * 
 * @param chainId - The chain ID to fetch markets for
 * @param tokens - Optional list of token addresses/symbols to filter by
 * @param enabled - Whether to enable the query
 */
export function usePendlePTYields(
  chainId?: number,
  tokens?: { address: Address; symbol: string }[],
  enabled = true
) {
  const isSupported = !!chainId && !!PENDLE_CHAIN_MAP[chainId];
  
  
  const query = useQuery({
    queryKey: ["pendle-pt-yields", chainId],
    queryFn: async () => {
      if (!chainId) return [];
      
      const markets = await fetchPendleMarkets(chainId);
      const now = new Date();
      
      // Convert markets to PTYield format
      const yields: PTYield[] = markets
        .filter(m => m.pt && m.impliedApy !== undefined)
        .map(m => {
          const expiry = new Date(m.expiry);
          const daysToExpiry = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          
          return {
            address: m.pt.address.toLowerCase() as Address,
            symbol: m.pt.symbol,
            name: m.pt.name,
            fixedApy: m.impliedApy * 100, // Convert to percentage
            expiry,
            daysToExpiry,
            underlyingSymbol: m.underlyingAsset?.symbol || "",
            marketAddress: m.address,
            liquidity: m.liquidity?.usd || 0,
          };
        })
        .filter(y => y.daysToExpiry > 0); // Only include non-expired markets
      
      return yields;
    },
    enabled: enabled && isSupported,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Create memoized maps for easy lookup by address and symbol
  const yieldsByAddress = useMemo(() => {
    const map = new Map<string, PTYield>();
    query.data?.forEach(y => map.set(y.address.toLowerCase(), y));
    return map;
  }, [query.data]);

  const yieldsBySymbol = useMemo(() => {
    const map = new Map<string, PTYield>();
    query.data?.forEach(y => map.set(y.symbol.toLowerCase(), y));
    return map;
  }, [query.data]);

  // If tokens provided, match them to yields
  const matchedYields = useMemo(() => {
    if (!tokens) return undefined;
    return tokens.map(t => {
      // Try exact address match first
      const byAddress = yieldsByAddress.get(t.address.toLowerCase());
      if (byAddress) return { ...t, yield: byAddress };
      
      // Try symbol match
      const bySymbol = yieldsBySymbol.get(t.symbol.toLowerCase());
      if (bySymbol) return { ...t, yield: bySymbol };
      
      // Try fuzzy match based on base token
      if (isPTToken(t.symbol)) {
        const baseToken = extractPTBaseToken(t.symbol);
        const match = query.data?.find(y => 
          y.underlyingSymbol.toLowerCase().includes(baseToken) ||
          y.symbol.toLowerCase().includes(baseToken)
        );
        if (match) return { ...t, yield: match };
      }
      
      return { ...t, yield: undefined };
    });
  }, [tokens, yieldsByAddress, yieldsBySymbol, query.data]);


  return {
    yields: query.data || [],
    yieldsByAddress,
    yieldsBySymbol,
    matchedYields,
    isLoading: query.isLoading,
    isSupported,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Build APY maps with PT yields automatically enhanced
 * For PT tokens, uses Pendle fixed yield; for others, uses provided rate
 * 
 * @param chainId - The chain ID
 * @param tokens - Array of tokens with address, symbol, and optional rates
 * @returns supplyApyMap and borrowApyMap with PT yields applied
 */
export function usePTEnhancedApyMaps(
  chainId: number | undefined,
  tokens: Array<{
    address: string;
    symbol: string;
    supplyRate?: number;
    borrowRate?: number;
  }>
) {
  const { yieldsByAddress, yieldsBySymbol, yields, isLoading } = usePendlePTYields(chainId);

  const supplyApyMap = useMemo(() => {
    const map: Record<string, number> = {};
    tokens.forEach(t => {
      const addrLower = t.address.toLowerCase();
      
      // Check if this is a PT token and we have yield data
      if (isPTToken(t.symbol)) {
        // Try to find yield by address first, then by symbol
        let ptYield = yieldsByAddress.get(addrLower) || yieldsBySymbol.get(t.symbol.toLowerCase());
        
        // Fuzzy match if no exact match
        if (!ptYield) {
          const baseToken = extractPTBaseToken(t.symbol);
          ptYield = yields.find(y => 
            y.underlyingSymbol.toLowerCase().includes(baseToken) ||
            y.symbol.toLowerCase().includes(baseToken)
          );
        }
        
        if (ptYield) {
          map[addrLower] = ptYield.fixedApy;
          return;
        }
      }
      
      // Default to provided rate
      map[addrLower] = t.supplyRate || 0;
    });
    return map;
  }, [tokens, yieldsByAddress, yieldsBySymbol, yields]);

  const borrowApyMap = useMemo(() => {
    const map: Record<string, number> = {};
    tokens.forEach(t => {
      map[t.address.toLowerCase()] = Math.abs(t.borrowRate || 0);
    });
    return map;
  }, [tokens]);

  return { supplyApyMap, borrowApyMap, isLoading };
}

/**
 * Get the fixed APY for a specific token if it's a PT
 */
export function usePTYield(
  chainId?: number,
  tokenAddress?: Address,
  tokenSymbol?: string,
  enabled = true
) {
  const { yieldsByAddress, yieldsBySymbol, yields, isLoading } = usePendlePTYields(
    chainId,
    undefined,
    enabled && !!(tokenAddress || tokenSymbol)
  );

  let ptYield: PTYield | undefined;

  if (tokenAddress) {
    ptYield = yieldsByAddress.get(tokenAddress.toLowerCase());
  }
  
  if (!ptYield && tokenSymbol) {
    ptYield = yieldsBySymbol.get(tokenSymbol.toLowerCase());
    
    // Fuzzy match
    if (!ptYield && isPTToken(tokenSymbol)) {
      const baseToken = extractPTBaseToken(tokenSymbol);
      ptYield = yields.find(y => 
        y.underlyingSymbol.toLowerCase().includes(baseToken) ||
        y.symbol.toLowerCase().includes(baseToken)
      );
    }
  }

  return {
    yield: ptYield,
    fixedApy: ptYield?.fixedApy,
    daysToExpiry: ptYield?.daysToExpiry,
    isLoading,
  };
}
