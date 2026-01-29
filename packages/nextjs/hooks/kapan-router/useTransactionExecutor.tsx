/**
 * Hook for executing transactions on KapanRouter v2
 *
 * Handles:
 * - executeInstructions: Execute router instructions directly
 * - executeSingleApproval: Execute a single approval transaction
 * - executeSingleDeauth: Execute a single deauthorization transaction
 * - executeApprovalsSequentially: Execute multiple approvals sequentially
 * - executeDeauthsSequentially: Execute multiple deauthorizations sequentially
 * - buildAtomicBatchCalls: Build calls for atomic batch execution
 * - executeFlowWithApprovals: Execute a flow with automatic approval handling
 * - executeFlowBatchedIfPossible: Execute a flow with batching when supported
 * - buildFlowCalls: Build all calls for a flow (for external batching)
 * - simulateInstructions: Simulate instructions before execution
 */
import { useCallback, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useWalletClient,
  useChainId,
  useSendCalls,
  useWaitForCallsStatus,
  useCapabilities
} from "wagmi";
import {
  decodeAbiParameters,
  encodeFunctionData,
  type Address,
  type Hex
} from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { simulateTransaction, formatErrorForDisplay } from "~~/utils/errorDecoder";
import { logger } from "~~/utils/logger";
import { LendingOp, type ProtocolInstruction } from "~~/utils/v2/instructionHelpers";
import { useAuthorizationManager } from "./useAuthorizationManager";
import {
  type AuthorizationCall,
  type UseKapanRouterV2Options,
  CONFIRMATIONS_BY_CHAIN,
  filterValidAuthCalls,
  filterValidDeauthCalls,
  shouldRevokeOnChain,
  formatExecutionError,
  isDefinitelyNotApprovalRelated,
  isExpectedAuthError,
  formatSimulationError,
} from "./types";

/**
 * Hook for executing transactions
 */
export const useTransactionExecutor = (options?: UseKapanRouterV2Options) => {
  const { address: userAddress } = useAccount();
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });
  const walletChainId = useChainId();
  // Use provided chainId or fall back to wallet's chainId
  const chainId = options?.chainId ?? walletChainId;
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });

  const effectiveConfirmations = CONFIRMATIONS_BY_CHAIN[chainId] ?? 1;

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    confirmations: effectiveConfirmations,
    pollingInterval: 1000,
  });

  const [isApproving, setIsApproving] = useState(false);
  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  // When true, the hook won't show notifications - caller handles them
  const [suppressBatchNotifications, setSuppressBatchNotifications] = useState(false);

  // EIP-5792 capability detection (Atomic Batching)
  const { data: capabilities } = useCapabilities({ account: userAddress });
  const chainIdHex = `0x${chainId.toString(16)}`;
  const atomicStatus = (capabilities as Record<string, { atomic?: { status?: string } }> | undefined)?.[chainIdHex]?.atomic?.status as
    | "supported" | "ready" | "unsupported" | undefined;
  const canDoAtomicBatch = atomicStatus === "supported" || atomicStatus === "ready";

  // Batch execution hooks
  const { sendCallsAsync } = useSendCalls();
  const { data: batchStatus, isSuccess: isBatchConfirmed, isError: isBatchError } = useWaitForCallsStatus({
    id: batchId,
    query: { enabled: !!batchId },
  });

  // Note: Batch notifications are managed by useTransactionNotifications hook

  // Authorization manager
  const { getAuthorizations, getDeauthorizations } = useAuthorizationManager(options);

  // --- Simulation Helpers ---

  const isBasicLendingFlow = useCallback((instructions: ProtocolInstruction[]): boolean => {
    if (instructions.length === 0 || instructions.length > 4) return false;

    const BASIC_LENDING_OPS = new Set<number>([
      LendingOp.Deposit,
      LendingOp.DepositCollateral,
      LendingOp.WithdrawCollateral,
      LendingOp.Borrow,
      LendingOp.Repay,
      LendingOp.GetBorrowBalance,
      LendingOp.GetSupplyBalance,
    ]);

    return instructions.every(inst => {
      if (inst.protocolName === "router") return true;

      try {
        const [decoded] = decodeAbiParameters(
          [
            {
              type: "tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)",
            },
          ],
          inst.data as Hex
        ) as [{ op: bigint }];

        const op = Number(decoded.op);
        return BASIC_LENDING_OPS.has(op);
      } catch {
        return false;
      }
    });
  }, []);

  /**
   * Simulate authorization calls - log errors but don't throw for expected state errors
   * When using batched transactions, many auth calls are "enable if not enabled" which
   * may fail in isolated simulation but succeed in the actual batch
   */
  const simulateAuthCalls = useCallback(async (
    authCalls: AuthorizationCall[],
    client: NonNullable<typeof publicClient>,
    user: Address
  ): Promise<void> => {
    for (const { target, data } of authCalls) {
      if (!target || !data) continue;

      const authResult = await simulateTransaction(client, target as `0x${string}`, data, user as `0x${string}`);
      if (!authResult.success && authResult.error) {
        const formatted = formatErrorForDisplay(authResult.error);
        const errorText = `${formatted.description || ""} ${formatted.title || ""}`.toLowerCase();

        // Log the error but only throw if it's NOT an expected state-related error
        logger.info("[simulateAuthCalls] Auth call failed:", {
          target,
          error: formatted,
          isExpected: isExpectedAuthError(errorText),
        });

        if (!isExpectedAuthError(errorText)) {
          throw new Error(formatSimulationError(formatted));
        }
        // Otherwise continue - the actual batched tx will handle it
      }
    }
  }, []);

  /**
   * Handle router simulation result, considering whether auth calls will be bundled
   */
  const handleRouterSimulationResult = useCallback((
    simResult: { success: boolean; error?: any },
    authCallsExist: boolean
  ): void => {
    if (simResult.success || !simResult.error) return;

    const formatted = formatErrorForDisplay(simResult.error);
    const errorText = `${formatted.description || ""} ${formatted.title || ""}`.toLowerCase();

    logger.info("[handleRouterSimulationResult] Error detected:", {
      title: formatted.title,
      description: formatted.description,
      suggestion: formatted.suggestion,
      authCallsExist,
      isDefinitelyNotApprovalRelated: isDefinitelyNotApprovalRelated(errorText),
    });

    // When auth calls exist, only fail on errors that are definitely not approval-related
    if (authCallsExist && !isDefinitelyNotApprovalRelated(errorText)) {
      logger.info("Skipping simulation error because authorization calls will be bundled:", formatted);
      return;
    }

    throw new Error(formatSimulationError(formatted));
  }, []);

  /**
   * Simulate instructions before execution
   */
  const simulateInstructions = useCallback(
    async (instructions: ProtocolInstruction[], simOptions?: { skipWhenAuthCallsExist?: boolean }) => {
      if (!routerContract || !userAddress || !publicClient) {
        throw new Error("Router contract or user address not available");
      }

      // Skip simulation for simple lending flows to avoid false negatives on basic actions
      if (isBasicLendingFlow(instructions)) {
        logger.info("[simulateInstructions] Skipping - basic lending flow");
        return;
      }

      // Get authorization calls first - we need to know if batching will include approvals
      const authCalls = await getAuthorizations(instructions);
      logger.info("[simulateInstructions] Auth calls count:", authCalls.length);

      // Skip simulation when auth calls exist and caller requests it (for batched flows)
      if (simOptions?.skipWhenAuthCallsExist && authCalls.length > 0) {
        logger.info("Skipping simulation for batched flow with authorization calls");
        return;
      }

      // Simulate authorization calls to surface readable errors
      logger.info("[simulateInstructions] Simulating auth calls...");
      await simulateAuthCalls(authCalls, publicClient, userAddress as Address);
      logger.info("[simulateInstructions] Auth calls simulation passed");

      // Simulate the router call
      const protocolInstructions = instructions.map(inst => ({
        protocolName: inst.protocolName,
        data: inst.data as `0x${string}`,
      }));

      logger.info("[simulateInstructions] Simulating router call with", protocolInstructions.length, "instructions");

      const calldata = encodeFunctionData({
        abi: routerContract.abi,
        functionName: "processProtocolInstructions",
        args: [protocolInstructions],
      });

      const simResult = await simulateTransaction(
        publicClient,
        routerContract.address as `0x${string}`,
        calldata,
        userAddress as `0x${string}`
      );

      logger.info("[simulateInstructions] Router simulation result:", {
        success: simResult.success,
        hasError: !!simResult.error,
        error: simResult.error,
        rawError: (simResult as any).rawError,
      });

      handleRouterSimulationResult(simResult, authCalls.length > 0);
    },
    [routerContract, userAddress, publicClient, getAuthorizations, isBasicLendingFlow, simulateAuthCalls, handleRouterSimulationResult]
  );

  // --- Execution Helpers ---

  /**
   * Execute router instructions directly (no approval handling)
   */
  const executeInstructions = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress) {
      throw new Error("Router contract or user address not available");
    }

    let notificationId: string | number | null = null;
    let transactionHash: string | undefined = undefined;
    let blockExplorerTxURL = "";

    try {
      notificationId = notification.loading(
        <TransactionToast step="pending" message="Waiting for approval..." />
      );

      const pendingTimeout = setTimeout(() => {
        if (notificationId) {
          notification.remove(notificationId);
        }
      }, 10000);

      try {
        const protocolInstructions = instructions.map(inst => ({
          protocolName: inst.protocolName,
          data: inst.data as `0x${string}`,
        }));

        transactionHash = await writeContractAsync({
          address: routerContract.address as `0x${string}`,
          abi: routerContract.abi,
          functionName: "processProtocolInstructions",
          args: [protocolInstructions],
        });

        clearTimeout(pendingTimeout);
      } catch (error) {
        clearTimeout(pendingTimeout);
        throw error;
      }

      const clientChainId = await publicClient?.getChainId();
      blockExplorerTxURL = clientChainId ? getBlockExplorerTxLink(clientChainId, transactionHash as `0x${string}`) : "";

      if (notificationId) notification.remove(notificationId);
      notificationId = notification.loading(
        <TransactionToast
          step="sent"
          txHash={transactionHash}
          message="Waiting for transaction to complete."
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      if (publicClient && transactionHash) {
        await publicClient.waitForTransactionReceipt({
          hash: transactionHash as `0x${string}`,
          confirmations: effectiveConfirmations,
          pollingInterval: 1000,
        });
      }

      if (notificationId) notification.remove(notificationId);
      notification.success(
        <TransactionToast
          step="confirmed"
          txHash={transactionHash}
          message="Transaction completed successfully!"
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      return transactionHash;
    } catch (error: any) {
      if (notificationId) notification.remove(notificationId);
      console.error("Error executing instructions:", error);

      const message = formatExecutionError(error);

      notification.error(
        <TransactionToast
          step="failed"
          txHash={transactionHash}
          message={message}
          blockExplorerLink={blockExplorerTxURL}
        />
      );
      throw new Error(message);
    }
  }, [routerContract, userAddress, writeContractAsync, publicClient, effectiveConfirmations]);

  /**
   * Execute a single approval transaction with notifications
   */
  const executeSingleApproval = useCallback(async (
    authCall: AuthorizationCall
  ): Promise<void> => {
    if (!publicClient || !walletClient || !userAddress) return;

    const tokenAddress = authCall.target;
    let tokenSymbol = tokenAddress.substring(0, 6) + "...";
    try {
      tokenSymbol = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: "symbol",
        args: [],
      }) as string;
    } catch { /* Use truncated address as fallback */ }

    let approvalNotificationId: string | number | null = null;

    try {
      approvalNotificationId = notification.loading(
        <TransactionToast step="pending" message={`Approving ${tokenSymbol}...`} />
      );

      const currentNonce = await publicClient.getTransactionCount({
        address: userAddress as Address,
      });

      const approvalHash = await walletClient.sendTransaction({
        account: userAddress as Address,
        to: authCall.target,
        data: authCall.data,
        nonce: currentNonce,
      });

      notification.remove(approvalNotificationId);
      approvalNotificationId = notification.loading(
        <TransactionToast step="sent" txHash={approvalHash} message={`Approving ${tokenSymbol}...`} />
      );

      await publicClient.waitForTransactionReceipt({
        hash: approvalHash as `0x${string}`,
        confirmations: effectiveConfirmations,
        pollingInterval: 1000,
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      notification.remove(approvalNotificationId);
      notification.success(
        <TransactionToast step="confirmed" txHash={approvalHash} message={`${tokenSymbol} approved`} />
      );
    } catch (error) {
      if (approvalNotificationId) notification.remove(approvalNotificationId);
      throw error;
    }
  }, [publicClient, walletClient, userAddress, effectiveConfirmations]);

  /**
   * Execute a single deauthorization transaction with notifications
   */
  const executeSingleDeauth = useCallback(async (
    call: AuthorizationCall
  ): Promise<void> => {
    if (!publicClient || !walletClient || !userAddress) return;
    if (!call.target || !call.data) return;

    let deauthNotifId: string | number | null = null;

    try {
      deauthNotifId = notification.loading(
        <TransactionToast step="pending" message="Revoking permissions..." />
      );

      const currentNonce = await publicClient.getTransactionCount({
        address: userAddress as Address,
      });

      const txHash = await walletClient.sendTransaction({
        account: userAddress as Address,
        to: call.target,
        data: call.data,
        nonce: currentNonce,
      });

      notification.remove(deauthNotifId);
      deauthNotifId = notification.loading(
        <TransactionToast step="sent" txHash={txHash} message="Revoking permissions..." />
      );

      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: effectiveConfirmations,
        pollingInterval: 1000,
      });

      notification.remove(deauthNotifId);
      notification.success(
        <TransactionToast step="confirmed" txHash={txHash} message="Permissions revoked" />
      );
    } catch (e) {
      if (deauthNotifId) notification.remove(deauthNotifId);
      logger.warn("Deauth step failed", e);
    }
  }, [publicClient, walletClient, userAddress, effectiveConfirmations]);

  /**
   * Execute all approvals sequentially
   */
  const executeApprovalsSequentially = useCallback(async (
    authCalls: AuthorizationCall[]
  ): Promise<void> => {
    const validCalls = filterValidAuthCalls(authCalls);

    for (const authCall of validCalls) {
      setIsApproving(true);
      await executeSingleApproval(authCall);
      setIsApproving(false);
    }
  }, [executeSingleApproval]);

  /**
   * Execute all deauthorizations sequentially
   */
  const executeDeauthsSequentially = useCallback(async (
    deauthCalls: AuthorizationCall[]
  ): Promise<void> => {
    const validCalls = filterValidDeauthCalls(deauthCalls);

    for (const call of validCalls) {
      await executeSingleDeauth(call);
    }
  }, [executeSingleDeauth]);

  /**
   * Build atomic batch calls for router execution with optional deauthorizations
   */
  const buildAtomicBatchCalls = useCallback((
    instructions: ProtocolInstruction[],
    deauthCalls: AuthorizationCall[]
  ): { to: Address; data: Hex; value: bigint }[] => {
    if (!routerContract) return [];

    const mainCall = {
      to: routerContract.address as Address,
      data: encodeFunctionData({
        abi: routerContract.abi,
        functionName: "processProtocolInstructions",
        args: [instructions.map(inst => ({
          protocolName: inst.protocolName,
          data: inst.data as `0x${string}`,
        }))],
      }),
      value: 0n,
    };

    const deauthCallsFormatted = deauthCalls.map(call => ({
      to: call.target,
      data: call.data,
      value: 0n,
    }));

    return [mainCall, ...deauthCallsFormatted];
  }, [routerContract]);

  /**
   * Execute a flow with automatic approval handling
   */
  const executeFlowWithApprovals = useCallback(async (
    instructions: ProtocolInstruction[],
    execOptions?: { revokePermissions?: boolean }
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Context not available");
    }

    try {
      // 1. Calculate and execute authorizations
      const authCalls = await getAuthorizations(instructions);

      if (authCalls.length === 0) {
        return await executeInstructions(instructions);
      }

      await executeApprovalsSequentially(authCalls);

      // 2. Execute main logic (Atomic Batch if supported, else standard Tx)
      if (canDoAtomicBatch && sendCallsAsync) {
        const deauthCalls = execOptions?.revokePermissions
          ? await getDeauthorizations(instructions)
          : [];
        const calls = buildAtomicBatchCalls(instructions, deauthCalls);
        const { id } = await sendCallsAsync({ calls, capabilities });
        setBatchId(id);
        return id;
      }

      const txHash = await executeInstructions(instructions);

      // 3. Post-execution deauthorization (sequential, non-blocking)
      if (shouldRevokeOnChain(chainId, execOptions?.revokePermissions)) {
        try {
          const deauthCalls = await getDeauthorizations(instructions);
          await executeDeauthsSequentially(deauthCalls);
        } catch (e) {
          logger.warn("Deauthorization check failed", e);
        }
      }

      return txHash;
    } catch (error: any) {
      setIsApproving(false);
      console.error("Error in executeFlowWithApprovals:", error);
      throw error;
    }
  }, [
    routerContract,
    userAddress,
    publicClient,
    walletClient,
    getAuthorizations,
    executeInstructions,
    executeApprovalsSequentially,
    canDoAtomicBatch,
    sendCallsAsync,
    capabilities,
    buildAtomicBatchCalls,
    getDeauthorizations,
    executeDeauthsSequentially,
    chainId,
  ]);

  /**
   * Build router calldata for processing instructions
   */
  const buildRouterCalldata = useCallback((
    instructions: ProtocolInstruction[]
  ): Hex => {
    if (!routerContract) throw new Error("Router contract not available");

    const protocolInstructions = instructions.map(inst => ({
      protocolName: inst.protocolName,
      data: inst.data as `0x${string}`,
    }));

    return encodeFunctionData({
      abi: routerContract.abi,
      functionName: "processProtocolInstructions",
      args: [protocolInstructions],
    });
  }, [routerContract]);

  /**
   * Build all calls for a flow (for batching with other calls)
   * Returns array of { to, data } ready for sendCallsAsync
   */
  const buildFlowCalls = useCallback(async (
    instructions: ProtocolInstruction[],
    buildOptions?: { revokePermissions?: boolean }
  ): Promise<{ to: Address; data: Hex }[]> => {
    if (!routerContract || !userAddress) {
      throw new Error("Missing context");
    }

    const routerCalldata = buildRouterCalldata(instructions);

    const authCalls = await getAuthorizations(instructions);
    const filteredAuthCalls = filterValidAuthCalls(authCalls);

    const deauthCalls = shouldRevokeOnChain(chainId, buildOptions?.revokePermissions)
      ? await getDeauthorizations(instructions)
      : [];
    const filteredDeauthCalls = filterValidDeauthCalls(deauthCalls);

    return [
      ...filteredAuthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
      { to: routerContract.address as Address, data: routerCalldata as Hex },
      ...filteredDeauthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
    ];
  }, [routerContract, userAddress, buildRouterCalldata, getAuthorizations, getDeauthorizations, chainId]);

  /**
   * Execute a flow with batching when supported
   */
  const executeFlowBatchedIfPossible = useCallback(async (
    instructions: ProtocolInstruction[],
    preferBatching = false,
    execOptions?: { revokePermissions?: boolean }
  ): Promise<{ kind: "batch", id: string } | { kind: "tx", hash: string } | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Missing context");
    }

    const routerCalldata = buildRouterCalldata(instructions);

    const authCalls = await getAuthorizations(instructions);
    const filteredAuthCalls = filterValidAuthCalls(authCalls);

    const deauthCalls = shouldRevokeOnChain(chainId, execOptions?.revokePermissions)
      ? await getDeauthorizations(instructions)
      : [];
    const filteredDeauthCalls = filterValidDeauthCalls(deauthCalls);

    const calls = [
      ...filteredAuthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
      { to: routerContract.address as Address, data: routerCalldata as Hex },
      ...filteredDeauthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
    ];

    logger.info("[executeFlowBatchedIfPossible] Call order:", {
      authCallsCount: filteredAuthCalls.length,
      authCalls: filteredAuthCalls.map(c => ({ to: c.target, dataPrefix: c.data?.slice(0, 10) })),
      mainCall: { to: routerContract.address, dataPrefix: routerCalldata.slice(0, 10) },
      deauthCallsCount: filteredDeauthCalls.length,
      totalCalls: calls.length,
      callOrder: calls.map((c, i) => ({ index: i, to: c.to, dataPrefix: c.data?.slice(0, 10) })),
    });

    // Single comprehensive debug log for batched execution
    const selectorNames: Record<string, string> = {
      "0xb3fdb079": "setAccountOperator",
      "0xd1e8f606": "enableCollateral",
      "0x2edb71be": "enableController",
    };
    console.log("[executeFlowBatchedIfPossible] === COMPLETE DEBUG INFO ===", JSON.stringify({
      user: userAddress,
      router: routerContract.address,
      authCalls: filteredAuthCalls.map((c, i) => ({
        idx: i, to: c.target, selector: c.data?.slice(0, 10),
        method: selectorNames[c.data?.slice(0, 10) || ""] || "unknown",
        data: c.data,
      })),
      mainCall: { to: routerContract.address, data: routerCalldata },
      deauthCalls: filteredDeauthCalls.map((c, i) => ({
        idx: i, to: c.target, selector: c.data?.slice(0, 10), data: c.data,
      })),
      allCalls: calls.map((c, i) => ({ idx: i, to: c.to, data: c.data })),
      totalCalls: calls.length,
    }, null, 2));

    if (preferBatching) {
      const { id } = await sendCallsAsync({
        calls,
        experimental_fallback: true,
      });

      setBatchId(id);
      // Note: Notification is handled by useTransactionNotifications when batchId changes
      // Don't create a duplicate notification here

      return { kind: "batch", id };
    }

    const txHash = await executeFlowWithApprovals(instructions, execOptions);
    return txHash ? { kind: "tx", hash: txHash } : undefined;
  }, [routerContract, userAddress, publicClient, walletClient, buildRouterCalldata, getAuthorizations, sendCallsAsync, executeFlowWithApprovals, getDeauthorizations, chainId]);

  const isAnyConfirmed = isConfirmed || isBatchConfirmed;

  return {
    // Simulation
    simulateInstructions,
    // Execution
    executeInstructions,
    executeFlowWithApprovals,
    executeFlowBatchedIfPossible,
    buildFlowCalls,
    // Building
    buildRouterCalldata,
    buildAtomicBatchCalls,
    // Authorization
    getAuthorizations,
    getDeauthorizations,
    // Low-level execution
    executeSingleApproval,
    executeSingleDeauth,
    executeApprovalsSequentially,
    executeDeauthsSequentially,
    // Wagmi hooks
    sendCallsAsync,
    writeContract,
    writeContractAsync,
    // State
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
    isBatchError,
    canDoAtomicBatch,
    isAnyConfirmed,
    suppressBatchNotifications,
    setSuppressBatchNotifications,
    chainId,
    effectiveConfirmations,
    capabilities,
  };
};
