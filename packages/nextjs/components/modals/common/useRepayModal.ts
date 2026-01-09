import { useMemo } from "react";
import { formatUnits } from "viem";
import type { TokenInfo } from "../TokenActionModal";

/**
 * Common configuration for repay modal props passed to TokenActionModal.
 * This ensures consistency between EVM and Starknet implementations.
 */
export const REPAY_MODAL_CONFIG = {
  action: "Repay" as const,
  apyLabel: "Borrow APY",
  metricLabel: "Total debt",
} as const;

export interface UseRepayModalParams {
  /** Token information including address, name, icon, and decimals */
  token: TokenInfo;
  /** Current debt balance in the protocol (raw bigint value) */
  debtBalance: bigint;
  /** User's wallet balance of the token (raw bigint value) */
  walletBalance: bigint;
  /** Decimals for the token (from hook or token info) */
  decimals: number | undefined;
}

export interface UseRepayModalResult {
  /** The "before" metric value for displaying current debt in human-readable form */
  before: number;
  /** Maximum amount user can input (min of wallet balance and 101% of debt) */
  maxInput: bigint;
  /** The bumped debt value (101% of current debt) for max repay buffer */
  bumpedDebt: bigint;
  /** Effective decimals to use (with fallback to 18) */
  effectiveDecimals: number;
}

/**
 * Shared hook that computes common values for Repay modals across EVM and Starknet.
 *
 * This hook extracts the duplicated calculation logic that exists in both
 * RepayModal.tsx and RepayModalStark.tsx, including:
 * - Converting debt balance to human-readable "before" value
 * - Computing the 101% "bump" for max repay buffer
 * - Determining the max input based on wallet balance vs debt
 *
 * @example
 * ```tsx
 * const { before, maxInput, effectiveDecimals } = useRepayModal({
 *   token,
 *   debtBalance,
 *   walletBalance,
 *   decimals,
 * });
 * ```
 */
export const useRepayModal = ({
  token,
  debtBalance,
  walletBalance,
  decimals,
}: UseRepayModalParams): UseRepayModalResult => {
  // Determine effective decimals with fallback chain
  const effectiveDecimals = decimals ?? token.decimals ?? 18;

  // Calculate the "before" value (current debt in human-readable form)
  const before = useMemo(() => {
    return effectiveDecimals ? Number(formatUnits(debtBalance, effectiveDecimals)) : 0;
  }, [debtBalance, effectiveDecimals]);

  // Calculate the 101% bump for max repay buffer
  // This allows users to repay slightly more than shown debt to account for accruing interest
  const bumpedDebt = useMemo(() => {
    return (debtBalance * 101n) / 100n;
  }, [debtBalance]);

  // Maximum input is constrained by wallet balance or the bumped debt (whichever is lower)
  const maxInput = useMemo(() => {
    return walletBalance < bumpedDebt ? walletBalance : bumpedDebt;
  }, [walletBalance, bumpedDebt]);

  return {
    before,
    maxInput,
    bumpedDebt,
    effectiveDecimals,
  };
};

/**
 * Helper to ensure token decimals are set (mutates token object if decimals is null).
 * This mirrors the existing behavior in both modal implementations.
 *
 * Note: This mutates the token object for backwards compatibility with existing code.
 * Consider refactoring to avoid mutation in the future.
 */
export const ensureTokenDecimals = (token: TokenInfo, decimals: number | undefined): void => {
  if (token.decimals == null && decimals != null) {
    token.decimals = decimals;
  }
};
