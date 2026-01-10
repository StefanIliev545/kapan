/**
 * Shared utilities for protocol rate conversions and calculations
 * Used by Aave, Compound, Venus, and other lending protocol views
 */

import { arbitrum, base, optimism, linea } from "wagmi/chains";
import type { MarketData } from "~~/components/markets/MarketsSection";

// Time constants
export const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

/**
 * Chain ID to network name mapping for market data
 */
export const CHAIN_ID_TO_NETWORK: Record<number, MarketData["network"]> = {
  [arbitrum.id]: "arbitrum",
  [base.id]: "base",
  [optimism.id]: "optimism",
  [linea.id]: "linea",
};

/**
 * Convert Compound's per-second rate to APR percentage.
 * Compound V3 rates are denominated as per-second rates with 18 decimals.
 * @param ratePerSecond - Rate per second in wei (18 decimals)
 * @returns APR as a percentage (e.g., 5.25 for 5.25%)
 */
export const compoundRateToAPR = (ratePerSecond: bigint): number => {
  return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / 1e18;
};

/**
 * Convert Aave's RAY rate (1e27) to APY percentage.
 * Aave V3 rates are denominated in RAY format.
 * @param rate - Rate in RAY format (27 decimals)
 * @returns APY as a percentage (e.g., 5.25 for 5.25%)
 */
export const aaveRateToAPY = (rate: bigint): number => {
  return Number(rate) / 1e25;
};

/**
 * Convert Venus per-block rate to APY percentage.
 * Venus rates are per-block with 18 decimals (1 block = 1 second on their chains).
 * @param ratePerBlock - Rate per block in wei (18 decimals)
 * @returns APY as a percentage (e.g., 5.25 for 5.25%)
 */
export const venusRateToAPY = (ratePerBlock: bigint): number => {
  const ethMantissa = 1e18;
  const blocksPerDay = 60 * 60 * 24; // 86400 (1 second blocks)
  const daysPerYear = 365;
  const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
  return (Math.pow(ratePerBlockNum * blocksPerDay + 1, daysPerYear - 1) - 1) * 100;
};

/**
 * Derive decimals from a price scale bigint (e.g., 1e8 -> 8)
 * Used by Compound to determine price precision
 * @param scale - The scale value (e.g., 100000000n for 8 decimals)
 * @returns Number of decimals
 */
export const decimalsFromScale = (scale: bigint): number => {
  if (scale <= 1n) return 0;
  let s = scale;
  let d = 0;
  while (s % 10n === 0n) {
    s /= 10n;
    d++;
  }
  return d;
};

/**
 * Calculate utilization percentage from borrowed and total collateral values
 * @param borrowedValue - Total borrowed value in USD
 * @param collateralValue - Total collateral value in USD
 * @returns Utilization as a percentage (0-100)
 */
export const calculateUtilization = (borrowedValue: number, collateralValue: number): number => {
  if (collateralValue <= 0) return 0;
  return (borrowedValue / collateralValue) * 100;
};

/**
 * Standard set of stablecoin symbols for price feed fallback detection
 */
export const STABLECOIN_SYMBOLS = new Set([
  "usdc",
  "usdc.e",
  "usdt",
  "dai",
  "gusd",
  "susd",
  "lusd",
  "usdp",
  "busd",
]);

/**
 * Check if a symbol is a stablecoin
 * @param symbol - Token symbol (case-insensitive)
 * @returns true if the symbol is a known stablecoin
 */
export const isStablecoin = (symbol: string): boolean => {
  return STABLECOIN_SYMBOLS.has(symbol.toLowerCase());
};
