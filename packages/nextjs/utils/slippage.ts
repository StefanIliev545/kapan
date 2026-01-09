/**
 * Slippage calculation utilities for swap modals
 *
 * This module centralizes all slippage-related constants and calculations
 * for consistent behavior across the application.
 */

export type PriceImpactSeverity = "low" | "medium" | "high";

// ============ Slippage Constants ============

/** Standard slippage options for dropdown - includes low values for stable pairs */
export const SLIPPAGE_OPTIONS = [0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 2, 3, 5] as const;

/** Default initial slippage - will be auto-adjusted based on price impact */
export const DEFAULT_SLIPPAGE = 0.1;

/** Minimum slippage floor for stable pairs */
export const MIN_SLIPPAGE = 0.01;

/** Maximum slippage cap - anything higher is likely user error */
export const MAX_SLIPPAGE = 5;

/** Default slippage for limit orders (1% minimum for better fill rates) */
export const LIMIT_ORDER_DEFAULT_SLIPPAGE = 1;

// ============ Starknet Protocol Constants ============
// These are hardcoded slippage values for Starknet protocols using AVNU

/** Hardcoded slippage for Nostra AVNU swaps (5%) */
export const NOSTRA_SLIPPAGE = 0.05;

/** Hardcoded slippage for Vesu AVNU swaps (5%) */
export const VESU_SLIPPAGE = 0.05;

/**
 * Calculate suggested slippage based on price impact
 * 
 * The formula adds a dynamic buffer on top of the price impact to account for:
 * - Price movement between quote and execution
 * - Network latency and block confirmation time
 * - DEX routing variations
 * 
 * Buffer scales with price impact magnitude:
 * - Very low impact (< 0.05%): minimal buffer - for stable pairs on 0.01% fee pools
 * - Low impact (0.05% - 0.3%): small buffer
 * - Medium impact (0.3% - 1%): moderate buffer
 * - High impact (> 1%): larger buffer
 * 
 * @param priceImpact - Price impact as percentage (e.g., 0.5 for 0.5%)
 * @returns Suggested slippage percentage
 */
export const calculateSuggestedSlippage = (priceImpact: number | null): number => {
    if (priceImpact === null || priceImpact <= 0) {
        return MIN_SLIPPAGE;
    }
    
    // Dynamic buffer based on price impact magnitude
    // Examples with this formula:
    //   0.01% impact → 0.01 + 0.01 = 0.02%
    //   0.03% impact → 0.03 + 0.01 = 0.04%
    //   0.1% impact  → 0.1 + 0.03 = 0.13% → rounds to 0.1%
    //   0.3% impact  → 0.3 + 0.11 = 0.41% → rounds to 0.4%
    //   0.5% impact  → 0.5 + 0.15 = 0.65% → rounds to 0.7%
    //   1.0% impact  → 1.0 + 0.4 = 1.4%
    //   2.0% impact  → 2.0 + 0.7 = 2.7%
    let buffer: number;
    if (priceImpact < 0.05) {
        buffer = 0.01;  // Stables, very liquid pairs
    } else if (priceImpact < 0.3) {
        buffer = 0.02 + (priceImpact * 0.1);
    } else if (priceImpact < 1) {
        buffer = 0.05 + (priceImpact * 0.2);
    } else {
        buffer = 0.1 + (priceImpact * 0.3);
    }
    
    const suggested = priceImpact + buffer;
    
    // Round to sensible precision:
    // < 0.1%: round to nearest 0.01%
    // >= 0.1%: round to nearest 0.1%
    const rounded = suggested < 0.1 
        ? Math.round(suggested * 100) / 100 
        : Math.round(suggested * 10) / 10;
    
    return Math.max(MIN_SLIPPAGE, Math.min(rounded, MAX_SLIPPAGE));
};

/**
 * Get severity level for price impact (for color coding)
 * 
 * @param priceImpact - Price impact as percentage (e.g., 0.5 for 0.5%)
 * @returns Severity level for styling
 */
export const getPriceImpactSeverity = (priceImpact: number | null): PriceImpactSeverity => {
    if (priceImpact === null) return "low";
    
    const absImpact = Math.abs(priceImpact);
    
    if (absImpact < 0.5) return "low";      // < 0.5% - green, normal
    if (absImpact < 2) return "medium";     // 0.5% - 2% - yellow, caution
    return "high";                           // > 2% - red, warning
};

/**
 * Get CSS class for price impact severity
 * 
 * @param severity - Price impact severity level
 * @returns Tailwind CSS classes for text color
 */
export const getPriceImpactColorClass = (severity: PriceImpactSeverity): string => {
    switch (severity) {
        case "low":
            return "text-success";
        case "medium":
            return "text-warning";
        case "high":
            return "text-error";
    }
};

/**
 * Format price impact for display
 * 
 * @param priceImpact - Price impact as percentage (can be negative)
 * @returns Formatted string like "-0.15%" or "0.15%"
 */
export const formatPriceImpact = (priceImpact: number | null): string => {
    if (priceImpact === null) return "-";
    
    const sign = priceImpact > 0 ? "-" : priceImpact < 0 ? "+" : "";
    return `${sign}${Math.abs(priceImpact).toFixed(2)}%`;
};

/**
 * Calculate price impact from USD values (for 1inch quotes)
 *
 * @param srcUSD - Source amount in USD
 * @param dstUSD - Destination amount in USD
 * @returns Price impact as percentage (positive means loss)
 */
export const calculatePriceImpactFromUSD = (srcUSD: number | null, dstUSD: number | null): number | null => {
    if (srcUSD === null || dstUSD === null || srcUSD <= 0) return null;

    // Positive result means value loss (paying more than receiving)
    return ((srcUSD - dstUSD) / srcUSD) * 100;
};

// ============ BigInt Slippage Calculations ============
// These utilities handle slippage calculations with BigInt for precision

/**
 * Apply slippage buffer to an amount (increase for max sell)
 *
 * @param amount - Base amount as BigInt
 * @param slippagePercent - Slippage as percentage (e.g., 3 for 3%)
 * @returns Amount with slippage buffer added
 */
export const applySlippageBuffer = (amount: bigint, slippagePercent: number): bigint => {
    if (amount === 0n) return 0n;
    const slippageBps = BigInt(Math.round(slippagePercent * 100));
    return (amount * (10000n + slippageBps)) / 10000n;
};

/**
 * Apply slippage reduction to an amount (decrease for min buy)
 *
 * @param amount - Base amount as BigInt
 * @param slippagePercent - Slippage as percentage (e.g., 3 for 3%)
 * @returns Amount with slippage reduction applied
 */
export const applySlippageReduction = (amount: bigint, slippagePercent: number): bigint => {
    if (amount === 0n) return 0n;
    const slippageBps = BigInt(Math.round(slippagePercent * 100));
    return (amount * (10000n - slippageBps)) / 10000n;
};

/**
 * Convert slippage percentage to basis points
 *
 * @param slippagePercent - Slippage as percentage (e.g., 0.5 for 0.5%)
 * @returns Slippage in basis points as BigInt
 */
export const slippageToBps = (slippagePercent: number): bigint => {
    return BigInt(Math.round(slippagePercent * 100));
};

/**
 * Standard buffer used in Starknet hooks (3%)
 */
export const STANDARD_BUFFER_BPS = 300n;

/**
 * Apply a basis points buffer to an amount
 *
 * @param amount - Base amount as BigInt
 * @param bufferBps - Buffer in basis points (e.g., 300n for 3%)
 * @returns Amount with buffer applied
 */
export const withBuffer = (amount: bigint, bufferBps: bigint = STANDARD_BUFFER_BPS): bigint => {
    if (amount === 0n) return 0n;
    return (amount * (10_000n + bufferBps)) / 10_000n;
};
