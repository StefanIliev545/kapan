import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Address } from "viem";

// Maple Finance GraphQL API endpoint
const MAPLE_API = "https://api.maple.finance/v2/graphql";

// Known syrup token addresses by chain
const SYRUP_TOKENS: Record<number, Record<string, Address>> = {
  1: { // Ethereum mainnet
    syrupUSDC: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b",
    syrupUSDT: "0x82784f72f6c5e11c90490cc3e14df7447c4dde39",
  },
  42161: { // Arbitrum
    syrupUSDC: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b", // May be different on Arbitrum
  },
};

// Pool IDs for GraphQL queries
const POOL_IDS: Record<string, string> = {
  syrupUSDC: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
  syrupUSDT: "0x82784f72f6c5e11c90490cc3e14df7447c4dde39",
};

export interface MapleYield {
  address: Address;
  symbol: string;
  name: string;
  apy: number; // APY as percentage (e.g., 7.5 for 7.5%)
  dripsBoost: number; // Additional Drips yield boost as percentage
  totalApy: number; // apy + dripsBoost
}

interface MaplePoolResponse {
  poolV2: {
    name: string;
    weeklyApy: string;
    monthlyApy: string;
  } | null;
  syrupGlobals: {
    dripsYieldBoost: string;
  } | null;
}

/**
 * Check if a token symbol is a Maple syrup token
 */
export function isSyrupToken(symbol: string): boolean {
  const lower = symbol.toLowerCase();
  return lower === "syrupusdc" || lower === "syrupusdt" ||
         lower === "syrup-usdc" || lower === "syrup-usdt";
}

/**
 * Normalize syrup token symbol
 */
function normalizeSyrupSymbol(symbol: string): "syrupUSDC" | "syrupUSDT" | null {
  const lower = symbol.toLowerCase().replace("-", "");
  if (lower === "syrupusdc") return "syrupUSDC";
  if (lower === "syrupusdt") return "syrupUSDT";
  return null;
}

/**
 * Fetch APY data from Maple Finance GraphQL API
 */
async function fetchMapleYields(): Promise<MapleYield[]> {
  const yields: MapleYield[] = [];

  for (const [symbol, poolId] of Object.entries(POOL_IDS)) {
    try {
      const query = `{
        poolV2(id: "${poolId}") {
          name
          weeklyApy
          monthlyApy
        }
        syrupGlobals {
          dripsYieldBoost
        }
      }`;

      const response = await fetch(MAPLE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        console.warn(`[Maple API] Failed to fetch ${symbol}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const result = data.data as MaplePoolResponse;

      if (!result.poolV2) {
        console.warn(`[Maple API] No pool data for ${symbol}`);
        continue;
      }

      // APY values are scaled by 1e28 - divide to get percentage directly
      // monthlyApy of "52000000000000000000000000000" ≈ 5.2%
      const monthlyApyRaw = BigInt(result.poolV2.monthlyApy || "0");

      // Divide by 1e28 to get percentage
      const apy = Number(monthlyApyRaw) / 1e28;

      // Drips boost: 22000 = 2.2% (divide by 10000 to get percentage)
      const dripsBoostBps = Number(result.syrupGlobals?.dripsYieldBoost || "0");
      const dripsBoost = dripsBoostBps / 10000; // Already gives percentage

      // Get address for mainnet (primary)
      const address = SYRUP_TOKENS[1]?.[symbol] || (poolId as Address);

      yields.push({
        address: address.toLowerCase() as Address,
        symbol,
        name: result.poolV2.name || symbol,
        apy,
        dripsBoost,
        totalApy: apy + dripsBoost,
      });

      if (process.env.NODE_ENV === "development") {
        console.log(`[Maple API] ${symbol}: ${apy.toFixed(2)}% base + ${dripsBoost.toFixed(2)}% drips = ${(apy + dripsBoost).toFixed(2)}% total`);
      }
    } catch (error) {
      console.warn(`[Maple API] Error fetching ${symbol}:`, error);
    }
  }

  return yields;
}

/**
 * Hook to fetch Maple Finance syrup token yields
 */
export function useMapleYields(enabled = true) {
  const query = useQuery({
    queryKey: ["maple-yields"],
    queryFn: fetchMapleYields,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Create lookup maps
  const yieldsByAddress = useMemo(() => {
    const map = new Map<string, MapleYield>();
    query.data?.forEach(y => {
      map.set(y.address.toLowerCase(), y);
      // Also add for all known chain addresses
      for (const chainTokens of Object.values(SYRUP_TOKENS)) {
        const addr = chainTokens[y.symbol];
        if (addr) {
          map.set(addr.toLowerCase(), y);
        }
      }
    });
    return map;
  }, [query.data]);

  const yieldsBySymbol = useMemo(() => {
    const map = new Map<string, MapleYield>();
    query.data?.forEach(y => {
      map.set(y.symbol.toLowerCase(), y);
      // Also add normalized variants
      map.set(y.symbol.toLowerCase().replace("-", ""), y);
    });
    return map;
  }, [query.data]);

  /**
   * Find yield for a token by address or symbol
   */
  const findYield = useMemo(() => {
    return (address?: string, symbol?: string): MapleYield | undefined => {
      if (address) {
        const byAddress = yieldsByAddress.get(address.toLowerCase());
        if (byAddress) return byAddress;
      }

      if (symbol) {
        const normalized = normalizeSyrupSymbol(symbol);
        if (normalized) {
          const bySymbol = yieldsBySymbol.get(normalized.toLowerCase());
          if (bySymbol) return bySymbol;
        }

        // Try direct symbol lookup
        const bySymbol = yieldsBySymbol.get(symbol.toLowerCase());
        if (bySymbol) return bySymbol;
      }

      return undefined;
    };
  }, [yieldsByAddress, yieldsBySymbol]);

  return {
    yields: query.data || [],
    yieldsByAddress,
    yieldsBySymbol,
    findYield,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get Maple yield for a specific token
 */
export function useMapleYield(
  tokenAddress?: Address,
  tokenSymbol?: string,
  enabled = true
) {
  const { findYield, isLoading } = useMapleYields(enabled && !!(tokenAddress || tokenSymbol));

  const mapleYield = useMemo(() => {
    return findYield(tokenAddress, tokenSymbol);
  }, [findYield, tokenAddress, tokenSymbol]);

  return {
    yield: mapleYield,
    apy: mapleYield?.totalApy,
    baseApy: mapleYield?.apy,
    dripsBoost: mapleYield?.dripsBoost,
    isLoading,
  };
}
