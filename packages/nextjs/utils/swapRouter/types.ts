/**
 * Shared SwapRouter Types
 *
 * Unified types for DEX integrations: 1inch, Pendle, and CoW Protocol.
 */

import { Address, Hex } from "viem";

/**
 * Supported swap router types
 */
export type SwapRouterType = "1inch" | "pendle" | "cow";

/**
 * Normalized quote response that can come from any DEX
 */
export interface NormalizedQuote {
  /** Source of the quote */
  source: SwapRouterType;
  /** Token being sold */
  sellToken: Address;
  /** Token being bought */
  buyToken: Address;
  /** Amount being sold (raw) */
  sellAmount: bigint;
  /** Amount being bought (raw) */
  buyAmount: bigint;
  /** Transaction data for execution (if available) */
  txData?: Hex;
  /** USD value of sell amount (if available) */
  sellUSD?: number;
  /** USD value of buy amount (if available) */
  buyUSD?: number;
  /** Price impact as percentage (if available) */
  priceImpact?: number;
  /** Gas estimate (if available) */
  estimatedGas?: number;
  /** Original raw response for debugging */
  raw?: unknown;
}

/**
 * Input for fetching a swap quote
 */
export interface SwapQuoteParams {
  /** Chain ID */
  chainId: number;
  /** Token to sell */
  sellToken: Address;
  /** Token to buy */
  buyToken: Address;
  /** Amount to swap (raw bigint as string) */
  amount: string;
  /** Address that will execute the swap (adapter address) */
  from?: Address;
  /** Slippage tolerance (e.g., 1 = 1%) */
  slippage?: number;
  /** Order kind for CoW ("sell" = exact sell, "buy" = exact buy) */
  kind?: "sell" | "buy";
}

/**
 * Swap router adapter info
 */
export interface SwapAdapterInfo {
  /** Adapter contract address */
  address: Address;
  /** Router type */
  type: SwapRouterType;
  /** Whether the adapter is available on this chain */
  available: boolean;
}

/**
 * Result of finding the best quote across all routers
 */
export interface BestQuoteResult {
  /** The best quote found */
  quote: NormalizedQuote | null;
  /** All quotes fetched (for comparison) */
  allQuotes: NormalizedQuote[];
  /** Whether any quote is loading */
  isLoading: boolean;
  /** Error if all quotes failed */
  error?: Error;
}

/**
 * Configuration for swap router availability
 */
export interface SwapRouterConfig {
  /** Is 1inch available on this chain */
  oneInchAvailable: boolean;
  /** Is Pendle available on this chain */
  pendleAvailable: boolean;
  /** Is CoW Protocol available on this chain */
  cowAvailable: boolean;
  /** 1inch adapter info */
  oneInchAdapter?: SwapAdapterInfo;
  /** Pendle adapter info */
  pendleAdapter?: SwapAdapterInfo;
  /** Default router for this chain */
  defaultRouter: SwapRouterType;
}

/**
 * Exchange rate info derived from quotes
 */
export interface ExchangeRateInfo {
  /** Exchange rate as a formatted string */
  rate: string;
  /** Required amount of input token for desired output */
  requiredInput: bigint;
  /** Formatted required input */
  requiredInputFormatted: string;
  /** Price impact percentage */
  priceImpact?: number;
}
