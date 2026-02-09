/**
 * Unified swap quote hook for all swap modals.
 *
 * This hook provides a consistent interface for fetching swap quotes
 * from multiple sources (1inch, Kyber, Pendle, CoW) and automatically
 * selects the best available option based on the tokens and chain.
 */

import { useMemo } from "react";
import { formatUnits, type Address } from "viem";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useCowQuote } from "~~/hooks/useCowQuote";
import {
  is1inchSupported,
  isKyberSupported,
  isPendleSupported,
  isPendleToken,
  getOneInchAdapterInfo,
  getKyberAdapterInfo,
  getPendleAdapterInfo,
} from "~~/utils/chainFeatures";
import type { SwapRouter } from "../SwapModalShell";
import type { SwapQuoteResult, SwapQuoteConfig, SwapQuoteHookResult } from "./swapConfigTypes";

// ============================================================================
// Helper Functions (extracted to reduce cognitive complexity)
// ============================================================================

interface PendleQuoteData {
  data?: {
    amountPtOut?: string;
    amountTokenOut?: string;
    priceImpact?: number;
  };
  transaction?: {
    data: string;
    to: string;
  };
}

interface OneInchQuoteData {
  dstAmount: string;
  tx?: { data: string; to?: string };
  srcUSD?: string;
  dstUSD?: string;
}

/**
 * Build quote result from Pendle data
 */
function buildPendleQuoteResult(
  pendleQuote: PendleQuoteData,
  dstDecimals: number
): { quote: SwapQuoteResult; amountOut: string; priceImpact: number | null } {
  const outAmount = pendleQuote.data?.amountPtOut || pendleQuote.data?.amountTokenOut || "0";
  const calculatedPriceImpact = pendleQuote.data?.priceImpact !== undefined
    ? Math.abs(pendleQuote.data.priceImpact * 100)
    : null;

  return {
    quote: {
      dstAmount: outAmount,
      tx: pendleQuote.transaction ? {
        data: pendleQuote.transaction.data,
        to: pendleQuote.transaction.to,
      } : undefined,
      priceImpact: calculatedPriceImpact,
      source: "pendle",
    },
    amountOut: formatUnits(BigInt(outAmount), dstDecimals),
    priceImpact: calculatedPriceImpact,
  };
}

/**
 * Build quote result from 1inch/Kyber data
 */
function buildOneInchQuoteResult(
  oneInchQuote: OneInchQuoteData,
  effectiveRouter: SwapRouter,
  dstDecimals: number
): { quote: SwapQuoteResult; amountOut: string; priceImpact: number | null } {
  let priceImpact: number | null = null;

  // Calculate price impact from USD values if available
  if (oneInchQuote.srcUSD && oneInchQuote.dstUSD) {
    const srcUsd = parseFloat(oneInchQuote.srcUSD);
    const dstUsd = parseFloat(oneInchQuote.dstUSD);
    if (srcUsd > 0) {
      priceImpact = Math.max(0, ((srcUsd - dstUsd) / srcUsd) * 100);
    }
  }

  return {
    quote: {
      dstAmount: oneInchQuote.dstAmount,
      tx: oneInchQuote.tx,
      srcUSD: oneInchQuote.srcUSD,
      dstUSD: oneInchQuote.dstUSD,
      source: effectiveRouter === "kyber" ? "kyber" : "1inch",
    },
    amountOut: formatUnits(BigInt(oneInchQuote.dstAmount), dstDecimals),
    priceImpact,
  };
}

/**
 * Calculate exchange rate from amounts
 */
function calculateExchangeRate(
  amount: string,
  amountOut: string,
  srcDecimals: number
): string | null {
  if (BigInt(amount || "0") <= 0n) return null;
  const srcAmount = parseFloat(formatUnits(BigInt(amount), srcDecimals));
  const dstAmount = parseFloat(amountOut);
  if (srcAmount > 0 && dstAmount > 0) {
    return (dstAmount / srcAmount).toFixed(6);
  }
  return null;
}

export interface UseSwapQuoteOptions {
  /** Configuration for the quote request */
  config: SwapQuoteConfig;
  /** Current user address (for CoW quotes) */
  userAddress?: Address;
  /** Source token decimals */
  srcDecimals: number;
  /** Destination token decimals */
  dstDecimals: number;
  /** Source token symbol (for Pendle detection) */
  srcSymbol?: string;
  /** Destination token symbol (for Pendle detection) */
  dstSymbol?: string;
}

/**
 * Unified hook for fetching swap quotes from multiple sources.
 *
 * Automatically handles:
 * - Router selection based on availability and token types
 * - Pendle routing for PT tokens
 * - Kyber/1inch fallback logic
 * - CoW quotes for limit orders
 */
export function useSwapQuote(options: UseSwapQuoteOptions): SwapQuoteHookResult {
  const {
    config,
    userAddress,
    srcDecimals,
    dstDecimals,
    srcSymbol = "",
    dstSymbol = "",
  } = options;

  const { chainId, swapRouter, srcToken, dstToken, amount, slippage, enabled, fromAddress, kind } = config;

  // Check router availability
  const oneInchAvailable = is1inchSupported(chainId);
  const kyberAvailable = isKyberSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);

  // Get adapter info
  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const kyberAdapter = getKyberAdapterInfo(chainId);
  const pendleAdapter = getPendleAdapterInfo(chainId);

  // Determine active adapter
  const activeAdapter = useMemo(() => {
    if (swapRouter === "kyber") return kyberAdapter;
    if (swapRouter === "pendle") return pendleAdapter;
    return oneInchAdapter;
  }, [swapRouter, kyberAdapter, pendleAdapter, oneInchAdapter]);

  // Check if either token is a Pendle PT token
  const isPTSwap = isPendleToken(srcSymbol) || isPendleToken(dstSymbol);

  // Determine effective router (auto-switch to Pendle for PT tokens)
  const effectiveRouter = useMemo((): SwapRouter => {
    if (isPTSwap && pendleAvailable) return "pendle";
    return swapRouter;
  }, [isPTSwap, pendleAvailable, swapRouter]);

  // 1inch/Kyber quote
  const kyberOrOneInchEnabled = enabled &&
    (effectiveRouter === "kyber" || effectiveRouter === "1inch") &&
    (kyberAvailable || oneInchAvailable) &&
    BigInt(amount || "0") > 0n &&
    !!activeAdapter;

  const { data: oneInchQuote, isLoading: isOneInchLoading, error: oneInchError } = use1inchQuote({
    chainId,
    src: srcToken,
    dst: dstToken,
    amount,
    from: fromAddress || activeAdapter?.address || ("" as Address),
    slippage,
    enabled: kyberOrOneInchEnabled,
    preferredRouter: effectiveRouter === "kyber" ? "kyber" : "1inch",
  });

  // Pendle quote
  const pendleEnabled = enabled &&
    effectiveRouter === "pendle" &&
    pendleAvailable &&
    BigInt(amount || "0") > 0n &&
    !!pendleAdapter;

  const { data: pendleQuote, isLoading: isPendleLoading, error: pendleError } = usePendleConvert({
    chainId,
    receiver: fromAddress || pendleAdapter?.address || ("" as Address),
    tokensIn: srcToken,
    tokensOut: dstToken,
    amountsIn: amount,
    slippage: slippage / 100, // Pendle uses decimal (0.01 = 1%)
    enabled: pendleEnabled,
  });

  // CoW quote (for limit orders)
  const cowEnabled = enabled &&
    kind === "buy" &&
    BigInt(amount || "0") > 0n &&
    !!userAddress;

  const { isLoading: isCowLoading, error: cowError } = useCowQuote({
    sellToken: srcToken,
    buyToken: dstToken,
    buyAmount: amount,
    kind: "buy",
    from: userAddress || "",
    enabled: cowEnabled,
  });

  // Combine results
  const result = useMemo((): SwapQuoteHookResult => {
    const isLoading = effectiveRouter === "pendle" ? isPendleLoading : isOneInchLoading;
    const error = effectiveRouter === "pendle" ? pendleError : oneInchError;

    // Build quote result using helper functions
    let quote: SwapQuoteResult | null = null;
    let amountOut = "0";
    let priceImpact: number | null = null;

    if (effectiveRouter === "pendle" && pendleQuote) {
      const pendleResult = buildPendleQuoteResult(pendleQuote, dstDecimals);
      quote = pendleResult.quote;
      amountOut = pendleResult.amountOut;
      priceImpact = pendleResult.priceImpact;
    } else if (oneInchQuote) {
      const oneInchResult = buildOneInchQuoteResult(oneInchQuote, effectiveRouter, dstDecimals);
      quote = oneInchResult.quote;
      amountOut = oneInchResult.amountOut;
      priceImpact = oneInchResult.priceImpact;
    }

    // Calculate exchange rate
    const exchangeRate = quote ? calculateExchangeRate(amount, amountOut, srcDecimals) : null;

    return {
      quote,
      isLoading: isLoading || (kind === "buy" && isCowLoading),
      error: error || (kind === "buy" ? cowError : null),
      amountOut,
      priceImpact,
      exchangeRate,
    };
  }, [
    effectiveRouter,
    isPendleLoading,
    isOneInchLoading,
    isCowLoading,
    pendleError,
    oneInchError,
    cowError,
    pendleQuote,
    oneInchQuote,
    // cowQuote is intentionally excluded - we only use isCowLoading and cowError
    amount,
    srcDecimals,
    dstDecimals,
    kind,
  ]);

  return result;
}

/**
 * Get the best available swap router for a given chain and token pair
 */
export function getBestSwapRouter(
  chainId: number,
  srcSymbol?: string,
  dstSymbol?: string
): SwapRouter {
  const pendleAvailable = isPendleSupported(chainId);
  const kyberAvailable = isKyberSupported(chainId);
  const oneInchAvailable = is1inchSupported(chainId);

  // Use Pendle for PT tokens
  const isPTSwapCandidate = (srcSymbol && isPendleToken(srcSymbol)) || (dstSymbol && isPendleToken(dstSymbol));
  if (isPTSwapCandidate && pendleAvailable) {
    return "pendle";
  }

  // Prefer Kyber, fallback to 1inch
  if (kyberAvailable) return "kyber";
  if (oneInchAvailable) return "1inch";
  if (pendleAvailable) return "pendle";

  return "1inch"; // Default fallback
}
