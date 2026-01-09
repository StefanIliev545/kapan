/**
 * Swap Router Selection Hook
 *
 * Manages swap router state and automatically selects the best router
 * based on chain availability and token types.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  SwapRouterType,
  getSwapRouterConfig,
  getBestSwapRouterForPair,
  isSwapRouterAvailable,
  getAvailableSwapRouters,
} from "~~/utils/swapRouter";
import { isPendleToken } from "~~/utils/chainFeatures";

export interface UseSwapRouterSelectionParams {
  /** Chain ID */
  chainId: number;
  /** Symbol of the sell token */
  sellSymbol?: string;
  /** Symbol of the buy token */
  buySymbol?: string;
  /** Initial router preference */
  initialRouter?: SwapRouterType;
  /** Execution type (market orders use 1inch/Pendle, limit orders use CoW) */
  executionType?: "market" | "limit";
}

export interface UseSwapRouterSelectionResult {
  /** Currently selected router */
  router: SwapRouterType;
  /** Set the router manually */
  setRouter: (router: SwapRouterType) => void;
  /** Whether 1inch is available */
  oneInchAvailable: boolean;
  /** Whether Pendle is available */
  pendleAvailable: boolean;
  /** Whether CoW Protocol is available */
  cowAvailable: boolean;
  /** All available routers for this chain */
  availableRouters: SwapRouterType[];
  /** Whether the current router has an adapter */
  hasAdapter: boolean;
  /** Whether multiple routers are available (show toggle) */
  showRouterToggle: boolean;
}

/**
 * Hook to manage swap router selection with auto-switching based on token types.
 *
 * Features:
 * - Auto-selects Pendle when PT tokens are involved
 * - Falls back to available routers when selected router is unavailable
 * - Provides all availability information for UI
 *
 * @example
 * ```tsx
 * const {
 *   router,
 *   setRouter,
 *   oneInchAvailable,
 *   pendleAvailable,
 *   showRouterToggle,
 * } = useSwapRouterSelection({
 *   chainId: 8453,
 *   sellSymbol: "PT-weETH-26DEC2024",
 *   buySymbol: "USDC",
 * });
 *
 * // router will be "pendle" because PT token is involved
 * ```
 */
export function useSwapRouterSelection({
  chainId,
  sellSymbol = "",
  buySymbol = "",
  initialRouter,
  executionType = "market",
}: UseSwapRouterSelectionParams): UseSwapRouterSelectionResult {
  const config = getSwapRouterConfig(chainId);

  // Determine the default router
  const defaultRouter = useMemo(() => {
    // For limit orders, CoW is the only option
    if (executionType === "limit") {
      return config.cowAvailable ? "cow" : config.defaultRouter;
    }

    // If initial router is specified and available, use it
    if (initialRouter && isSwapRouterAvailable(chainId, initialRouter)) {
      return initialRouter;
    }

    // Otherwise use the chain's default
    return config.defaultRouter;
  }, [chainId, initialRouter, executionType, config]);

  const [router, setRouterState] = useState<SwapRouterType>(defaultRouter);

  // Update router when default changes (e.g., chain switch)
  useEffect(() => {
    setRouterState(defaultRouter);
  }, [defaultRouter]);

  // Auto-switch to Pendle when PT tokens are involved
  useEffect(() => {
    if (executionType === "limit") return; // Don't auto-switch for limit orders

    const isPTInvolved = isPendleToken(sellSymbol) || isPendleToken(buySymbol);
    if (isPTInvolved && config.pendleAvailable) {
      setRouterState("pendle");
    }
  }, [sellSymbol, buySymbol, config.pendleAvailable, executionType]);

  // Validate router is still available when chain changes
  useEffect(() => {
    if (!isSwapRouterAvailable(chainId, router)) {
      // Fall back to first available router
      const available = getAvailableSwapRouters(chainId);
      if (available.length > 0) {
        setRouterState(available[0]);
      }
    }
  }, [chainId, router]);

  // Safe setter that validates availability
  const setRouter = useCallback((newRouter: SwapRouterType) => {
    if (isSwapRouterAvailable(chainId, newRouter)) {
      setRouterState(newRouter);
    }
  }, [chainId]);

  // Calculate whether we have an adapter for the current router
  const hasAdapter = useMemo(() => {
    switch (router) {
      case "1inch":
        return !!config.oneInchAdapter;
      case "pendle":
        return !!config.pendleAdapter;
      case "cow":
        return true; // CoW doesn't need a traditional adapter
      default:
        return false;
    }
  }, [router, config]);

  // Show toggle when multiple market routers are available
  const showRouterToggle = useMemo(() => {
    if (executionType === "limit") return false;
    const marketRouters = [config.oneInchAvailable, config.pendleAvailable].filter(Boolean);
    return marketRouters.length > 1;
  }, [config.oneInchAvailable, config.pendleAvailable, executionType]);

  return {
    router,
    setRouter,
    oneInchAvailable: config.oneInchAvailable,
    pendleAvailable: config.pendleAvailable,
    cowAvailable: config.cowAvailable,
    availableRouters: getAvailableSwapRouters(chainId),
    hasAdapter,
    showRouterToggle,
  };
}

/**
 * Map internal router names to protocol instruction format
 */
export function mapRouterToProtocol(router: SwapRouterType): "oneinch" | "pendle" | "cow" {
  switch (router) {
    case "1inch":
      return "oneinch";
    case "pendle":
      return "pendle";
    case "cow":
      return "cow";
    default:
      return "oneinch";
  }
}
