/**
 * Shared utility functions for protocol-specific components
 * These helpers are used across Morpho, Aave, Compound, Venus, Vesu, and other protocol views
 */

/**
 * Safely convert various value types to a number
 * Handles number, bigint, string, and fallback to 0 for invalid/non-finite values
 */
export function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Calculate 10^decimals safely
 * Clamps decimals to prevent overflow (typically used for token decimals <= 18)
 */
export function pow10(decimals: number): number {
  return 10 ** Math.max(0, Math.min(36, decimals));
}

/**
 * Get a color class based on utilization percentage (0-1 scale)
 * - >= 95%: error (red)
 * - >= 85%: warning (yellow)
 * - < 85%: base content (muted)
 */
export function utilizationColor(utilization: number): string {
  if (utilization >= 0.95) return "text-error";
  if (utilization >= 0.85) return "text-warning";
  return "text-base-content/70";
}

/**
 * Create a USD currency formatter using Intl.NumberFormat
 * Returns compact notation with max 2 fraction digits
 */
export function makeUsdFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

/**
 * Format a decimal value (0-1) as a percentage string
 * @param value01 - Value in 0-1 scale (e.g., 0.05 for 5%)
 * @param digits - Number of fraction digits
 */
export function formatPercent(value01: number, digits: number): string {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return fmt.format(value01);
}

/**
 * Format a percentage value with sign (e.g., +5.00% or -3.50%)
 * @param value - Value already in percentage scale (e.g., 5 for 5%)
 * @param digits - Number of fraction digits (default: 2)
 */
export function formatSignedPercent(value: number, digits = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/**
 * Get color class for health factor display
 * @param healthFactor - Health factor value (1.0 = liquidation threshold)
 */
export function healthFactorColor(healthFactor: number | null): string {
  if (healthFactor === null) return "text-base-content";
  if (healthFactor < 1.1) return "text-error";
  if (healthFactor < 1.3) return "text-warning";
  return "text-success";
}

/**
 * Get color class for LTV display
 * @param currentLtv - Current LTV value
 * @param maxLtv - Maximum LTV threshold
 */
export function ltvColor(currentLtv: number | null, maxLtv: number): string {
  if (currentLtv === null) return "text-base-content";
  if (currentLtv > maxLtv * 0.9) return "text-error";
  if (currentLtv > maxLtv * 0.7) return "text-warning";
  return "text-success";
}

/**
 * Format a balance with appropriate precision based on magnitude
 * @param balance - Raw balance as bigint
 * @param decimals - Token decimals
 * @param symbol - Token symbol for display
 */
export function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  const num = Number(balance) / pow10(decimals);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M ${symbol}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K ${symbol}`;
  if (num < 0.0001 && num > 0) return `<0.0001 ${symbol}`;
  return `${num.toFixed(4)} ${symbol}`;
}

/**
 * Format USD value with appropriate precision and notation
 * @param value - USD value
 */
export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 0.01 && value > 0) return "<$0.01";
  return `$${value.toFixed(2)}`;
}
