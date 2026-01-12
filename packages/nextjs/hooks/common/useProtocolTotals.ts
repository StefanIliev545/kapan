import { useEffect } from "react";
import { useGlobalState } from "~~/services/store/store";

/**
 * Hook to set protocol totals in the global state.
 * Automatically updates when positions change.
 *
 * @param protocolName - The name of the protocol (e.g., "Aave", "Morpho")
 * @param totalSupplied - Total USD value of supplied positions
 * @param totalBorrowed - Total USD value of borrowed positions
 * @param enabled - Whether to update the totals (default: true)
 *
 * @example
 * // Basic usage
 * const totalSupplied = positions.reduce((sum, p) => sum + p.suppliedUsd, 0);
 * const totalBorrowed = positions.reduce((sum, p) => sum + p.borrowedUsd, 0);
 * useProtocolTotals("Aave", totalSupplied, totalBorrowed, hasLoadedOnce);
 *
 * @example
 * // Wait for data to be ready
 * useProtocolTotals(
 *   "Morpho",
 *   totalSupplied,
 *   totalBorrowed,
 *   hasLoadedOnce && !isLoading
 * );
 */
export function useProtocolTotals(
  protocolName: string,
  totalSupplied: number,
  totalBorrowed: number,
  enabled = true
): void {
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!enabled) return;
    setProtocolTotals(protocolName, totalSupplied, totalBorrowed);
  }, [protocolName, totalSupplied, totalBorrowed, enabled, setProtocolTotals]);
}

/**
 * Hook to calculate and set protocol totals from position arrays.
 *
 * @param protocolName - The name of the protocol
 * @param suppliedPositions - Array of supplied positions with balance property
 * @param borrowedPositions - Array of borrowed positions with balance property
 * @param enabled - Whether to update the totals
 *
 * @example
 * useProtocolTotalsFromPositions(
 *   "Venus",
 *   filteredSuppliedPositions,
 *   filteredBorrowedPositions,
 *   hasLoadedOnce
 * );
 */
export function useProtocolTotalsFromPositions<
  T extends { balance: number }
>(
  protocolName: string,
  suppliedPositions: T[],
  borrowedPositions: T[],
  enabled = true
): void {
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (!enabled) return;

    const totalSupplied = suppliedPositions.reduce((sum, p) => sum + p.balance, 0);
    const totalBorrowed = borrowedPositions.reduce(
      (sum, p) => sum + (p.balance < 0 ? -p.balance : 0),
      0
    );

    setProtocolTotals(protocolName, totalSupplied, totalBorrowed);
  }, [protocolName, suppliedPositions, borrowedPositions, enabled, setProtocolTotals]);
}
