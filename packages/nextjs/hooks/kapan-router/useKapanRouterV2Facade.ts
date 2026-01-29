/**
 * KapanRouter V2 Facade Hook
 *
 * This is the main entry point that composes all the individual hooks
 * to provide backwards-compatible API for existing consumers.
 *
 * For new code, consider using the individual hooks directly:
 * - useTransactionBuilder: For building transaction instructions
 * - useTransactionExecutor: For executing transactions
 * - useAuthorizationManager: For authorization/deauthorization
 * - useTransactionNotifications: For notification handling
 */
import { useTransactionBuilder } from "./useTransactionBuilder";
import { useTransactionExecutor } from "./useTransactionExecutor";
import { useTransactionNotifications } from "./useTransactionNotifications";
import { type UseKapanRouterV2Options } from "./types";

/**
 * Hook for building and executing instructions on KapanRouter v2
 *
 * This is a facade that composes multiple focused hooks for backwards compatibility.
 */
export const useKapanRouterV2 = (options?: UseKapanRouterV2Options) => {
  // Transaction building
  const {
    buildDepositFlow,
    buildBorrowFlow,
    buildRepayFlow,
    buildRepayFlowAsync,
    buildWithdrawFlow,
    buildCollateralSwapFlow,
    buildMultiplyFlow,
    buildCloseWithCollateralFlow,
    buildDebtSwapFlow,
    createMoveBuilder,
  } = useTransactionBuilder(options);

  // Transaction execution
  const {
    simulateInstructions,
    executeInstructions,
    executeFlowWithApprovals,
    executeFlowBatchedIfPossible,
    buildFlowCalls,
    getAuthorizations,
    getDeauthorizations,
    sendCallsAsync,
    writeContract,
    routerContract,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isApproving,
    batchId,
    setBatchId,
    batchStatus,
    isBatchConfirmed,
    canDoAtomicBatch,
    isAnyConfirmed,
    setSuppressBatchNotifications,
    chainId,
    isBatchError,
    suppressBatchNotifications,
  } = useTransactionExecutor(options);

  // Transaction notifications
  useTransactionNotifications({
    chainId,
    isConfirmed,
    isBatchConfirmed,
    isBatchError,
    batchId,
    batchStatus,
    suppressBatchNotifications,
  });

  return {
    // Flow builders
    buildDepositFlow,
    buildBorrowFlow,
    buildRepayFlow,
    buildRepayFlowAsync,
    buildWithdrawFlow,
    buildCollateralSwapFlow,
    buildMultiplyFlow,
    buildCloseWithCollateralFlow,
    buildDebtSwapFlow,
    createMoveBuilder,
    // Simulation
    simulateInstructions,
    // Execution
    executeInstructions,
    executeFlowWithApprovals,
    executeFlowBatchedIfPossible,
    buildFlowCalls,
    // Authorization
    getAuthorizations,
    getDeauthorizations,
    // Wagmi hooks
    sendCallsAsync,
    setBatchId,
    setSuppressBatchNotifications,
    writeContract,
    // Contract info
    routerContract,
    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isApproving,
    // Batch state
    batchId,
    batchStatus,
    isBatchConfirmed,
    canDoAtomicBatch,
    // Combined state
    isAnyConfirmed,
  };
};
