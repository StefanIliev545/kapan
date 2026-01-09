/**
 * SwapRouter Module
 *
 * Unified utilities for DEX integrations: 1inch, Pendle, and CoW Protocol.
 *
 * This module provides:
 * - Type definitions for normalized quotes
 * - Normalizers to convert DEX-specific responses to a unified format
 * - Configuration helpers for swap router availability
 * - Utility functions for quote comparison and calculations
 *
 * @example
 * ```ts
 * import {
 *   getSwapRouterConfig,
 *   normalize1inchSwap,
 *   normalizePendleQuote,
 *   findBestQuote,
 *   calculateRequiredInput,
 * } from "~~/utils/swapRouter";
 *
 * // Get available routers for a chain
 * const config = getSwapRouterConfig(8453); // Base
 *
 * // Normalize quotes from different sources
 * const quotes = [
 *   normalize1inchSwap(oneInchResponse, sellToken, buyToken),
 *   normalizePendleQuote(pendleResponse, sellToken, buyToken, sellAmount),
 * ];
 *
 * // Find the best quote
 * const best = findBestQuote(quotes);
 * ```
 */

// Types
export type {
  SwapRouterType,
  NormalizedQuote,
  SwapQuoteParams,
  SwapAdapterInfo,
  BestQuoteResult,
  SwapRouterConfig,
  ExchangeRateInfo,
} from "./types";

// Normalizers
export {
  normalize1inchSwap,
  normalize1inchQuote,
  normalizePendleQuote,
  normalizeCowQuote,
  calculatePriceImpactFromUSD,
  findBestQuote,
  calculateExchangeRate,
  calculateRequiredInput,
} from "./normalizers";

// Configuration
export {
  getSwapRouterConfig,
  getBestSwapRouterForPair,
  getSwapAdapterAddress,
  isSwapRouterAvailable,
  getAvailableSwapRouters,
} from "./config";
