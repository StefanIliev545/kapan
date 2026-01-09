/**
 * Quote Normalizers
 *
 * Transform raw responses from different DEXs into a unified NormalizedQuote format.
 */

import { Address } from "viem";
import { NormalizedQuote, SwapRouterType } from "./types";
import { OneInchQuoteResponse, OneInchSwapResponse } from "../1inch";
import { PendleConvertResponse } from "../pendle";
import { CowQuoteResponse } from "~~/hooks/useCowQuote";

/**
 * Normalize a 1inch swap response (with tx data)
 */
export function normalize1inchSwap(
  response: OneInchSwapResponse,
  sellToken: Address,
  buyToken: Address
): NormalizedQuote {
  return {
    source: "1inch",
    sellToken,
    buyToken,
    sellAmount: BigInt(response.srcAmount || response.dstAmount), // srcAmount may not always be present
    buyAmount: BigInt(response.dstAmount),
    txData: response.tx.data,
    sellUSD: response.srcUSD ? parseFloat(response.srcUSD) : undefined,
    buyUSD: response.dstUSD ? parseFloat(response.dstUSD) : undefined,
    estimatedGas: response.gas,
    raw: response,
  };
}

/**
 * Normalize a 1inch quote response (no tx data)
 */
export function normalize1inchQuote(
  response: OneInchQuoteResponse,
  sellToken: Address,
  buyToken: Address,
  sellAmount: bigint
): NormalizedQuote {
  return {
    source: "1inch",
    sellToken,
    buyToken,
    sellAmount,
    buyAmount: BigInt(response.dstAmount),
    sellUSD: response.srcUSD ? parseFloat(response.srcUSD) : undefined,
    buyUSD: response.dstUSD ? parseFloat(response.dstUSD) : undefined,
    estimatedGas: response.gas,
    raw: response,
  };
}

/**
 * Normalize a Pendle convert response
 */
export function normalizePendleQuote(
  response: PendleConvertResponse,
  sellToken: Address,
  buyToken: Address,
  sellAmount: bigint
): NormalizedQuote {
  const outAmount = response.data.amountPtOut || response.data.amountTokenOut || "0";

  return {
    source: "pendle",
    sellToken,
    buyToken,
    sellAmount,
    buyAmount: BigInt(outAmount),
    txData: response.transaction.data,
    priceImpact: response.data.priceImpact !== undefined
      ? Math.abs(response.data.priceImpact * 100) // Convert to percentage
      : undefined,
    raw: response,
  };
}

/**
 * Normalize a CoW Protocol quote response
 */
export function normalizeCowQuote(
  response: CowQuoteResponse,
  kind: "sell" | "buy" = "sell"
): NormalizedQuote {
  return {
    source: "cow",
    sellToken: response.quote.sellToken as Address,
    buyToken: response.quote.buyToken as Address,
    sellAmount: BigInt(response.quote.sellAmount),
    buyAmount: BigInt(response.quote.buyAmount),
    raw: response,
  };
}

/**
 * Calculate price impact from USD values
 */
export function calculatePriceImpactFromUSD(
  sellUSD: number | undefined,
  buyUSD: number | undefined
): number | undefined {
  if (sellUSD === undefined || buyUSD === undefined || sellUSD === 0) {
    return undefined;
  }
  return Math.max(0, ((sellUSD - buyUSD) / sellUSD) * 100);
}

/**
 * Find the best quote from multiple sources (highest output)
 */
export function findBestQuote(quotes: NormalizedQuote[]): NormalizedQuote | null {
  if (quotes.length === 0) return null;

  return quotes.reduce((best, current) =>
    current.buyAmount > best.buyAmount ? current : best
  );
}

/**
 * Calculate exchange rate from a quote
 * Returns how much buyToken you get per 1 sellToken
 */
export function calculateExchangeRate(
  quote: NormalizedQuote,
  sellDecimals: number,
  buyDecimals: number
): number {
  if (quote.sellAmount === 0n) return 0;

  const sellFloat = Number(quote.sellAmount) / 10 ** sellDecimals;
  const buyFloat = Number(quote.buyAmount) / 10 ** buyDecimals;

  return buyFloat / sellFloat;
}

/**
 * Calculate required input for a desired output amount
 * Based on a unit quote (1 token -> X tokens)
 */
export function calculateRequiredInput(
  desiredOutput: bigint,
  unitQuote: NormalizedQuote,
  sellDecimals: number,
  buyDecimals: number,
  slippageBps = 0n
): bigint {
  if (unitQuote.buyAmount === 0n) return 0n;

  // unitQuote: 1 sellToken -> buyAmount buyToken
  // required = desiredOutput / (buyAmount / 1 sellToken)
  //          = desiredOutput * 10^sellDecimals / buyAmount

  const unitSell = 10n ** BigInt(sellDecimals);
  const base = (desiredOutput * unitSell) / unitQuote.buyAmount;

  // Apply slippage buffer
  if (slippageBps > 0n) {
    return (base * (10000n + slippageBps)) / 10000n;
  }

  return base;
}
