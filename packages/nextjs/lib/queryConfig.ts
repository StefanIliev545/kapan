/**
 * Consolidated query configuration utilities for TanStack Query
 *
 * This module provides standardized query configurations to reduce boilerplate
 * and ensure consistent caching behavior across the application.
 */
import { UseQueryOptions } from "@tanstack/react-query";

/**
 * Standard timing constants for query configurations
 */
export const QueryTiming = {
  /** Real-time data that needs frequent updates (quotes, prices) */
  REALTIME_STALE: 10_000, // 10 seconds
  REALTIME_REFETCH: 10_000, // 10 seconds

  /** Fast-updating data (balances, positions) */
  FAST_STALE: 30_000, // 30 seconds
  FAST_REFETCH: 30_000, // 30 seconds

  /** Medium-frequency data (market data) */
  MEDIUM_STALE: 60_000, // 1 minute
  MEDIUM_REFETCH: 60_000, // 1 minute

  /** Slow-updating data (market lists, protocol configs) */
  SLOW_STALE: 5 * 60_000, // 5 minutes
  SLOW_REFETCH: 5 * 60_000, // 5 minutes

  /** Static data that rarely changes */
  STATIC_STALE: 30 * 60_000, // 30 minutes
  STATIC_GC: 60 * 60_000, // 1 hour
} as const;

/**
 * Debounce timing for user input
 */
export const DebounceTiming = {
  /** Fast debounce for quick feedback */
  FAST: 300,
  /** Standard debounce for most inputs */
  STANDARD: 500,
  /** Slow debounce for expensive operations */
  SLOW: 800,
} as const;

/**
 * Base query options for different data types
 */
export const queryOptions = {
  /**
   * For real-time quote data (1inch, CoW, Pendle quotes)
   * - Short stale time for fresh prices
   * - Regular polling for updates
   * - No retry on failure (transient quote data)
   */
  quote: {
    staleTime: QueryTiming.REALTIME_STALE,
    refetchInterval: QueryTiming.REALTIME_REFETCH,
    refetchOnWindowFocus: false,
    retry: false,
  } as const,

  /**
   * For balance and position data
   * - Medium stale time (30s)
   * - Regular polling
   * - Limited retries
   */
  balance: {
    staleTime: QueryTiming.FAST_STALE,
    refetchInterval: QueryTiming.FAST_REFETCH,
    refetchOnWindowFocus: false,
    retry: 1,
  } as const,

  /**
   * For market data (Morpho markets, Pendle yields)
   * - Longer stale time (5 min)
   * - Less frequent polling
   */
  market: {
    staleTime: QueryTiming.SLOW_STALE,
    refetchInterval: QueryTiming.SLOW_REFETCH,
    refetchOnWindowFocus: false,
    retry: 2,
  } as const,

  /**
   * For order status monitoring
   * - Short stale time for responsive updates
   * - Conditional polling based on order state
   */
  orderStatus: {
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    retry: 2,
  } as const,

  /**
   * For static configuration data
   * - Long stale time
   * - No automatic polling
   */
  static: {
    staleTime: QueryTiming.STATIC_STALE,
    gcTime: QueryTiming.STATIC_GC,
    refetchOnWindowFocus: false,
    refetchInterval: false as const,
    retry: 3,
  } as const,
} as const;

/**
 * Query key factory functions for consistent key generation
 * These ensure type-safe and consistent query keys across the application
 */
export const queryKeys = {
  // DEX Quotes
  oneInchQuote: (chainId: number, src: string, dst: string, amount: string, from?: string, slippage?: number, preferredRouter?: string) =>
    ["1inch-quote", chainId, src?.toLowerCase() ?? "", dst?.toLowerCase() ?? "", amount, from?.toLowerCase(), slippage, preferredRouter] as const,

  oneInchQuoteOnly: (chainId: number, src: string, dst: string, amount: string) =>
    ["1inch-quote-only", chainId, src?.toLowerCase() ?? "", dst?.toLowerCase() ?? "", amount] as const,

  cowQuote: (chainId: number, sellToken: string, buyToken: string, amount: string, kind: string, from: string) =>
    ["cow-quote", chainId, sellToken?.toLowerCase() ?? "", buyToken?.toLowerCase() ?? "", amount, kind, from?.toLowerCase() ?? ""] as const,

  pendleConvert: (
    chainId: number,
    receiver: string,
    tokensIn: string | string[],
    tokensOut: string | string[],
    amountsIn: string | string[],
    slippage?: number,
  ) =>
    [
      "pendle-convert",
      chainId,
      receiver?.toLowerCase() ?? "",
      JSON.stringify(tokensIn),
      JSON.stringify(tokensOut),
      JSON.stringify(amountsIn),
      slippage,
    ] as const,

  // Protocol Data
  morphoMarkets: (chainId: number, search?: string) =>
    ["morpho-markets", chainId, search?.trim() || undefined] as const,

  morphoMarketsSupport: (chainId: number) => ["morpho-markets-support", chainId] as const,

  morphoPositions: (chainId: number, userAddress: string) =>
    ["morpho-positions", chainId, userAddress?.toLowerCase() ?? ""] as const,

  pendleYields: (chainId: number) => ["pendle-pt-yields", chainId] as const,

  // Balances
  walletTokenBalances: (network: string, chainId: number | undefined, address: string, tokens: string[]) =>
    ["wallet-token-balances", network, chainId, address?.toLowerCase() ?? "", (tokens ?? []).map(t => t?.toLowerCase() ?? "")] as const,

  // Orders
  cowOrderStatus: (orderHash: string, chainId: number) => ["cow-order-status", orderHash, chainId] as const,

  cowOrdersStatus: (orderHashes: string[], chainId: number) =>
    ["cow-orders-status", orderHashes.join(","), chainId] as const,

  cowOrders: () => ["cow-orders"] as const,
} as const;

/**
 * Helper to create a query configuration with custom overrides
 */
export function createQueryConfig<TData, TError = Error>(
  baseOptions: (typeof queryOptions)[keyof typeof queryOptions],
  overrides?: Partial<UseQueryOptions<TData, TError>>,
): Partial<UseQueryOptions<TData, TError>> {
  return {
    ...baseOptions,
    ...overrides,
  };
}

/**
 * Type-safe helper to check if a query should be enabled
 * Combines multiple conditions for cleaner code
 */
export function isQueryEnabled(...conditions: (boolean | undefined | null | string | number)[]): boolean {
  return conditions.every(condition => {
    if (typeof condition === "boolean") return condition;
    if (typeof condition === "string") return condition.length > 0;
    if (typeof condition === "number") return condition > 0;
    return condition != null;
  });
}

/**
 * Helper for amount validation in query enabled checks
 */
export function hasValidAmount(amount: string | undefined | null): boolean {
  if (!amount) return false;
  try {
    return BigInt(amount) > 0n;
  } catch {
    return false;
  }
}
