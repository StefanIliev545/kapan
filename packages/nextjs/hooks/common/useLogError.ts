import { useEffect } from "react";

/**
 * Hook to log errors to the console when they occur.
 * Useful for logging query/fetch errors without cluttering component code.
 *
 * @param error - The error to log (or null/undefined if no error)
 * @param message - The message prefix for the log
 *
 * @example
 * const { data, error } = useQuery(...);
 * useLogError(error, "Error fetching user positions");
 *
 * @example
 * // With optional error
 * useLogError(positionsError, "Error fetching positions (part 1)");
 */
export function useLogError(
  error: Error | unknown | null | undefined,
  message: string
): void {
  useEffect(() => {
    if (error) {
      console.error(message, error);
    }
  }, [error, message]);
}

/**
 * Hook to log warnings to the console when a condition is met.
 *
 * @param condition - Whether to log the warning
 * @param message - The warning message
 * @param data - Optional data to include in the warning
 *
 * @example
 * useLogWarning(!isConnected, "Wallet not connected");
 */
export function useLogWarning(
  condition: boolean,
  message: string,
  data?: unknown
): void {
  useEffect(() => {
    if (condition) {
      if (data !== undefined) {
        console.warn(message, data);
      } else {
        console.warn(message);
      }
    }
  }, [condition, message, data]);
}
