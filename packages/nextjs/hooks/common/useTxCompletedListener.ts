import { useEffect } from "react";

/**
 * Hook to listen for transaction completion events and trigger a callback.
 * Commonly used by protocol views to refetch positions after a transaction.
 *
 * @param onTxCompleted - Callback to run when a transaction completes
 * @param enabled - Whether the listener should be active (default: true)
 *
 * @example
 * // Basic usage
 * useTxCompletedListener(() => {
 *   refetchPositions();
 * });
 *
 * @example
 * // With multiple refetch calls
 * useTxCompletedListener(() => {
 *   refetchPositionsV1();
 *   refetchPositionsV2();
 * });
 *
 * @example
 * // Only active after initial load
 * useTxCompletedListener(
 *   () => refetchPositions(),
 *   hasLoadedOnce && marketsWithPositions.length > 0
 * );
 */
export function useTxCompletedListener(
  onTxCompleted: () => void,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const handler = () => {
      onTxCompleted();
    };

    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [onTxCompleted, enabled]);
}

/**
 * Hook to listen for transaction completion with a delay before triggering.
 * Useful when you need to wait for the transaction to be mined.
 *
 * @param onTxCompleted - Callback to run when a transaction completes
 * @param delayMs - Delay in milliseconds before calling the callback (default: 2000)
 * @param enabled - Whether the listener should be active (default: true)
 *
 * @example
 * useTxCompletedListenerDelayed(() => {
 *   refetchPositions();
 * }, 2000, hasLoadedOnce);
 */
export function useTxCompletedListenerDelayed(
  onTxCompleted: () => void,
  delayMs = 2000,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const handler = () => {
      setTimeout(() => {
        onTxCompleted();
      }, delayMs);
    };

    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [onTxCompleted, delayMs, enabled]);
}
