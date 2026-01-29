/**
 * KapanRouter hooks - modular transaction building and execution
 *
 * Main entry point for all KapanRouter-related hooks and utilities.
 *
 * @example
 * ```typescript
 * // Use the full facade (backwards compatible)
 * import { useKapanRouterV2 } from "~~/hooks/kapan-router";
 *
 * // Or use individual hooks for more control
 * import {
 *   useTransactionBuilder,
 *   useTransactionExecutor,
 *   useAuthorizationManager,
 * } from "~~/hooks/kapan-router";
 * ```
 */

// Main facade hook
export { useKapanRouterV2 } from "./useKapanRouterV2Facade";

// Individual focused hooks
export { useTransactionBuilder } from "./useTransactionBuilder";
export type {
  BuildMultiplyFlowParams,
  BuildUnlockDebtParams,
  BuildMoveCollateralParams,
  BuildBorrowParams,
  MoveFlowBuilder,
} from "./useTransactionBuilder";

export { useTransactionExecutor } from "./useTransactionExecutor";

export { useAuthorizationManager } from "./useAuthorizationManager";

export {
  useTransactionNotifications,
  showPendingNotification,
  showSentNotification,
  showSuccessNotification,
  showErrorNotification,
} from "./useTransactionNotifications";

// Types and utilities
export type {
  AuthorizationCall,
  UseKapanRouterV2Options,
} from "./types";

export {
  DEAUTH_ABI,
  APPROVE_SELECTOR,
  CONFIRMATIONS_BY_CHAIN,
  OP_STACK_FAST_CHAINS,
  DEAUTH_DISABLED_CHAINS,
  AAVE_FEE_BUFFER_BPS,
  isZeroAmountApproval,
  isUserRejection,
  extractHexData,
  extractRevertData,
  formatExecutionError,
  shouldSkipAuthCall,
  shouldRevokeOnChain,
  filterValidAuthCalls,
  filterValidDeauthCalls,
  isDefinitelyNotApprovalRelated,
  isExpectedAuthError,
  formatSimulationError,
} from "./types";

// Re-export from instruction helpers for convenience
export type { ProtocolInstruction } from "~~/utils/v2/instructionHelpers";
export { LendingOp, FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
