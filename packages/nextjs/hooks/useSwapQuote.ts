/**
 * Unified Swap Quote Hook
 *
 * A single hook that can fetch quotes from 1inch, Pendle, or CoW Protocol
 * and normalize them to a unified format.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Address, formatUnits, parseUnits } from "viem";
import { useDebounceValue } from "usehooks-ts";

import { use1inchQuote } from "./use1inchQuote";
import { use1inchQuoteOnly } from "./use1inchQuoteOnly";
import { usePendleConvert } from "./usePendleConvert";
import { useCowQuote } from "./useCowQuote";

import {
  SwapRouterType,
  NormalizedQuote,
  getSwapRouterConfig,
  getSwapAdapterAddress,
  normalize1inchSwap,
  normalize1inchQuote,
  normalizePendleQuote,
  normalizeCowQuote,
  findBestQuote,
  calculateExchangeRate,
  calculateRequiredInput,
} from "~~/utils/swapRouter";

import { getEffectiveChainId } from "~~/utils/forkChain";

export interface UseSwapQuoteParams {
  /** Chain ID */
  chainId: number;
  /** Token to sell */
  sellToken: Address;
  /** Token to buy */
  buyToken: Address;
  /** Amount to swap (raw string) */
  amount: string;
  /** Slippage tolerance in percentage (e.g., 1 = 1%) */
  slippage?: number;
  /** Preferred router ("1inch" | "pendle" | "cow") */
  router?: SwapRouterType;
  /** Whether to fetch with tx data (needed for execution) */
  includeTxData?: boolean;
  /** Address for tx data (adapter address) - required if includeTxData is true */
  from?: Address;
  /** CoW order kind ("sell" = exact sell, "buy" = exact buy) */
  cowKind?: "sell" | "buy";
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseSwapQuoteResult {
  /** Normalized quote from the selected router */
  quote: NormalizedQuote | null;
  /** Whether the quote is loading */
  isLoading: boolean;
  /** Error if the quote failed */
  error: Error | null;
  /** The router that provided this quote */
  source: SwapRouterType | null;
  /** Raw response for debugging */
  raw: unknown;
}

/**
 * Unified hook for fetching swap quotes from different DEXs.
 *
 * @example
 * ```tsx
 * const { quote, isLoading, error } = useSwapQuote({
 *   chainId: 8453,
 *   sellToken: WETH,
 *   buyToken: USDC,
 *   amount: "1000000000000000000", // 1 ETH
 *   router: "1inch",
 *   slippage: 1,
 *   includeTxData: true,
 *   from: oneInchAdapterAddress,
 * });
 *
 * if (quote) {
 *   console.log(`Output: ${quote.buyAmount}`);
 * }
 * ```
 */
export function useSwapQuote({
  chainId,
  sellToken,
  buyToken,
  amount,
  slippage = 1,
  router = "1inch",
  includeTxData = false,
  from,
  cowKind = "sell",
  enabled = true,
}: UseSwapQuoteParams): UseSwapQuoteResult {
  const [debouncedAmount] = useDebounceValue(amount, 500);

  const config = getSwapRouterConfig(chainId);
  const effectiveChainId = getEffectiveChainId(chainId);

  // Determine which router to use based on availability
  const effectiveRouter = useMemo(() => {
    if (router === "1inch" && config.oneInchAvailable) return "1inch";
    if (router === "pendle" && config.pendleAvailable) return "pendle";
    if (router === "cow" && config.cowAvailable) return "cow";

    // Fall back to default
    return config.defaultRouter;
  }, [router, config]);

  // Get adapter address for the selected router
  const adapterAddress = useMemo(() => {
    if (from) return from;
    return getSwapAdapterAddress(chainId, effectiveRouter);
  }, [chainId, effectiveRouter, from]);

  // Check if we have valid params
  const isValidParams = useMemo(() => {
    const hasAmount = BigInt(debouncedAmount || "0") > 0n;
    const hasTokens = !!sellToken && !!buyToken;
    const hasAdapter = effectiveRouter === "cow" || !!adapterAddress;
    return enabled && hasAmount && hasTokens && hasAdapter;
  }, [enabled, debouncedAmount, sellToken, buyToken, adapterAddress, effectiveRouter]);

  // 1inch with tx data
  const oneInchSwapResult = use1inchQuote({
    chainId: effectiveChainId,
    src: sellToken,
    dst: buyToken,
    amount: debouncedAmount,
    from: adapterAddress || ("" as Address),
    slippage,
    enabled: isValidParams && effectiveRouter === "1inch" && includeTxData && !!adapterAddress,
  });

  // 1inch quote only (no tx data)
  const oneInchQuoteResult = use1inchQuoteOnly({
    chainId: effectiveChainId,
    src: sellToken,
    dst: buyToken,
    amount: debouncedAmount,
    enabled: isValidParams && effectiveRouter === "1inch" && !includeTxData,
  });

  // Pendle
  const pendleResult = usePendleConvert({
    chainId: effectiveChainId,
    receiver: adapterAddress || ("" as Address),
    tokensIn: sellToken,
    tokensOut: buyToken,
    amountsIn: debouncedAmount,
    slippage: slippage / 100, // Pendle uses decimal (0.01 = 1%)
    enabled: isValidParams && effectiveRouter === "pendle" && !!adapterAddress,
  });

  // CoW
  const cowResult = useCowQuote({
    sellToken,
    buyToken,
    sellAmount: cowKind === "sell" ? debouncedAmount : undefined,
    buyAmount: cowKind === "buy" ? debouncedAmount : undefined,
    kind: cowKind,
    from: adapterAddress || "",
    enabled: isValidParams && effectiveRouter === "cow",
  });

  // Normalize and return the result based on selected router
  const result = useMemo((): UseSwapQuoteResult => {
    const sellAmountBigInt = BigInt(debouncedAmount || "0");
    const router = effectiveRouter; // Capture to avoid narrowing issues

    // 1inch router
    if (router === "1inch") {
      if (includeTxData && oneInchSwapResult.data) {
        return {
          quote: normalize1inchSwap(oneInchSwapResult.data, sellToken, buyToken),
          isLoading: oneInchSwapResult.isLoading,
          error: oneInchSwapResult.error,
          source: "1inch",
          raw: oneInchSwapResult.data,
        };
      }
      if (!includeTxData && oneInchQuoteResult.data) {
        return {
          quote: normalize1inchQuote(oneInchQuoteResult.data, sellToken, buyToken, sellAmountBigInt),
          isLoading: oneInchQuoteResult.isLoading,
          error: oneInchQuoteResult.error,
          source: "1inch",
          raw: oneInchQuoteResult.data,
        };
      }
      // Loading or error state for 1inch
      return {
        quote: null,
        isLoading: includeTxData ? oneInchSwapResult.isLoading : oneInchQuoteResult.isLoading,
        error: (includeTxData ? oneInchSwapResult.error : oneInchQuoteResult.error) || null,
        source: null,
        raw: null,
      };
    }

    // Pendle router
    if (router === "pendle") {
      if (pendleResult.data) {
        return {
          quote: normalizePendleQuote(pendleResult.data, sellToken, buyToken, sellAmountBigInt),
          isLoading: pendleResult.isLoading,
          error: pendleResult.error,
          source: "pendle",
          raw: pendleResult.data,
        };
      }
      // Loading or error state for Pendle
      return {
        quote: null,
        isLoading: pendleResult.isLoading,
        error: pendleResult.error || null,
        source: null,
        raw: null,
      };
    }

    // CoW router
    if (router === "cow") {
      if (cowResult.data) {
        return {
          quote: normalizeCowQuote(cowResult.data, cowKind),
          isLoading: cowResult.isLoading,
          error: null,
          source: "cow",
          raw: cowResult.data,
        };
      }
      // Loading state for CoW
      return {
        quote: null,
        isLoading: cowResult.isLoading,
        error: null,
        source: null,
        raw: null,
      };
    }

    // Fallback (should not be reached)
    return {
      quote: null,
      isLoading: false,
      error: null,
      source: null,
      raw: null,
    };
  }, [
    effectiveRouter,
    includeTxData,
    debouncedAmount,
    sellToken,
    buyToken,
    oneInchSwapResult,
    oneInchQuoteResult,
    pendleResult,
    cowResult,
    cowKind,
  ]);

  return result;
}

/**
 * Hook to get quotes from all available routers and find the best one.
 */
export interface UseMultiRouterQuoteParams {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  amount: string;
  slippage?: number;
  from?: Address;
  enabled?: boolean;
}

export interface UseMultiRouterQuoteResult {
  /** The best quote across all routers */
  bestQuote: NormalizedQuote | null;
  /** All quotes from different routers */
  allQuotes: NormalizedQuote[];
  /** Whether any quote is loading */
  isLoading: boolean;
  /** The router that provided the best quote */
  bestSource: SwapRouterType | null;
}

/**
 * Hook to fetch quotes from all available routers and find the best one.
 *
 * @example
 * ```tsx
 * const { bestQuote, allQuotes, bestSource } = useMultiRouterQuote({
 *   chainId: 8453,
 *   sellToken: WETH,
 *   buyToken: USDC,
 *   amount: "1000000000000000000",
 * });
 *
 * console.log(`Best quote from ${bestSource}: ${bestQuote?.buyAmount}`);
 * ```
 */
export function useMultiRouterQuote({
  chainId,
  sellToken,
  buyToken,
  amount,
  slippage = 1,
  from,
  enabled = true,
}: UseMultiRouterQuoteParams): UseMultiRouterQuoteResult {
  const config = getSwapRouterConfig(chainId);

  // Fetch from 1inch
  const oneInchQuote = useSwapQuote({
    chainId,
    sellToken,
    buyToken,
    amount,
    slippage,
    router: "1inch",
    includeTxData: !!from,
    from,
    enabled: enabled && config.oneInchAvailable,
  });

  // Fetch from Pendle
  const pendleQuote = useSwapQuote({
    chainId,
    sellToken,
    buyToken,
    amount,
    slippage,
    router: "pendle",
    includeTxData: true,
    from,
    enabled: enabled && config.pendleAvailable,
  });

  // Fetch from CoW
  const cowQuote = useSwapQuote({
    chainId,
    sellToken,
    buyToken,
    amount,
    slippage,
    router: "cow",
    cowKind: "sell",
    enabled: enabled && config.cowAvailable,
  });

  // Combine results
  const result = useMemo((): UseMultiRouterQuoteResult => {
    const allQuotes: NormalizedQuote[] = [];

    if (oneInchQuote.quote) allQuotes.push(oneInchQuote.quote);
    if (pendleQuote.quote) allQuotes.push(pendleQuote.quote);
    if (cowQuote.quote) allQuotes.push(cowQuote.quote);

    const bestQuote = findBestQuote(allQuotes);

    return {
      bestQuote,
      allQuotes,
      isLoading: oneInchQuote.isLoading || pendleQuote.isLoading || cowQuote.isLoading,
      bestSource: bestQuote?.source || null,
    };
  }, [oneInchQuote.quote, pendleQuote.quote, cowQuote.quote, oneInchQuote.isLoading, pendleQuote.isLoading, cowQuote.isLoading]);

  return result;
}

/**
 * Hook to calculate required input for a desired output amount.
 * Fetches a unit quote and calculates the required input.
 */
export interface UseRequiredInputParams {
  chainId: number;
  /** Token to sell (input) */
  sellToken: Address;
  /** Token to buy (output) */
  buyToken: Address;
  /** Desired output amount (raw) */
  desiredOutput: bigint;
  /** Decimals of the sell token */
  sellDecimals: number;
  /** Decimals of the buy token */
  buyDecimals: number;
  /** Slippage buffer in percentage */
  slippage?: number;
  /** Preferred router */
  router?: SwapRouterType;
  /** Adapter address for tx data */
  from?: Address;
  enabled?: boolean;
}

export interface UseRequiredInputResult {
  /** Required input amount (raw) */
  requiredInput: bigint;
  /** Required input formatted */
  requiredInputFormatted: string;
  /** Exchange rate (buy per 1 sell) */
  exchangeRate: string;
  /** Unit quote used for calculation */
  unitQuote: NormalizedQuote | null;
  /** Whether the quote is loading */
  isLoading: boolean;
  /** Error if failed */
  error: Error | null;
}

/**
 * Hook to calculate how much input is required for a desired output amount.
 *
 * @example
 * ```tsx
 * const { requiredInput, exchangeRate, isLoading } = useRequiredInput({
 *   chainId: 8453,
 *   sellToken: WETH,
 *   buyToken: USDC,
 *   desiredOutput: parseUnits("1000", 6), // 1000 USDC
 *   sellDecimals: 18,
 *   buyDecimals: 6,
 *   slippage: 1,
 * });
 *
 * // requiredInput is how much WETH needed to get ~1000 USDC
 * ```
 */
export function useRequiredInput({
  chainId,
  sellToken,
  buyToken,
  desiredOutput,
  sellDecimals,
  buyDecimals,
  slippage = 0,
  router,
  from,
  enabled = true,
}: UseRequiredInputParams): UseRequiredInputResult {
  // Fetch unit quote (1 sellToken -> X buyToken)
  const unitAmount = parseUnits("1", sellDecimals).toString();

  const { quote: unitQuote, isLoading, error } = useSwapQuote({
    chainId,
    sellToken,
    buyToken,
    amount: unitAmount,
    router,
    includeTxData: false, // Don't need tx data for unit quote
    from,
    enabled: enabled && desiredOutput > 0n,
  });

  const result = useMemo((): UseRequiredInputResult => {
    if (!unitQuote) {
      return {
        requiredInput: 0n,
        requiredInputFormatted: "0",
        exchangeRate: "0",
        unitQuote: null,
        isLoading,
        error,
      };
    }

    const slippageBps = BigInt(Math.round(slippage * 100));
    const required = calculateRequiredInput(
      desiredOutput,
      unitQuote,
      sellDecimals,
      buyDecimals,
      slippageBps
    );

    const rate = calculateExchangeRate(unitQuote, sellDecimals, buyDecimals);

    return {
      requiredInput: required,
      requiredInputFormatted: formatUnits(required, sellDecimals),
      exchangeRate: rate.toFixed(6),
      unitQuote,
      isLoading,
      error,
    };
  }, [unitQuote, desiredOutput, sellDecimals, buyDecimals, slippage, isLoading, error]);

  return result;
}
