"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Default debounce delay in milliseconds.
 */
export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Standard debounce delays used across the application for consistency.
 */
export const DEBOUNCE_DELAYS = {
  /** Fast debounce for UI responsiveness (300ms) */
  FAST: 300,
  /** Standard debounce for API calls (400ms) */
  STANDARD: 400,
  /** Input debounce for user typing (500ms) */
  INPUT: 500,
} as const;

/**
 * A hook that provides a debounced effect with cleanup and cancellation support.
 * Useful for debouncing API calls, expensive computations, or any async operations.
 *
 * @param effect - The effect function to debounce. Can be async. Receives a signal for cancellation checking.
 * @param deps - Dependency array that triggers the effect
 * @param delayMs - Debounce delay in milliseconds (default: 300ms)
 *
 * @example
 * ```tsx
 * useDebouncedEffect(
 *   async (signal) => {
 *     const result = await fetchData(query);
 *     if (!signal.cancelled) {
 *       setData(result);
 *     }
 *   },
 *   [query],
 *   500
 * );
 * ```
 */
export function useDebouncedEffect(
  effect: (signal: { cancelled: boolean }) => void | Promise<void>,
  deps: React.DependencyList,
  delayMs: number = DEFAULT_DEBOUNCE_MS
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    // Cancel any pending effect
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // Mark previous runs as cancelled
    signalRef.current.cancelled = true;
    signalRef.current = { cancelled: false };
    const currentSignal = signalRef.current;

    timerRef.current = setTimeout(() => {
      effect(currentSignal);
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      currentSignal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}

/**
 * A hook that provides a debounced callback with request deduplication.
 * Useful for preventing duplicate API calls when inputs change rapidly.
 *
 * @param callback - The callback function to debounce
 * @param delayMs - Debounce delay in milliseconds (default: 300ms)
 * @returns A tuple of [debouncedCallback, cancel]
 *
 * @example
 * ```tsx
 * const [debouncedSearch, cancelSearch] = useDebouncedCallback(
 *   async (query: string) => {
 *     const results = await searchAPI(query);
 *     setResults(results);
 *   },
 *   500
 * );
 *
 * // Call on input change
 * <input onChange={(e) => debouncedSearch(e.target.value)} />
 * ```
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number = DEFAULT_DEBOUNCE_MS
): [(...args: Parameters<T>) => void, () => void] {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs, cancel]
  );

  // Cleanup on unmount
  useEffect(() => {
    return cancel;
  }, [cancel]);

  return [debouncedCallback, cancel];
}

/**
 * Re-export useDebounceValue from usehooks-ts for convenience.
 * This is the standard hook for debouncing primitive values in React Query queries.
 *
 * @example
 * ```tsx
 * const [debouncedAmount] = useDebounceValue(amount, 500);
 *
 * const { data } = useQuery({
 *   queryKey: ["quote", debouncedAmount],
 *   queryFn: () => fetchQuote(debouncedAmount),
 *   enabled: BigInt(debouncedAmount || "0") > 0n,
 * });
 * ```
 */
export { useDebounceValue } from "usehooks-ts";
