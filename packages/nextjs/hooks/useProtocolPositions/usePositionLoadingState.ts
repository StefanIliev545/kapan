/**
 * Shared hook for managing position loading state
 * Consolidates the common hasLoadedOnce/isUpdating pattern used across all position hooks
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePositionLoadingStateOptions {
  /** Whether the data is currently loading (initial load) */
  isLoading: boolean;
  /** Whether data is being fetched (includes background refetch) */
  isFetching: boolean;
  /** The user address - state resets when this changes */
  userAddress: string | undefined;
  /** Optional chain ID - state resets when this changes */
  chainId?: number;
  /** Optional pool/market identifier - state resets when this changes */
  poolId?: string | bigint;
  /** Any error from the fetch - sets hasLoadedOnce to true on error */
  error?: unknown;
  /** Raw data from the fetch - used to determine when to set hasLoadedOnce */
  data?: unknown;
}

export interface UsePositionLoadingStateResult {
  /** Whether the hook has completed at least one successful load or error */
  hasLoadedOnce: boolean;
  /** Whether data is being refetched (not initial load) */
  isUpdating: boolean;
  /** Cached data that persists during refetches */
  setCachedData: <T>(data: T) => void;
  /** Get the cached data */
  getCachedData: <T>() => T | undefined;
}

/**
 * Hook that manages common loading state patterns for position fetching
 *
 * Handles:
 * - hasLoadedOnce tracking (set to true on first successful load or error)
 * - isUpdating computation (isFetching && !isLoading)
 * - Reset on address/chainId/poolId changes
 * - Optional data caching during refetches
 *
 * @example
 * ```ts
 * const { hasLoadedOnce, isUpdating } = usePositionLoadingState({
 *   isLoading,
 *   isFetching,
 *   userAddress,
 *   chainId,
 *   error,
 *   data: positions,
 * });
 * ```
 */
export function usePositionLoadingState({
  isLoading,
  isFetching,
  userAddress,
  chainId,
  poolId,
  error,
  data,
}: UsePositionLoadingStateOptions): UsePositionLoadingStateResult {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const cachedDataRef = useRef<unknown>(undefined);

  // Reset on address/chainId/poolId changes
  useEffect(() => {
    setHasLoadedOnce(false);
    cachedDataRef.current = undefined;
  }, [userAddress, chainId, poolId]);

  // Set hasLoadedOnce when loading completes
  useEffect(() => {
    if (!isLoading && !hasLoadedOnce) {
      // Mark as loaded once we have data or an error
      if (data !== undefined || error !== undefined) {
        setHasLoadedOnce(true);
      }
    }
  }, [isLoading, hasLoadedOnce, data, error]);

  // Also set hasLoadedOnce on error (even if still loading)
  useEffect(() => {
    if (error && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [error, hasLoadedOnce]);

  // Compute isUpdating - true when refetching but not during initial load
  const isUpdating = isFetching && !isLoading;

  // Cache management
  const setCachedData = useCallback(<T,>(data: T) => {
    cachedDataRef.current = data;
  }, []);

  const getCachedData = useCallback(<T,>(): T | undefined => {
    return cachedDataRef.current as T | undefined;
  }, []);

  return {
    hasLoadedOnce,
    isUpdating,
    setCachedData,
    getCachedData,
  };
}
