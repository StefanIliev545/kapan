"use client";

import { useMemo } from "react";
import { formatTokenAmount } from "~~/utils/protocols";

/**
 * Common token information type for close position modals
 */
export interface ClosePositionToken {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

/**
 * Generic quote interface that both EVM and Starknet quotes can conform to
 */
export interface ClosePositionQuote {
  sellAmount: bigint;
  buyAmount: bigint;
  sellAmountInUsd?: number;
  buyAmountInUsd?: number;
  sellTokenPriceInUsd?: number;
}

/**
 * Result of the remainder calculation
 */
export interface RemainderInfo {
  /** Raw remainder amount in token units */
  remainder: bigint;
  /** Formatted remainder amount */
  remainderFormatted: string;
  /** USD value of remainder (if price available) */
  remainderUsd?: number;
}

/**
 * Props for useClosePositionQuote hook
 */
export interface UseClosePositionQuoteProps {
  /** The selected quote from the swap aggregator */
  quote: ClosePositionQuote | null;
  /** Total collateral balance available */
  collateralBalance: bigint;
  /** Decimals of the collateral token */
  collateralDecimals: number;
}

/**
 * Hook to calculate remainder info after a close position swap.
 *
 * When closing a position, we sell collateral to get debt tokens.
 * This calculates how much collateral remains after the swap.
 *
 * @example
 * ```tsx
 * const { remainderInfo } = useClosePositionQuote({
 *   quote: selectedQuote,
 *   collateralBalance,
 *   collateralDecimals: collateral.decimals,
 * });
 *
 * if (remainderInfo) {
 *   console.log(`Remainder: ${remainderInfo.remainderFormatted}`);
 * }
 * ```
 */
export function useClosePositionQuote({
  quote,
  collateralBalance,
  collateralDecimals,
}: UseClosePositionQuoteProps): { remainderInfo: RemainderInfo | null } {
  const remainderInfo = useMemo((): RemainderInfo | null => {
    if (!quote) {
      return null;
    }

    const used = quote.sellAmount;
    const remainder = collateralBalance > used ? collateralBalance - used : 0n;
    const remainderFormatted = formatTokenAmount(remainder.toString(), collateralDecimals);

    // Calculate remainder USD value
    let remainderUsd: number | undefined = undefined;

    const sellUnits = Number.parseFloat(formatTokenAmount(quote.sellAmount.toString(), collateralDecimals));
    const remainderUnits = Number.parseFloat(remainderFormatted);

    if (sellUnits > 0 && quote.sellAmountInUsd !== undefined) {
      // Proportional calculation: remainder_usd = sell_usd * (remainder_units / sell_units)
      remainderUsd = quote.sellAmountInUsd * (remainderUnits / sellUnits);
    } else if (quote.sellTokenPriceInUsd !== undefined) {
      // Direct calculation: remainder_usd = remainder_units * price_per_unit
      remainderUsd = remainderUnits * quote.sellTokenPriceInUsd;
    }

    return { remainder, remainderFormatted, remainderUsd };
  }, [quote, collateralBalance, collateralDecimals]);

  return { remainderInfo };
}

/**
 * Calculate if user has sufficient collateral for the swap
 */
export function hasEnoughCollateral(
  requiredCollateral: bigint,
  availableCollateral: bigint,
): boolean {
  return requiredCollateral <= availableCollateral;
}
