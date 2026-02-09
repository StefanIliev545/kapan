/**
 * Consolidated token price hook for consistent price fetching across the app.
 *
 * This module provides:
 * - useTokenPrice: Fetch price for a single token by symbol
 * - useTokenPrices: Fetch prices for multiple tokens in a single request
 * - Price formatting utilities
 *
 * All hooks use React Query for caching and automatic deduplication.
 */

import { useQuery, useQueries, keepPreviousData, type UseQueryResult } from "@tanstack/react-query";
import { formatUnits } from "viem";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TokenPriceResult {
  /** Price in USD (or 0 if not available) */
  price: number;
  /** Price as bigint with 8 decimals (for contract compatibility) */
  priceRaw: bigint;
  /** Whether the price is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching the price */
  isError: boolean;
  /** Whether the price was successfully fetched */
  isSuccess: boolean;
  /** Error message if any */
  error: string | null;
  /** Refetch the price */
  refetch: () => void;
}

export interface TokenPricesResult {
  /** Map of symbol (lowercase) -> price in USD */
  prices: Record<string, number>;
  /** Map of symbol (lowercase) -> price as bigint with 8 decimals */
  pricesRaw: Record<string, bigint>;
  /** Whether any price is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching prices */
  isError: boolean;
  /** Whether all prices were successfully fetched */
  isSuccess: boolean;
  /** Refetch all prices */
  refetch: () => void;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PRICE_STALE_TIME = 60_000; // 60 seconds — keep prices fresh for longer to avoid CoinGecko rate limits
const PRICE_CACHE_TIME = 300_000; // 5 minutes — preserve cached prices longer for keepPreviousData fallback

// Query key factory
export const tokenPriceKeys = {
  all: ["tokenPrice"] as const,
  single: (symbol: string) => [...tokenPriceKeys.all, "single", symbol.toLowerCase()] as const,
  batch: (symbols: string[]) => [
    ...tokenPriceKeys.all,
    "batch",
    symbols.map(s => s.toLowerCase()).sort().join(","),
  ] as const,
  byAddress: (chainId: number, addresses: string[]) => [
    ...tokenPriceKeys.all,
    "byAddress",
    chainId,
    addresses.map(a => a.toLowerCase()).sort().join(","),
  ] as const,
};

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

/**
 * Fetch price for a single token symbol from the API
 */
async function fetchTokenPrice(symbol: string): Promise<number> {
  if (!symbol?.trim()) return 0;

  const sp = new URLSearchParams();
  sp.set("symbol", symbol.trim());

  const res = await fetch(`/api/tokenPrice?${sp.toString()}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = (await res.json()) as { price?: number };
  return typeof json?.price === "number" ? json.price : 0;
}

/**
 * Fetch prices for multiple token symbols in a single request
 */
async function fetchTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const validSymbols = symbols.map(s => s.trim()).filter(Boolean);
  if (validSymbols.length === 0) return {};

  const sp = new URLSearchParams();
  sp.set("symbols", validSymbols.join(","));

  const res = await fetch(`/api/tokenPrice?${sp.toString()}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = (await res.json()) as { prices?: Record<string, number> };
  return json?.prices ?? {};
}

/**
 * Fetch prices for multiple tokens by contract address + chain ID.
 * Uses CoinGecko's token_price endpoint — no symbol ambiguity.
 * Returns Record<lowercaseAddress, usdPrice>.
 */
export async function fetchTokenPricesByAddress(
  chainId: number,
  addresses: string[],
): Promise<Record<string, number>> {
  const valid = addresses.map(a => a.trim()).filter(Boolean);
  if (valid.length === 0 || !chainId) return {};

  const sp = new URLSearchParams();
  sp.set("chainId", String(chainId));
  sp.set("addresses", valid.join(","));

  const res = await fetch(`/api/tokenPrice?${sp.toString()}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = (await res.json()) as { prices?: Record<string, number> };
  return json?.prices ?? {};
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to fetch the price of a single token by symbol.
 *
 * @param symbol - Token symbol (e.g., "ETH", "USDC")
 * @param options - Optional configuration
 * @returns TokenPriceResult with price data and status
 *
 * @example
 * ```tsx
 * const { price, isLoading } = useTokenPrice("ETH");
 * if (isLoading) return <Spinner />;
 * return <span>${price.toFixed(2)}</span>;
 * ```
 */
export function useTokenPrice(
  symbol: string,
  options?: { enabled?: boolean }
): TokenPriceResult {
  const enabled = options?.enabled !== false && !!symbol?.trim();

  const query = useQuery({
    queryKey: tokenPriceKeys.single(symbol),
    queryFn: () => fetchTokenPrice(symbol),
    enabled,
    staleTime: PRICE_STALE_TIME,
    gcTime: PRICE_CACHE_TIME,
    retry: 2,
    retryDelay: 1000,
  });

  const price = query.data ?? 0;

  return {
    price,
    priceRaw: priceToRaw(price),
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
    error: query.error?.message ?? null,
    refetch: () => { query.refetch(); },
  };
}

/**
 * Hook to fetch prices for multiple tokens in a single batch request.
 *
 * @param symbols - Array of token symbols
 * @param options - Optional configuration
 * @returns TokenPricesResult with prices map and status
 *
 * @example
 * ```tsx
 * const { prices, isLoading } = useTokenPrices(["ETH", "USDC", "DAI"]);
 * if (isLoading) return <Spinner />;
 * return <span>ETH: ${prices["eth"]?.toFixed(2)}</span>;
 * ```
 */
export function useTokenPrices(
  symbols: string[],
  options?: { enabled?: boolean }
): TokenPricesResult {
  const validSymbols = symbols.filter(s => s?.trim());
  const enabled = options?.enabled !== false && validSymbols.length > 0;

  const query = useQuery({
    queryKey: tokenPriceKeys.batch(validSymbols),
    queryFn: () => fetchTokenPrices(validSymbols),
    enabled,
    staleTime: PRICE_STALE_TIME,
    gcTime: PRICE_CACHE_TIME,
    // Keep showing previous prices while fetching new ones to avoid UI flicker
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay: 1000,
  });

  const prices = query.data ?? {};
  const pricesRaw: Record<string, bigint> = {};

  for (const [key, value] of Object.entries(prices)) {
    pricesRaw[key.toLowerCase()] = priceToRaw(value);
  }

  return {
    prices,
    pricesRaw,
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: () => { query.refetch(); },
  };
}

/**
 * Hook to fetch token prices by contract address + chain ID.
 * Uses CoinGecko's token_price endpoint — no symbol ambiguity, single API call.
 * Returns prices keyed by lowercase address.
 *
 * @param chainId - EVM chain ID (1, 42161, 8453, 10, 59144, 56)
 * @param addresses - Array of token contract addresses
 * @param options - Optional configuration
 */
export function useTokenPricesByAddress(
  chainId: number,
  addresses: string[],
  options?: { enabled?: boolean },
): TokenPricesResult {
  const validAddresses = addresses.filter(a => a?.trim());
  const enabled = options?.enabled !== false && validAddresses.length > 0 && chainId > 0;

  const query = useQuery({
    queryKey: tokenPriceKeys.byAddress(chainId, validAddresses),
    queryFn: () => fetchTokenPricesByAddress(chainId, validAddresses),
    enabled,
    staleTime: PRICE_STALE_TIME,
    gcTime: PRICE_CACHE_TIME,
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay: 1000,
  });

  const prices = query.data ?? {};
  const pricesRaw: Record<string, bigint> = {};

  for (const [key, value] of Object.entries(prices)) {
    pricesRaw[key.toLowerCase()] = priceToRaw(value);
  }

  return {
    prices,
    pricesRaw,
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: () => { query.refetch(); },
  };
}

/**
 * Hook to fetch prices for multiple tokens using parallel single requests.
 * Useful when you need individual loading states or when symbols come from different sources.
 *
 * @param symbols - Array of token symbols
 * @param options - Optional configuration
 * @returns Array of individual query results
 */
export function useTokenPricesParallel(
  symbols: string[],
  options?: { enabled?: boolean }
): UseQueryResult<number, Error>[] {
  const enabled = options?.enabled !== false;

  return useQueries({
    queries: symbols.map(symbol => ({
      queryKey: tokenPriceKeys.single(symbol),
      queryFn: () => fetchTokenPrice(symbol),
      enabled: enabled && !!symbol?.trim(),
      staleTime: PRICE_STALE_TIME,
      gcTime: PRICE_CACHE_TIME,
      retry: 2,
      retryDelay: 1000,
    })),
  });
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Convert a USD price to bigint with 8 decimals (for contract compatibility)
 */
export function priceToRaw(price: number): bigint {
  if (!price || !isFinite(price) || price <= 0) return BigInt(0);
  return BigInt(Math.round(price * 1e8));
}

/**
 * Convert a raw price (8 decimals) to USD number
 */
export function rawToPrice(raw: bigint): number {
  if (!raw || raw === BigInt(0)) return 0;
  return Number(formatUnits(raw, 8));
}

/**
 * Calculate USD value from a token amount and price
 *
 * @param amount - Token amount (human readable)
 * @param price - Price in USD
 * @returns USD value
 */
export function toUsdValue(amount: number, price: number): number {
  if (!isFinite(amount) || !isFinite(price) || amount <= 0 || price <= 0) return 0;
  return amount * price;
}

/**
 * Calculate USD value from raw token amount and raw price
 *
 * @param amountRaw - Raw token amount (with token decimals)
 * @param decimals - Token decimals
 * @param priceRaw - Raw price (8 decimals)
 * @returns USD value
 */
export function toUsdValueFromRaw(amountRaw: bigint, decimals: number, priceRaw: bigint): number {
  if (!amountRaw || !priceRaw || amountRaw === BigInt(0) || priceRaw === BigInt(0)) return 0;
  return Number(formatUnits(amountRaw, decimals)) * Number(formatUnits(priceRaw, 8));
}

/**
 * Format a USD value for display
 *
 * @param value - USD value
 * @param options - Formatting options
 * @returns Formatted string (e.g., "$1,234.56", "$1.23K", "$1.23M")
 */
export function formatUsdValue(
  value: number,
  options?: {
    compact?: boolean;
    showSymbol?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const {
    compact = true,
    showSymbol = true,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options ?? {};

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const prefix = showSymbol ? "$" : "";

  if (absValue === 0) {
    return `${prefix}0.00`;
  }

  if (absValue < 0.01) {
    return `<${prefix}0.01`;
  }

  if (compact) {
    if (absValue >= 1_000_000) {
      const millions = absValue / 1_000_000;
      const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(millions);
      return `${sign}${prefix}${formatted}M`;
    }

    if (absValue >= 1_000) {
      const thousands = absValue / 1_000;
      const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(thousands);
      return `${sign}${prefix}${formatted}K`;
    }
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return `${sign}${prefix}${formatter.format(absValue)}`;
}

/**
 * Format a token amount for display
 *
 * @param amount - Token amount (human readable or raw)
 * @param decimals - Token decimals (if amount is raw)
 * @param maxDecimals - Maximum decimal places to show
 * @returns Formatted string
 */
export function formatTokenAmount(
  amount: number | bigint,
  decimals?: number,
  maxDecimals?: number
): string {
  let num: number;

  if (typeof amount === "bigint") {
    if (!decimals) decimals = 18;
    num = parseFloat(formatUnits(amount, decimals));
  } else {
    num = amount;
  }

  if (num === 0) return "0";

  const max = maxDecimals ?? (num >= 1000 ? 2 : num >= 1 ? 4 : 6);

  if (num >= 1000) {
    return num.toLocaleString(undefined, { maximumFractionDigits: max });
  }
  if (num >= 1) {
    return num.toLocaleString(undefined, { maximumFractionDigits: max });
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: max });
}
