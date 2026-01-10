/**
 * Shared utilities for protocol position hooks
 * Consolidates duplicated logic from useVesuLendingPositions, useVesuV2LendingPositions,
 * useNostraLendingPositions, and useMorphoLendingPositions
 */

import { formatUnits } from "viem";

/**
 * Convert a bigint address to a hex string with 64-character padding
 * @param value - The bigint address value
 * @returns Hex string with 0x prefix and 64 characters
 */
export const toHexAddress = (value: bigint): string =>
  `0x${value.toString(16).padStart(64, "0")}`;

/**
 * Safely convert various types to boolean
 * @param value - The value to convert
 * @param fallback - Default value if conversion fails
 */
export const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return fallback;
};

/**
 * Normalize a price object with validity check
 * Used by Vesu and similar protocols that return { value, is_valid }
 * @param price - Price object with value and validity flag
 * @returns Normalized price (divided by 10^10) or 0n if invalid
 */
export const normalizePrice = (price: { value: bigint; is_valid: boolean }): bigint =>
  price.is_valid ? price.value / 10n ** 10n : 0n;

/**
 * Compute USD value from token amount, decimals, and price
 * Shared across all position hooks for consistent value calculation
 *
 * @param amount - Raw token amount as bigint
 * @param decimals - Token decimals
 * @param priceWithEightDecimals - Price with 8 decimals of precision (standard oracle format)
 * @returns USD value as number
 */
export const computeUsdValue = (
  amount: bigint,
  decimals: number,
  priceWithEightDecimals: bigint
): number => {
  if (amount === 0n || priceWithEightDecimals === 0n) {
    return 0;
  }

  const safeDecimals = Number.isFinite(decimals) ? decimals : 18;
  const tokenAmount = Number(formatUnits(amount, safeDecimals));
  const priceAsNumber = Number(priceWithEightDecimals) / 1e8;

  return tokenAmount * priceAsNumber;
};

/**
 * Compute USD value with raw number price (for Morpho-style APIs)
 * @param amount - Raw token amount as bigint
 * @param decimals - Token decimals
 * @param priceUsd - Price in USD (already as number)
 */
export const computeUsdValueFromNumber = (
  amount: bigint,
  decimals: number,
  priceUsd: number
): number => {
  if (amount === 0n || priceUsd === 0) {
    return 0;
  }

  const safeDecimals = Number.isFinite(decimals) ? decimals : 18;
  const tokenAmount = Number(formatUnits(amount, safeDecimals));
  return tokenAmount * priceUsd;
};

/**
 * Calculate LTV percentage from collateral and debt USD values
 * @param collateralUsd - Total collateral value in USD
 * @param debtUsd - Total debt value in USD
 * @returns LTV as percentage (0-100+) or null if no collateral
 */
export const calculateLtvPercent = (
  collateralUsd: number,
  debtUsd: number
): number | null => {
  if (collateralUsd <= 0 || debtUsd <= 0) {
    return null;
  }
  return (debtUsd / collateralUsd) * 100;
};

/**
 * Standard Vesu/Starknet position tuple format
 */
export type PositionTuple = [
  bigint, // collateral address
  bigint, // debt address
  {
    collateral_shares: bigint;
    collateral_amount: bigint;
    nominal_debt: bigint;
    is_vtoken: boolean;
  },
];

/**
 * Parse position data from contract response into typed tuples
 * Handles both array and object formats from different RPC responses
 *
 * Used by: useVesuLendingPositions, useVesuV2LendingPositions
 */
export const parsePositionTuples = (positions: unknown): PositionTuple[] => {
  if (!positions) return [];

  const entries = Array.isArray(positions)
    ? positions
    : typeof positions === "object"
      ? Object.values(positions as Record<string, unknown>)
      : [];

  return entries.flatMap(entry => {
    if (!entry) return [];

    let collateralRaw: unknown;
    let debtRaw: unknown;
    let statsRaw: unknown;

    if (Array.isArray(entry)) {
      if (entry.length < 3) return [];
      [collateralRaw, debtRaw, statsRaw] = entry;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      collateralRaw = obj[0] ?? obj["0"];
      debtRaw = obj[1] ?? obj["1"];
      statsRaw = obj[2] ?? obj["2"];
    } else {
      return [];
    }

    if (
      typeof collateralRaw !== "bigint" ||
      typeof debtRaw !== "bigint" ||
      !statsRaw ||
      typeof statsRaw !== "object"
    ) {
      return [];
    }

    const stats = statsRaw as {
      collateral_shares?: unknown;
      collateral_amount?: unknown;
      nominal_debt?: unknown;
      is_vtoken?: unknown;
    };

    const collateralShares = stats.collateral_shares;
    const collateralAmount = stats.collateral_amount;
    const nominalDebt = stats.nominal_debt;

    if (
      typeof collateralShares !== "bigint" ||
      typeof collateralAmount !== "bigint" ||
      typeof nominalDebt !== "bigint"
    ) {
      return [];
    }

    const tuple: PositionTuple = [
      collateralRaw,
      debtRaw,
      {
        collateral_shares: collateralShares,
        collateral_amount: collateralAmount,
        nominal_debt: nominalDebt,
        is_vtoken: toBoolean(stats.is_vtoken, false),
      },
    ];

    return [tuple];
  });
};
