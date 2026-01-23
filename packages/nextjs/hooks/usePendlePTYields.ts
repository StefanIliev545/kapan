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
 * Fetch a single page of Pendle markets
 */
async function fetchPendleMarketsPage(
  chainId: number,
  skip: number,
  limit: number
): Promise<PendleMarket[]> {
  const pendleChainId = PENDLE_CHAIN_MAP[chainId];
  if (!pendleChainId) return [];

  const endpoint = `/${pendleChainId}/markets?order_by=name%3A1&skip=${skip}&limit=${limit}`;

  // Try direct API first
  try {
    const directResponse = await fetch(`${PENDLE_API_DIRECT}${endpoint}`, {
      headers: { Accept: "application/json" },
    });
    if (directResponse.ok) {
      const data = await directResponse.json();
      return data.results || data || [];
    }
  } catch {
    // Fall through to proxy
  }

  // Fall back to proxy
  try {
    const response = await fetch(`${PENDLE_API_PROXY}${endpoint}`);
    if (response.ok) {
      const data = await response.json();
      return data.results || data || [];
    }
  } catch {
    // Ignore
  }

  return [];
}

/**
 * Fetch all active Pendle markets for a chain (with pagination)
 */
async function fetchPendleMarkets(chainId: number): Promise<PendleMarket[]> {
  const pendleChainId = PENDLE_CHAIN_MAP[chainId];
  if (!pendleChainId) {
    console.warn(`[usePendlePTYields] Chain ${chainId} not supported by Pendle`);
    return [];
  }

  const allMarkets: PendleMarket[] = [];
  const pageSize = 100;
  let skip = 0;
  let hasMore = true;

  // Fetch pages until we get less than pageSize results
  while (hasMore) {
    const page = await fetchPendleMarketsPage(chainId, skip, pageSize);
    allMarkets.push(...page);

    if (page.length < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
      // Safety limit to prevent infinite loops
      if (skip > 1000) hasMore = false;
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[Pendle API] Chain ${chainId}: ${allMarkets.length} markets total`);
  }

  return allMarkets;
}

/**
 * Check if a token symbol looks like a PT token
 */
export function isPTToken(symbol: string): boolean {
  const lower = symbol.toLowerCase();
  return lower.startsWith("pt-") || lower.startsWith("pt ");
}

/**
 * Parsed PT token information
 */
export interface ParsedPTToken {
  isPT: true;
  originalSymbol: string;
  /** Short display name without date, e.g., "PT-sUSDai" */
  shortName: string;
  /** The underlying token symbol, e.g., "sUSDai" */
  baseToken: string;
  /** Raw date string from symbol, e.g., "20NOV2025" */
  rawMaturityDate: string | null;
  /** Parsed maturity date if available */
  maturityDate: Date | null;
  /** Formatted maturity date string, e.g., "Nov 20, 2025" */
  formattedMaturity: string | null;
  /** Chain suffix if present, e.g., "ARB" from "(ARB)" */
  chainSuffix: string | null;
}

export interface ParsedNonPTToken {
  isPT: false;
  originalSymbol: string;
}

export type ParsedToken = ParsedPTToken | ParsedNonPTToken;

// Month name to number mapping
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a PT token symbol into its components
 * e.g., "PT-sUSDai-20NOV2025-(ARB)" -> { shortName: "PT-sUSDai", baseToken: "sUSDai", maturityDate: Date, ... }
 */
export function parsePTToken(symbol: string): ParsedToken {
  if (!isPTToken(symbol)) {
    return { isPT: false, originalSymbol: symbol };
  }

  let workingSymbol = symbol;

  // Extract chain suffix like "(ARB)", "(ETH)"
  let chainSuffix: string | null = null;
  const chainMatch = workingSymbol.match(/-?\(([A-Z]+)\)$/i);
  if (chainMatch) {
    chainSuffix = chainMatch[1].toUpperCase();
    workingSymbol = workingSymbol.replace(/-?\([A-Z]+\)$/i, "");
  }

  // Extract date pattern: -DDMMMYYYY (e.g., -20NOV2025) or -1XXXXXXXXX (Unix timestamp)
  let rawMaturityDate: string | null = null;
  let maturityDate: Date | null = null;

  const dateMatch = workingSymbol.match(/-(\d{1,2})([A-Z]{3})(\d{4})$/i);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    rawMaturityDate = `${day}${month.toUpperCase()}${year}`;

    const monthNum = MONTH_MAP[month.toLowerCase()];
    if (monthNum !== undefined) {
      maturityDate = new Date(parseInt(year), monthNum, parseInt(day));
    }
    workingSymbol = workingSymbol.replace(/-\d{1,2}[A-Z]{3}\d{4}$/i, "");
  } else {
    // Try Unix timestamp pattern
    const timestampMatch = workingSymbol.match(/-(\d{10})$/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1]) * 1000;
      maturityDate = new Date(timestamp);
      rawMaturityDate = timestampMatch[1];
      workingSymbol = workingSymbol.replace(/-\d{10}$/, "");
    }
  }

  // What remains is "PT-baseToken"
  const shortName = workingSymbol;
  const baseToken = workingSymbol.replace(/^pt[-\s]/i, "");

  // Format the maturity date nicely
  let formattedMaturity: string | null = null;
  if (maturityDate && !isNaN(maturityDate.getTime())) {
    formattedMaturity = maturityDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return {
    isPT: true,
    originalSymbol: symbol,
    shortName,
    baseToken,
    rawMaturityDate,
    maturityDate,
    formattedMaturity,
    chainSuffix,
  };
}

/**
 * Get a compact display name for a PT token
 * Returns just the short name (e.g., "PT-sUSDai") without the date
 */
export function getPTShortName(symbol: string): string {
  const parsed = parsePTToken(symbol);
  if (!parsed.isPT) return symbol;
  return parsed.shortName;
}

/**
 * Normalize a PT symbol for lookup by stripping the chain suffix
 * e.g., "PT-sUSDai-20NOV2025-(UNI)" -> "pt-susdai-20nov2025"
 * This allows bridged PT tokens to match their home network yield data
 */
export function normalizePTSymbolForLookup(symbol: string): string {
  const lower = symbol.toLowerCase();
  // Strip chain suffix like "-(uni)", "-(arb)", "-(eth)"
  return lower.replace(/-?\([a-z]+\)$/i, "");
}

/**
 * Get the maturity info string for a PT token
 * Returns formatted date or null if not a PT token
 */
export function getPTMaturityInfo(symbol: string): string | null {
  const parsed = parsePTToken(symbol);
  if (!parsed.isPT) return null;
  return parsed.formattedMaturity;
}

/**
 * Extract the base token from a PT token name
 * e.g., "PT-USDe-15JAN2026" -> "usde"
 */
export function extractPTBaseToken(symbol: string): string {
  const parsed = parsePTToken(symbol);
  if (!parsed.isPT) return "";
  return parsed.baseToken.toLowerCase();
}

// All chains where Pendle is deployed - we fetch from all to support bridged tokens
const ALL_PENDLE_CHAINS = Object.keys(PENDLE_CHAIN_MAP).map(Number);

/**
 * Hook to fetch PT token yields from Pendle
 *
 * Fetches from ALL Pendle-supported chains to support bridged PT tokens
 * that might have originated on any chain (indicated by suffixes like "(ETH)", "(ARB)").
 *
 * @param chainId - The chain ID (used for cache key, but we fetch from all chains)
 * @param tokens - Optional list of token addresses/symbols to filter by
 * @param enabled - Whether to enable the query
 */
export function usePendlePTYields(
  chainId?: number,
  tokens?: { address: Address; symbol: string }[],
  enabled = true
) {
  const query = useQuery({
    queryKey: ["pendle-pt-yields-all-chains"],
    queryFn: async () => {
      // Fetch from all Pendle-supported chains in parallel
      const allMarketsPromises = ALL_PENDLE_CHAINS.map(chain => fetchPendleMarkets(chain));
      const allMarketsResults = await Promise.all(allMarketsPromises);

      if (process.env.NODE_ENV === "development") {
        ALL_PENDLE_CHAINS.forEach((chain, i) => {
          console.log(`[Pendle] Chain ${chain}: ${allMarketsResults[i].length} markets`);
        });
      }

      const allMarkets = allMarketsResults.flat();

      const now = new Date();

      // Convert markets to PTYield format, deduplicating by symbol
      const seenSymbols = new Set<string>();
      const yields: PTYield[] = allMarkets
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
        .filter(y => {
          if (y.daysToExpiry <= 0) return false; // Filter expired
          // Deduplicate by symbol (keep first/highest liquidity)
          const key = y.symbol.toLowerCase();
          if (seenSymbols.has(key)) return false;
          seenSymbols.add(key);
          return true;
        });

      return yields;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // For backwards compatibility
  const isSupported = true;

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


  // Smart lookup function that handles bridged PT tokens with chain suffixes
  const findYield = useMemo(() => {
    return (address?: string, symbol?: string): PTYield | undefined => {
      // Try exact address match first
      if (address) {
        const byAddress = yieldsByAddress.get(address.toLowerCase());
        if (byAddress) return byAddress;
      }

      if (symbol) {
        // Debug: log lookup attempt
        if (isPTToken(symbol) && process.env.NODE_ENV === "development") {
          console.log(`[PT Yield Lookup] Searching for: ${symbol}`);
          console.log(`[PT Yield Lookup] Available symbols:`, query.data?.map(y => y.symbol).slice(0, 20));
        }

        // Try exact symbol match
        const bySymbol = yieldsBySymbol.get(symbol.toLowerCase());
        if (bySymbol) return bySymbol;

        // Try normalized symbol (strips chain suffix like "(UNI)", "(ETH)")
        const normalizedSymbol = normalizePTSymbolForLookup(symbol);
        if (normalizedSymbol !== symbol.toLowerCase()) {
          const byNormalized = yieldsBySymbol.get(normalizedSymbol);
          if (byNormalized) return byNormalized;
        }

        // Parse the input symbol to get components for flexible matching
        if (isPTToken(symbol)) {
          const parsed = parsePTToken(symbol);
          if (parsed.isPT) {
            const baseToken = parsed.baseToken.toLowerCase();
            const maturityDate = parsed.maturityDate;

            // Try to find a match by comparing parsed components
            const match = query.data?.find(y => {
              const yParsed = parsePTToken(y.symbol);
              if (!yParsed.isPT) return false;

              const yBaseToken = yParsed.baseToken.toLowerCase();

              // Match if base tokens are similar (one contains the other)
              const baseTokenMatch =
                baseToken.includes(yBaseToken) ||
                yBaseToken.includes(baseToken) ||
                baseToken === yBaseToken;

              if (!baseTokenMatch) return false;

              // If we have maturity dates, they should be close (within 2 days to handle timezone issues)
              if (maturityDate && yParsed.maturityDate) {
                const daysDiff = Math.abs(maturityDate.getTime() - yParsed.maturityDate.getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff <= 2;
              }

              // If no maturity date to compare, just match on base token
              return true;
            });
            if (match) return match;

            // Fallback: fuzzy match on underlying symbol
            const fuzzyMatch = query.data?.find(y =>
              y.underlyingSymbol.toLowerCase().includes(baseToken) ||
              y.symbol.toLowerCase().includes(baseToken)
            );
            if (fuzzyMatch) return fuzzyMatch;
          }
        }
      }

      return undefined;
    };
  }, [yieldsByAddress, yieldsBySymbol, query.data]);

  return {
    yields: query.data || [],
    yieldsByAddress,
    yieldsBySymbol,
    findYield,
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
