// Auto-slippage calculation hook
import { useEffect, useMemo } from "react";
import {
    calculateSuggestedSlippage,
    calculatePriceImpactFromUSD,
    getPriceImpactSeverity,
    getPriceImpactColorClass,
    formatPriceImpact,
    PriceImpactSeverity,
    DEFAULT_SLIPPAGE,
} from "~~/utils/slippage";

// Re-export from central slippage module for backward compatibility
export { SLIPPAGE_OPTIONS, DEFAULT_SLIPPAGE } from "~~/utils/slippage";

interface UseAutoSlippageParams {
    /** Current slippage value (managed by parent component) */
    slippage: number;
    /** Setter for slippage (managed by parent component) */
    setSlippage: (value: number) => void;
    /** 1inch quote response with srcUSD/dstUSD */
    oneInchQuote?: { srcUSD?: string; dstUSD?: string } | null;
    /** Pendle quote response with priceImpact */
    pendleQuote?: { data?: { priceImpact?: number } } | null;
    /** Which swap router is active */
    swapRouter: "1inch" | "pendle";
    /** Dependency to reset auto-slippage (e.g., token address changes) */
    resetDep?: unknown;
    /** Whether auto-slippage is enabled (default: true) */
    enabled?: boolean;
    /** Fallback USD value for input (when 1inch doesn't return srcUSD) */
    srcUsdFallback?: number;
    /** Fallback USD value for output (when 1inch doesn't return dstUSD) */
    dstUsdFallback?: number;
}

interface UseAutoSlippageReturn {
    /** Calculated price impact (null if unavailable) */
    priceImpact: number | null;
    /** Price impact severity level */
    priceImpactSeverity: PriceImpactSeverity;
    /** Tailwind color class for price impact */
    priceImpactColorClass: string;
    /** Formatted price impact string */
    formattedPriceImpact: string;
}

/**
 * Hook to auto-calculate slippage based on price impact and provide display utilities
 * 
 * Usage:
 * ```tsx
 * const [slippage, setSlippage] = useState(0.1);
 * const { priceImpact, priceImpactColorClass, formattedPriceImpact } = useAutoSlippage({
 *   slippage,
 *   setSlippage,
 *   oneInchQuote: quote,
 *   swapRouter: "1inch",
 *   resetDep: selectedToken?.address,
 * });
 * ```
 * 
 * - Auto-adjusts slippage when first quote arrives based on price impact
 * - Provides price impact display utilities
 * - Resets when resetDep changes (e.g., token selection)
 */
export const useAutoSlippage = ({
    slippage,
    setSlippage,
    oneInchQuote,
    pendleQuote,
    swapRouter,
    resetDep,
    enabled = true,
    srcUsdFallback,
    dstUsdFallback,
}: UseAutoSlippageParams): UseAutoSlippageReturn => {
    // Calculate price impact from available data
    const priceImpact = useMemo(() => {
        // Pendle provides priceImpact directly (as decimal, e.g., -0.001 for -0.1%)
        if (swapRouter === "pendle" && pendleQuote?.data?.priceImpact !== undefined) {
            return Math.abs(pendleQuote.data.priceImpact * 100); // Convert to percentage
        }
        // 1inch: calculate from USD values (API response or fallback from token prices)
        if (swapRouter === "1inch" && oneInchQuote) {
            // Try API-provided USD values first, fall back to token-price-based values
            const srcUSD = oneInchQuote.srcUSD ? parseFloat(oneInchQuote.srcUSD) : srcUsdFallback ?? null;
            const dstUSD = oneInchQuote.dstUSD ? parseFloat(oneInchQuote.dstUSD) : dstUsdFallback ?? null;
            return calculatePriceImpactFromUSD(srcUSD, dstUSD);
        }
        return null;
    }, [swapRouter, pendleQuote, oneInchQuote, srcUsdFallback, dstUsdFallback]);

    // Check if we have quote data
    const hasQuoteData = swapRouter === "1inch" ? !!oneInchQuote : !!pendleQuote;

    // Auto-set slippage based on price impact
    // We use a ref pattern to track if we've auto-set, triggered by resetDep changes
    useEffect(() => {
        if (!enabled) return;
        
        if (priceImpact !== null && hasQuoteData) {
            const suggested = calculateSuggestedSlippage(priceImpact);
            // Only auto-set if current slippage is at the initial default (0.1)
            // This prevents overriding user's manual selection
            if (slippage === DEFAULT_SLIPPAGE) {
                setSlippage(suggested);
            }
        }
    }, [priceImpact, hasQuoteData, enabled, setSlippage, slippage]);

    // Reset slippage to initial when resetDep changes
    useEffect(() => {
        if (enabled) {
            setSlippage(DEFAULT_SLIPPAGE);
        }
    }, [resetDep, enabled, setSlippage]);

    // Compute display values
    const priceImpactSeverity = getPriceImpactSeverity(priceImpact);
    const priceImpactColorClass = getPriceImpactColorClass(priceImpactSeverity);
    const formattedPriceImpact = formatPriceImpact(priceImpact);

    return {
        priceImpact,
        priceImpactSeverity,
        priceImpactColorClass,
        formattedPriceImpact,
    };
};
