/**
 * Slippage calculation utilities for swap modals
 */

export type PriceImpactSeverity = "low" | "medium" | "high";

/**
 * Calculate suggested slippage based on price impact
 * 
 * The formula adds a buffer on top of the price impact to account for:
 * - Price movement between quote and execution
 * - Network latency and block confirmation time
 * - DEX routing variations
 * 
 * @param priceImpact - Price impact as percentage (e.g., 0.5 for 0.5%)
 * @returns Suggested slippage percentage
 */
export const calculateSuggestedSlippage = (priceImpact: number | null): number => {
    const MIN_SLIPPAGE = 0.1;  // 0.1% minimum - works for very liquid pairs
    const MAX_SLIPPAGE = 5;    // 5% cap - anything higher is likely user error
    
    if (priceImpact === null || priceImpact <= 0) {
        return MIN_SLIPPAGE;
    }
    
    // Suggested slippage = priceImpact + small buffer
    // Buffer = 0.1% base + 30% of impact (conservative scaling)
    // Examples:
    //   0.01% impact → 0.01 + 0.1 + 0.003 = 0.113% → rounds to 0.1%
    //   0.1% impact → 0.1 + 0.1 + 0.03 = 0.23% → rounds to 0.2%
    //   0.5% impact → 0.5 + 0.1 + 0.15 = 0.75% → rounds to 0.8%
    //   1.0% impact → 1.0 + 0.1 + 0.3 = 1.4%
    //   2.0% impact → 2.0 + 0.1 + 0.6 = 2.7%
    const buffer = 0.1 + (priceImpact * 0.3);
    const suggested = priceImpact + buffer;
    
    // Round to nearest 0.1%
    const rounded = Math.round(suggested * 10) / 10;
    
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
