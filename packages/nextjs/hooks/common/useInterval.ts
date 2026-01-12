import { useEffect, useRef } from "react";

/**
 * Hook to run a callback at a specified interval.
 * Properly cleans up on unmount or when dependencies change.
 *
 * @param callback - The function to call at each interval
 * @param delayMs - The interval delay in milliseconds, or null to pause
 *
 * @example
 * // Poll every 15 seconds
 * useInterval(() => {
 *   fetchOrders();
 * }, 15000);
 *
 * @example
 * // Conditional interval (only when drawer is open)
 * useInterval(
 *   () => fetchOrders(),
 *   isOpen ? 15000 : null
 * );
 */
export function useInterval(
  callback: () => void,
  delayMs: number | null
): void {
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (delayMs === null) return;

    const tick = () => {
      savedCallback.current();
    };

    const id = setInterval(tick, delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

/**
 * Hook to run a callback at an interval, but only when a condition is met.
 *
 * @param callback - The function to call at each interval
 * @param delayMs - The interval delay in milliseconds
 * @param enabled - Whether the interval should be active
 *
 * @example
 * // Poll only when the drawer is open
 * useIntervalWhen(
 *   () => fetchOrders(),
 *   15000,
 *   isOpen
 * );
 */
export function useIntervalWhen(
  callback: () => void,
  delayMs: number,
  enabled: boolean
): void {
  useInterval(callback, enabled ? delayMs : null);
}
