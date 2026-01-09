/**
 * Shared BigInt Utilities
 *
 * This module consolidates common BigInt operations used across the codebase:
 * - Parsing and formatting (parseUnits/formatUnits wrappers)
 * - Decimal scaling and normalization
 * - Safe conversion between string/bigint/number
 * - JSON serialization helpers
 * - Hex address formatting
 *
 * Centralizes patterns previously duplicated across:
 * - validation.ts (parseAmount)
 * - protocols.ts (formatTokenAmount)
 * - vesu.ts (normalizeHexAddress, toBigNumberish)
 * - scaffold-stark/common.ts (replacer, feltToHex)
 * - scaffold-eth/common.ts (replacer)
 * - cow/orderParams.ts (parseAmount)
 * - Multiple hooks using toHexAddress patterns
 */

import { parseUnits as viemParseUnits, formatUnits as viemFormatUnits } from "viem";

// ============================================================================
// Constants
// ============================================================================

/** Standard scale factor (1e18) used for most DeFi calculations */
export const SCALE_18 = 10n ** 18n;

/** Price scale factor (1e8) used for USD prices */
export const SCALE_8 = 10n ** 8n;

/** Basis points scale (10000) */
export const BPS_SCALE = 10000n;

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a human-readable amount string to bigint.
 * Handles both raw bigint values and string amounts.
 *
 * @param value - Amount as string ("1.5") or bigint
 * @param decimals - Token decimals (default: 18)
 * @returns Parsed bigint value
 *
 * @example
 * ```ts
 * parseAmount("1.5", 18) // 1500000000000000000n
 * parseAmount(1500000000000000000n, 18) // 1500000000000000000n
 * parseAmount("100", 6) // 100000000n
 * ```
 */
export function parseAmount(value: string | bigint, decimals: number = 18): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  return viemParseUnits(value, decimals);
}

/**
 * Safely parse an amount string, returning null on failure.
 *
 * @param value - Amount string to parse
 * @param decimals - Token decimals
 * @returns Parsed bigint or null if parsing fails
 *
 * @example
 * ```ts
 * safeParseAmount("1.5", 18) // 1500000000000000000n
 * safeParseAmount("invalid", 18) // null
 * safeParseAmount("", 18) // null
 * ```
 */
export function safeParseAmount(value: string, decimals: number = 18): bigint | null {
  if (!value || !value.trim()) {
    return null;
  }
  try {
    return viemParseUnits(value, decimals);
  } catch {
    return null;
  }
}

/**
 * Convert any value to bigint safely.
 * Handles strings, numbers, and existing bigint values.
 *
 * @param value - Value to convert
 * @returns bigint value
 *
 * @example
 * ```ts
 * toBigInt("123") // 123n
 * toBigInt(123) // 123n
 * toBigInt(123n) // 123n
 * ```
 */
export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  return BigInt(value);
}

/**
 * Safely convert to bigint, returning default on failure.
 *
 * @param value - Value to convert
 * @param defaultValue - Default value if conversion fails
 * @returns bigint value
 */
export function safeToBigInt(value: unknown, defaultValue: bigint = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  if (typeof value === "string") {
    try {
      // Handle string numbers, including those from JSON
      const trimmed = value.trim();
      if (!trimmed) return defaultValue;
      return BigInt(trimmed.split(".")[0]); // Handle decimal strings
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format a bigint amount to human-readable string.
 *
 * @param value - Amount in native units
 * @param decimals - Token decimals
 * @returns Formatted string
 *
 * @example
 * ```ts
 * formatAmount(1500000000000000000n, 18) // "1.5"
 * formatAmount(100000000n, 6) // "100"
 * ```
 */
export function formatAmount(value: bigint, decimals: number = 18): string {
  return viemFormatUnits(value, decimals);
}

/**
 * Format a bigint amount with fixed decimal places.
 *
 * @param value - Amount in native units
 * @param decimals - Token decimals
 * @param displayDecimals - Number of decimal places to show (default: 3)
 * @returns Formatted string with fixed decimal places
 *
 * @example
 * ```ts
 * formatAmountFixed(1500000000000000000n, 18, 2) // "1.50"
 * formatAmountFixed(100500000n, 6, 3) // "100.500"
 * ```
 */
export function formatAmountFixed(
  value: bigint,
  decimals: number = 18,
  displayDecimals: number = 3
): string {
  const formatted = viemFormatUnits(value, decimals);
  const num = parseFloat(formatted);
  return num.toFixed(displayDecimals);
}

/**
 * Format token amount for display (legacy format with 3 decimal places).
 * Used in protocols.ts for consistent token amount display.
 *
 * @param amount - Amount as string or bigint
 * @param decimals - Token decimals
 * @returns Formatted string with exactly 3 decimal places
 *
 * @example
 * ```ts
 * formatTokenAmount("1500000000000000000", 18) // "1.500"
 * formatTokenAmount(100000000n, 6) // "100.000"
 * ```
 */
export function formatTokenAmount(amount: string | bigint, decimals: number): string {
  try {
    const bigIntAmount = typeof amount === "string" ? BigInt(amount) : amount;
    const divisor = 10n ** BigInt(decimals);
    const whole = bigIntAmount / divisor;
    const fraction = bigIntAmount % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0");
    const formatted = `${whole}.${fractionStr}`;

    // Ensure exactly 3 decimal places
    const parts = formatted.split(".");
    if (parts.length === 1) {
      return `${parts[0]}.000`;
    }
    const decimalPart = parts[1].slice(0, 3).padEnd(3, "0");
    return `${parts[0]}.${decimalPart}`;
  } catch (error) {
    console.error("Error formatting token amount:", error);
    return "0.000";
  }
}

// ============================================================================
// Decimal Scaling
// ============================================================================

/**
 * Create a decimal scale factor.
 *
 * @param decimals - Number of decimals
 * @returns 10^decimals as bigint
 *
 * @example
 * ```ts
 * scaleFactor(18) // 1000000000000000000n
 * scaleFactor(6) // 1000000n
 * ```
 */
export function scaleFactor(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

/**
 * Scale a value up by decimals.
 *
 * @param value - Value to scale
 * @param decimals - Decimals to scale by
 * @returns Scaled value
 */
export function scaleUp(value: bigint, decimals: number): bigint {
  return value * scaleFactor(decimals);
}

/**
 * Scale a value down by decimals.
 *
 * @param value - Value to scale
 * @param decimals - Decimals to scale by
 * @returns Scaled value
 */
export function scaleDown(value: bigint, decimals: number): bigint {
  return value / scaleFactor(decimals);
}

/**
 * Normalize a value from one decimal scale to another.
 *
 * @param value - Value to normalize
 * @param fromDecimals - Source decimals
 * @param toDecimals - Target decimals
 * @returns Normalized value
 *
 * @example
 * ```ts
 * normalizeDecimals(1000000n, 6, 18) // 1000000000000000000n
 * normalizeDecimals(1000000000000000000n, 18, 6) // 1000000n
 * ```
 */
export function normalizeDecimals(
  value: bigint,
  fromDecimals: number,
  toDecimals: number
): bigint {
  if (fromDecimals === toDecimals) return value;
  if (fromDecimals < toDecimals) {
    return value * scaleFactor(toDecimals - fromDecimals);
  }
  return value / scaleFactor(fromDecimals - toDecimals);
}

// ============================================================================
// Basis Points
// ============================================================================

/**
 * Apply basis points to a value.
 *
 * @param value - Base value
 * @param bps - Basis points (e.g., 100 = 1%)
 * @returns Value * bps / 10000
 *
 * @example
 * ```ts
 * applyBps(1000n, 500) // 50n (5% of 1000)
 * applyBps(10000n, 8000) // 8000n (80% of 10000)
 * ```
 */
export function applyBps(value: bigint, bps: number): bigint {
  return (value * BigInt(bps)) / BPS_SCALE;
}

/**
 * Calculate a fee amount from basis points.
 *
 * @param amount - Amount to calculate fee on
 * @param feeBps - Fee in basis points
 * @returns Fee amount
 *
 * @example
 * ```ts
 * calculateFee(1000000n, 5) // 500n (0.05% of 1000000)
 * calculateFee(1000000n, 100) // 10000n (1% of 1000000)
 * ```
 */
export function calculateFee(amount: bigint, feeBps: number): bigint {
  return applyBps(amount, feeBps);
}

/**
 * Convert basis points to decimal multiplier.
 *
 * @param bps - Basis points
 * @returns Decimal value (e.g., 8000 bps = 0.8)
 */
export function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

/**
 * Convert decimal to basis points.
 *
 * @param decimal - Decimal value (e.g., 0.8)
 * @returns Basis points (e.g., 8000)
 */
export function decimalToBps(decimal: number): number {
  return Math.round(decimal * 10000);
}

// ============================================================================
// Hex Address Formatting
// ============================================================================

/**
 * Convert a bigint felt to hex string.
 * Used for Starknet address formatting.
 *
 * @param feltBigInt - Felt value as bigint
 * @returns Hex string with 0x prefix
 *
 * @example
 * ```ts
 * feltToHex(255n) // "0xff"
 * feltToHex(0n) // "0x0"
 * ```
 */
export function feltToHex(feltBigInt: bigint): string {
  return `0x${feltBigInt.toString(16)}`;
}

/**
 * Convert bigint to padded hex address (64 chars).
 * Standard format for Starknet addresses.
 *
 * @param value - Value to convert
 * @returns Padded hex address with 0x prefix
 *
 * @example
 * ```ts
 * toHexAddress(255n) // "0x00000000000000000000000000000000000000000000000000000000000000ff"
 * ```
 */
export function toHexAddress(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

/**
 * Normalize a hex address to standard format (64 chars, lowercase).
 * Handles both bigint and string inputs.
 *
 * @param value - Address as bigint or hex string
 * @returns Normalized hex address
 *
 * @example
 * ```ts
 * normalizeHexAddress(255n) // "0x00...00ff"
 * normalizeHexAddress("0xFF") // "0x00...00ff"
 * normalizeHexAddress("FF") // "0x00...00ff"
 * ```
 */
export function normalizeHexAddress(value: string | bigint): string {
  const hex =
    typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/i, "");
  return `0x${hex.toLowerCase().padStart(64, "0")}`;
}

// ============================================================================
// JSON Serialization
// ============================================================================

/**
 * JSON replacer function for objects containing BigInt values.
 * Use with JSON.stringify to handle BigInt serialization.
 *
 * @param _key - Property key (unused)
 * @param value - Property value
 * @returns Serialized value (BigInt converted to string)
 *
 * @example
 * ```ts
 * JSON.stringify({ amount: 1000n }, bigintReplacer) // '{"amount":"1000"}'
 * ```
 */
export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

/**
 * Stringify an object containing BigInt values.
 * Convenience wrapper around JSON.stringify with bigintReplacer.
 *
 * @param value - Value to stringify
 * @returns JSON string
 */
export function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, bigintReplacer);
}

/**
 * JSON reviver function to parse BigInt strings back to BigInt.
 * Use with JSON.parse to restore BigInt values.
 *
 * Note: Only parses strings that look like whole numbers.
 *
 * @param _key - Property key (unused)
 * @param value - Property value
 * @returns Parsed value (numeric strings converted to BigInt)
 */
export function bigintReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return value;
    }
  }
  return value;
}

// ============================================================================
// Comparison Helpers
// ============================================================================

/**
 * Check if a bigint value is approximately equal to another within tolerance.
 *
 * @param a - First value
 * @param b - Second value
 * @param toleranceBps - Tolerance in basis points (default: 10 = 0.1%)
 * @returns true if values are within tolerance
 *
 * @example
 * ```ts
 * isApproxEqual(1000n, 1005n, 100) // true (0.5% difference, within 1%)
 * isApproxEqual(1000n, 1020n, 100) // false (2% difference, exceeds 1%)
 * ```
 */
export function isApproxEqual(a: bigint, b: bigint, toleranceBps: number = 10): boolean {
  if (a === b) return true;
  const larger = a > b ? a : b;
  const diff = a > b ? a - b : b - a;
  return diff * BPS_SCALE <= larger * BigInt(toleranceBps);
}

/**
 * Get the minimum of two bigint values.
 */
export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * Get the maximum of two bigint values.
 */
export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * Clamp a bigint value between min and max.
 */
export function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ============================================================================
// Price/USD Helpers
// ============================================================================

/**
 * Calculate USD value from token amount and price.
 *
 * @param amount - Token amount in native units
 * @param priceUsd - Price in USD (8 decimals)
 * @param tokenDecimals - Token decimals
 * @returns USD value (8 decimals)
 *
 * @example
 * ```ts
 * // 1.5 ETH at $2000/ETH
 * calculateUsdValue(1500000000000000000n, 200000000000n, 18) // 300000000000n ($3000)
 * ```
 */
export function calculateUsdValue(
  amount: bigint,
  priceUsd: bigint,
  tokenDecimals: number
): bigint {
  return (amount * priceUsd) / scaleFactor(tokenDecimals);
}

/**
 * Format USD price value (8 decimals) to number.
 *
 * @param priceUsd - Price in USD (8 decimals)
 * @returns Number value
 */
export function formatUsdPrice(priceUsd: bigint): number {
  return Number(priceUsd) / 1e8;
}

// ============================================================================
// Exports for backwards compatibility
// ============================================================================

// Re-export viem functions for convenience
export { viemParseUnits as parseUnits, viemFormatUnits as formatUnits };
