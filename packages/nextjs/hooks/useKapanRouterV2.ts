import { useCallback, useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient, useChainId, useSendCalls, useWaitForCallsStatus, useCapabilities } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, decodeAbiParameters, encodeAbiParameters, decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import {
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeLendingInstruction,
  encodeFlashLoan,
  FlashLoanProvider,
  LendingOp,
  normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { ERC20ABI } from "~~/contracts/externalContracts";

/**
 * Interface for authorization calls returned by authorizeInstructions
 */
interface AuthorizationCall {
  target: Address;
  data: `0x${string}`;
}

const APPROVE_SELECTOR = "0x095ea7b3";

const isZeroAmountApproval = (data: `0x${string}` | undefined): boolean => {
  if (!data || data === "0x" || data.length < 10) {
    return false;
  }

  try {
    const decoded = decodeFunctionData({ abi: ERC20ABI, data: data as Hex });
    if (decoded.functionName === "approve") {
      const amount = decoded.args?.[1] as bigint | undefined;
      return amount === 0n;
    }
    return false;
  } catch {
    try {
      const selector = data.slice(0, 10).toLowerCase();
      if (selector !== APPROVE_SELECTOR) {
        return false;
      }

      const [, amount] = decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        data.slice(10) as `0x${string}`
      );

      return (amount as bigint) === 0n;
    } catch {
      return false;
    }
  }
};

/**
 * Hook for building and executing instructions on KapanRouter v2
 * 
 * This hook provides utilities to:
 * - Build instruction sequences (deposit, borrow, repay, withdraw)
 * - Get authorizations required for the instructions
 * - Execute the instructions on the router with automatic approval handling
 * - Handle max amount scenarios for withdrawals and repayments
 */
export const useKapanRouterV2 = () => {
  const { address: userAddress } = useAccount();
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const chainId = useChainId();
  
  // Confirmation count per chain
  // Base and Optimism (OpStack chains) use 2 confirmations for safety
  // Arbitrum and Linea use 1 confirmation for faster UX
  // Default to 1 for other chains
  const CONFIRMATIONS_BY_CHAIN: Record<number, number> = {
    8453: 2,   // Base mainnet
    84531: 2,  // Base Sepolia
    84532: 2,  // Base Sepolia (alternative)
    10: 2,     // Optimism mainnet
    420: 2,    // Optimism Goerli
    11155420: 2, // Optimism Sepolia
    42161: 0,  // Arbitrum One
    421614: 1, // Arbitrum Sepolia
    59144: 0,  // Linea mainnet
    59141: 1,  // Linea Sepolia
  };
  
  const effectiveConfirmations = CONFIRMATIONS_BY_CHAIN[chainId] ?? 1;
  // Approvals are executed sequentially via the user's wallet. Waiting for
  // the full safety margin of confirmations between each approval made the
  // UX feel sluggish on chains where we target two confirmations (Base/Optimism).
  // Only wait for a single confirmation before prompting the next approval
  // while still respecting chains that can settle instantly (Arbitrum/Linea).
  const sequentialConfirmations = effectiveConfirmations > 1 ? 1 : effectiveConfirmations;

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    confirmations: effectiveConfirmations,
  });

  const refreshConfirmations = effectiveConfirmations > 1 ? 1 : effectiveConfirmations;
  const { isSuccess: isRefreshConfirmed } = useWaitForTransactionReceipt({
    hash,
    confirmations: refreshConfirmations,
    query: { enabled: !!hash },
  });

  const [isApproving, setIsApproving] = useState(false);
  const [batchId, setBatchId] = useState<string | undefined>(undefined);

  // EIP-5792 capability detection for atomic batching
  const { data: capabilities } = useCapabilities({ account: userAddress });
  const chainIdHex = `0x${chainId.toString(16)}`;
  const atomicStatus = (capabilities as Record<string, { atomic?: { status?: string } }> | undefined)?.[chainIdHex]?.atomic?.status as
    | "supported" | "ready" | "unsupported" | undefined;
  const canDoAtomicBatch = atomicStatus === "supported" || atomicStatus === "ready";

  // Batch execution hooks
  const { sendCallsAsync } = useSendCalls();
  const { data: batchStatus, isSuccess: isBatchConfirmed } = useWaitForCallsStatus({
    id: batchId,
    query: { enabled: !!batchId },
  });

  // Refresh Wagmi queries when transaction completes (both single tx and batch)
  useEffect(() => {
    const complete = isRefreshConfirmed || isBatchConfirmed;
    if (!complete) return;

    Promise.all([
      queryClient.refetchQueries({ queryKey: ['readContract'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['readContracts'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['balance'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['token'], type: 'active' }),
    ]).catch(e => console.warn("Post-tx refetch err:", e));

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("txCompleted"));
    }
  }, [isRefreshConfirmed, isBatchConfirmed, queryClient]);

  /**
   * Helper to encode Compound market context
   * Context format: abi.encode(address marketBaseToken)
   */
  const encodeCompoundMarket = useCallback((marketAddress: Address): `0x${string}` => {
    return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
  }, []);

  /**
   * Build a basic deposit flow: PullToken -> Approve -> Deposit
   * @param protocolName - Protocol to deposit to (e.g., "aave", "compound", "venus")
   * @param tokenAddress - Token address to deposit
   * @param amount - Amount to deposit (as string, e.g., "100.5")
   * @param decimals - Token decimals (default: 18)
   * @param market - Market address for Compound (baseToken/comet address). Required for Compound collateral deposits.
   */
  const buildDepositFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    market?: Address
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);
    
    // For Compound, use DepositCollateral and encode market context
    const isCompound = normalizedProtocol === "compound";
    const lendingOp = isCompound ? LendingOp.DepositCollateral : LendingOp.Deposit;
    const context = isCompound && market ? encodeCompoundMarket(market) : "0x";

    return [
      // Pull tokens from user to router
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0] = pulled tokens)
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // Deposit tokens (uses UTXO[0] as input)
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(lendingOp, tokenAddress, userAddress, 0n, context, 0)
      ),
    ];
  }, [userAddress, encodeCompoundMarket]);

  /**
   * Build a basic borrow flow: Borrow -> PushToken
   * @param protocolName - Protocol to borrow from
   * @param tokenAddress - Token address to borrow
   * @param amount - Amount to borrow (as string)
   * @param decimals - Token decimals (default: 18)
   */
  const buildBorrowFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);

    return [
      // Borrow tokens (creates UTXO[0] with borrowed tokens)
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, tokenAddress, userAddress, amountBigInt, "0x", 999)
      ),
      // Push borrowed tokens to user (UTXO[0])
      createRouterInstruction(encodePushToken(0, userAddress)),
    ];
  }, [userAddress]);

  /**
   * Build a basic repay flow: PullToken -> Approve -> Repay
   * @param protocolName - Protocol to repay to
   * @param tokenAddress - Token address to repay
   * @param amount - Amount to repay (as string). Use "max" or MaxUint256 string for full repayment
   * @param decimals - Token decimals (default: 18)
   * @param isMax - Whether to repay the maximum debt (uses MaxUint256 sentinel for repay instruction)
   */
  const buildRepayFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    // NEVER use MaxUint256 for PullToken - it will always revert!
    // Use buildRepayFlowAsync for max repayments to safely read wallet balance
    if (isMax || amount.toLowerCase() === "max") {
      console.warn("buildRepayFlow: isMax=true is deprecated. Use buildRepayFlowAsync instead.");
      return []; // Return empty to prevent invalid flow
    }

    const amountBigInt = parseUnits(amount, decimals);

    // UTXO sequence:
    // 0: PullToken creates UTXO[0] with pulled tokens
    // 1: Approve creates UTXO[1] (dummy zero output to maintain index alignment)
    // 2: Repay consumes UTXO[0], creates UTXO[2] with refund (if any)
    // So refund is at index 2, not 1!
    return [
      // Pull tokens from user to router (creates UTXO[0] with pulled tokens)
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0])
      // This creates UTXO[1] (dummy zero output)
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // Repay debt (uses UTXO[0] as input, creates UTXO[2] with refund if any)
      // Gateway will use UTXO[0].token and UTXO[0].amount when inputIndex < inputs.length
      // The amount parameter (0n) is ignored when inputIndex is used
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, 0n, "0x", 0)
      ),
      // Push refund to user if any (UTXO[2] contains refund from repay)
      createRouterInstruction(encodePushToken(2, userAddress)),
    ];
  }, [userAddress]);

  /**
   * Build a repay flow with async wallet balance check for max repayments
   * This safely handles "max" repayments by reading the user's wallet balance instead of using MaxUint256
   * @param protocolName - Protocol to repay to
   * @param tokenAddress - Token address to repay
   * @param amount - Amount to repay (as string) or "max" for full wallet balance
   * @param decimals - Token decimals (default: 18)
   * @param isMax - Whether to repay maximum (uses wallet balance, not MaxUint256)
   */
  const buildRepayFlowAsync = useCallback(async (
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false
  ): Promise<ProtocolInstruction[]> => {
    if (!userAddress || !publicClient) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);

    // For max repayments, pull 1% more than wallet balance to account for interest accrual
    // during transaction travel. GetBorrowBalance will provide the exact debt amount.
    let pullAmount: bigint;
    if (isMax || amount.toLowerCase() === "max") {
      // For max repayments, pull 1% more to account for interest accrual/variation
      pullAmount = (parseUnits(amount, decimals) * 101n) / 100n;
    } else {
      pullAmount = parseUnits(amount, decimals);
    }

    // UTXO sequence:
    // 0: PullToken creates UTXO[0] with pulled tokens (wallet balance * 1.01)
    // 1: Approve creates UTXO[1] (dummy zero output to maintain index alignment)
    // 2: GetBorrowBalance creates UTXO[2] with exact debt amount
    // 3: Repay consumes UTXO[0] (or UTXO[2] for max), creates UTXO[3] with refund (if any)
    // So refund is at index 3!
    return [
      // Pull tokens from user to router (wallet balance * 1.01 for max repayments)
      createRouterInstruction(encodePullToken(pullAmount, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0])
      // This creates UTXO[1] (dummy zero output)
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // Get exact borrow balance (creates UTXO[2] with current debt amount)
      // This ensures we repay exactly what's owed, accounting for interest accrual
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.GetBorrowBalance, tokenAddress, userAddress, 0n, "0x", 999)
      ),
      // Repay debt:
      // - For max: uses UTXO[2] (GetBorrowBalance output) for exact debt amount
      // - For regular: uses UTXO[0] (pulled amount) for specified amount
      // Creates UTXO[3] with refund (if pulled amount > debt amount)
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, 0n, "0x", isMax ? 2 : 0)
      ),
      // Push refund to user if any (UTXO[3] contains refund from repay)
      createRouterInstruction(encodePushToken(3, userAddress)),
    ];
  }, [userAddress, publicClient]);

  /**
   * Build a basic withdraw flow: Withdraw -> PushToken
   * @param protocolName - Protocol to withdraw from
   * @param tokenAddress - Token address to withdraw
   * @param amount - Amount to withdraw (as string). Use "max" or MaxUint256 string for full withdrawal
   * @param decimals - Token decimals (default: 18)
   * @param isMax - Whether to withdraw the maximum available amount (uses MaxUint256 sentinel)
   * @param market - Market address for Compound (baseToken/comet address). Required for Compound collateral withdrawals.
   */
  const buildWithdrawFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false,
    market?: Address
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    // For max withdrawals, use MaxUint256 as a sentinel value
    // The protocol will withdraw all available including accrued interest
    const amountBigInt = isMax || amount.toLowerCase() === "max" 
      ? (2n ** 256n - 1n) // MaxUint256
      : parseUnits(amount, decimals);

    // For Compound, encode market context
    const isCompound = normalizedProtocol === "compound";
    const context = isCompound && market ? encodeCompoundMarket(market) : "0x";

    return [
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.GetSupplyBalance, tokenAddress, userAddress, 0n, context, 0)
      ),
      // Withdraw collateral (creates UTXO[0] with withdrawn tokens)
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, tokenAddress, userAddress, amountBigInt, context, isMax ? 0 : 999)
      ),
      // Push withdrawn tokens to user (UTXO[0])
      createRouterInstruction(encodePushToken(1, userAddress)),
    ];
  }, [userAddress, encodeCompoundMarket]);

  /**
   * Get authorization calls required for a set of instructions
   * Uses the router's authorizeInstructions function which aggregates both router and gateway authorizations
   */
  const getAuthorizations = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<AuthorizationCall[]> => {
    if (!routerContract || !userAddress || !publicClient) {
      console.warn("getAuthorizations: Missing required dependencies", { routerContract: !!routerContract, userAddress: !!userAddress, publicClient: !!publicClient });
      return [];
    }

    console.log("getAuthorizations: Starting", { instructionCount: instructions.length });
    console.log("getAuthorizations: Instructions", instructions.map(inst => ({
      protocolName: inst.protocolName,
      dataLength: inst.data.length,
    })));

    try {
      // Convert instructions to the format expected by the contract
      // Protocol names should already be normalized from build*Flow functions,
      // but normalize again here as a safety measure
      const protocolInstructions = instructions.map(inst => {
        const normalizedName = normalizeProtocolName(inst.protocolName);
        if (inst.protocolName !== normalizedName) {
          console.log(`getAuthorizations: Normalizing "${inst.protocolName}" -> "${normalizedName}"`);
        }
        return {
          protocolName: normalizedName,
          data: inst.data as `0x${string}`,
        };
      });

      // Call the router's authorizeInstructions function which aggregates all authorizations
      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "authorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
      });
      const [targets, data] = result as unknown as [Address[], `0x${string}`[]];

      // Combine targets and data into AuthorizationCall array, filtering out empty ones
      const authCalls: AuthorizationCall[] = [];
      console.log(`getAuthorizations: Received ${targets.length} authorization(s) from router`);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const dataItem = data[i];
        const isValid = target && target !== "0x0000000000000000000000000000000000000000" && dataItem && dataItem.length > 0;
        console.log(`getAuthorizations: Auth ${i} - target: ${target}, dataLength: ${dataItem?.length || 0}, valid: ${isValid}`);
        if (isValid) {
          authCalls.push({
            target: target,
            data: dataItem,
          });
        }
      }

      console.log(`getAuthorizations: Complete. Total valid authorizations: ${authCalls.length}`);
      return authCalls;
    } catch (error) {
      console.error("Error calling authorizeInstructions:", error);
      return [];
    }
  }, [routerContract, userAddress, publicClient]);

  /**
   * Execute a sequence of instructions on the router
   * @param instructions - Array of ProtocolInstructions to execute
   */
  const executeInstructions = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress) {
      throw new Error("Router contract or user address not available");
    }

    try {
      // Convert instructions to the format expected by the contract
      const protocolInstructions = instructions.map(inst => ({
        protocolName: inst.protocolName,
        data: inst.data as `0x${string}`,
      }));

      const hash = await writeContractAsync({
        address: routerContract.address as `0x${string}`,
        abi: routerContract.abi,
        functionName: "processProtocolInstructions",
        args: [protocolInstructions],
      });

      return hash;
    } catch (error: any) {
      console.error("Error executing instructions:", error);
      // Check for user rejection
      const errorMessage = error?.message || "";
      const lowerMessage = errorMessage.toLowerCase();
      const isRejection = 
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("user denied") ||
        lowerMessage.includes("user cancelled") ||
        lowerMessage.includes("rejected") ||
        lowerMessage.includes("denied") ||
        lowerMessage.includes("cancelled") ||
        error?.code === 4001 ||
        error?.code === "ACTION_REJECTED" ||
        error?.code === "USER_REJECTED";
      
      const message = isRejection ? "User rejected the request" : (error.message || "Failed to execute instructions");
      notification.error(message);
      throw error;
    }
  }, [routerContract, userAddress, writeContractAsync]);

  /**
   * Execute instructions with automatic approval handling
   * This ensures all required token approvals are in place before executing the router call.
   * For mobile wallets, approvals are executed sequentially and we wait for each confirmation.
   * Uses the router's authorizeInstructions function which aggregates both router and gateway authorizations
   * and returns already encoded approval calls.
   * 
   * @param instructions - Array of ProtocolInstructions to execute
   */
  const executeFlowWithApprovals = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Router contract, user address, public client, or wallet client not available");
    }

    try {
      // 1. Get authorization calls from the router's authorizeInstructions function
      // This aggregates both router and gateway authorizations and returns already encoded approval calls (targets and data)
      console.log("executeFlowWithApprovals: Getting authorizations...");
      const authCalls = await getAuthorizations(instructions);

      console.log(`executeFlowWithApprovals: Found ${authCalls.length} authorization(s) required`);

      if (authCalls.length === 0) {
        // No approvals needed, proceed directly to execution
        console.log("executeFlowWithApprovals: No approvals needed, executing directly");
        notification.info("Executing transaction...");
        return await executeInstructions(instructions);
      }

      // 2. Execute approval calls sequentially (important for mobile wallets)
      // The router provides already encoded calldata - we just send it directly
      console.log(`executeFlowWithApprovals: Executing ${authCalls.length} approval(s) sequentially...`);

      const approvalPlans: Array<{ target: Address; data: Hex; tokenSymbol: string }> = [];

      for (let i = 0; i < authCalls.length; i++) {
        const authCall = authCalls[i];
        if (!authCall.target || !authCall.data || authCall.data.length === 0) {
          console.warn(`executeFlowWithApprovals: Skipping invalid auth call ${i}`, authCall);
          continue; // Skip invalid auth calls
        }

        if (isZeroAmountApproval(authCall.data)) {
          console.warn(`executeFlowWithApprovals: Skipping zero-amount approval for token ${authCall.target}`);
          continue; // Skip zero-amount approvals
        }

        const tokenAddress = authCall.target;
        let tokenSymbol = tokenAddress.substring(0, 6) + "...";
        try {
          tokenSymbol = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20ABI,
            functionName: "symbol",
            args: [],
          }) as string;
        } catch {
          // If symbol read fails, use truncated address
        }

        approvalPlans.push({ target: tokenAddress, data: authCall.data as Hex, tokenSymbol });
      }

      if (approvalPlans.length > 0) {
        setIsApproving(true);
        const baseNonce = await publicClient.getTransactionCount({
          address: userAddress as Address,
          blockTag: "pending",
        });
        let nextNonce = baseNonce;
        const pendingApprovalWaits: Promise<void>[] = [];

        for (let i = 0; i < approvalPlans.length; i++) {
          const { target, data, tokenSymbol } = approvalPlans[i];

          console.log(`executeFlowWithApprovals: Processing approval ${i + 1}/${approvalPlans.length}`, {
            target,
            dataLength: data.length,
          });

          notification.info(`Approving ${tokenSymbol}...`);

          const approveHash = await walletClient.sendTransaction({
            account: userAddress as Address,
            to: target,
            data,
            nonce: nextNonce,
          });

          nextNonce += 1;

          const waitForApproval = publicClient
            .waitForTransactionReceipt({ hash: approveHash, confirmations: sequentialConfirmations })
            .then(receipt => {
              if (receipt.status === "reverted") {
                throw new Error(`Approval for ${tokenSymbol} reverted`);
              }
              notification.success(`${tokenSymbol} approved ✅`);
            });

          pendingApprovalWaits.push(waitForApproval);

          if (sequentialConfirmations > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        if (pendingApprovalWaits.length > 0) {
          notification.info("Waiting for approvals to finalize...");
          await Promise.all(pendingApprovalWaits);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        setIsApproving(false);
      }

      // 3. Execute the router instructions (now that approvals are in place)
      notification.info("Executing transaction...");
      const resultHash = await executeInstructions(instructions);
      return resultHash;
    } catch (error: any) {
      setIsApproving(false);
      console.error("Error in executeFlowWithApprovals:", error);
      // Check for user rejection
      const errorMessage = error?.message || "";
      const lowerMessage = errorMessage.toLowerCase();
      const isRejection = 
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("user denied") ||
        lowerMessage.includes("user cancelled") ||
        lowerMessage.includes("rejected") ||
        lowerMessage.includes("denied") ||
        lowerMessage.includes("cancelled") ||
        error?.code === 4001 ||
        error?.code === "ACTION_REJECTED" ||
        error?.code === "USER_REJECTED";
      
      const message = isRejection ? "User rejected the request" : (error.message || "Failed to execute flow with approvals");
      notification.error(message);
      throw error;
    }
  }, [routerContract, userAddress, publicClient, walletClient, getAuthorizations, executeInstructions, effectiveConfirmations]);

  /**
   * Execute instructions with atomic batching support (EIP-5792)
   * Attempts to batch all approvals + router call atomically if wallet supports it.
   * Falls back to sequential execution if batching is unavailable.
   * 
   * @param instructions - Array of ProtocolInstructions to execute
   * @returns Object indicating whether batch or sequential tx was used, with id/hash
   */
  const executeFlowBatchedIfPossible = useCallback(async (
    instructions: ProtocolInstruction[],
    preferBatching = false
  ): Promise<{ kind: "batch", id: string } | { kind: "tx", hash: string } | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Missing router/user/public/wallet context");
    }

    // 1) Final router calldata
    const protocolInstructions = instructions.map(inst => ({
      protocolName: inst.protocolName,
      data: inst.data as `0x${string}`,
    }));
    const routerCalldata = encodeFunctionData({
      abi: routerContract.abi,
      functionName: "processProtocolInstructions",
      args: [protocolInstructions],
    });

    // 2) Gather approvals (router aggregates them)
    const authCalls = await getAuthorizations(instructions);

    // 3) Filter zero-amount approvals (same logic as sequential path)
    const filteredAuthCalls = authCalls.filter(({ target, data }) => {
      if (!target || !data || data.length === 0) {
        return false;
      }

      if (isZeroAmountApproval(data)) {
        console.warn("executeFlowBatchedIfPossible: Skipping zero-amount approval", { target });
        return false;
      }

      return true;
    });

    // 4) Compose calls: filtered approvals… then router call
    const calls = [
      ...filteredAuthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
      { to: routerContract.address as Address, data: routerCalldata as Hex },
    ];

    // 5) Try atomic batch if preference is enabled and wallet supports it
    if (preferBatching) {
      try {
        const { id } = await sendCallsAsync({
          calls,
          experimental_fallback: true, // runs sequentially if wallet can't batch
        });

        setBatchId(id);
        notification.info("Batch sent — waiting for confirmation...", { duration: 2000});
        return { kind: "batch", id };
      } catch (err) {
        console.warn("Batch send failed, falling back:", err);
      }
    }


    // 6) Fallback: your existing sequential helper
    const hash = await executeFlowWithApprovals(instructions);
    return hash ? { kind: "tx", hash } : undefined;
  }, [routerContract, userAddress, publicClient, walletClient, getAuthorizations, sendCallsAsync, executeFlowWithApprovals]);

  // --- Types for modular move position builder ---
  type FlashConfig = {
    version: "v3" | "v2" | "aave";
    premiumBps?: number;
    bufferBps?: number;
  };

  type BuildUnlockDebtParams = {
    fromProtocol: string;
    debtToken: Address;
    expectedDebt: string;       // user-selected amount; used to size flash & later borrow
    debtDecimals?: number;
    fromContext?: `0x${string}`;
    flash: FlashConfig;
  };

  type BuildMoveCollateralParams = {
    fromProtocol: string;
    toProtocol: string;
    collateralToken: Address;
    withdraw: { max: true } | { amount: string };
    collateralDecimals?: number;
    fromContext?: `0x${string}`;
    toContext?: `0x${string}`;
  };

  type BuildBorrowParams =
    | {
        // Borrow an exact amount (generic)
        mode: "exact";
        toProtocol: string;
        token: Address;
        amount: string;
        decimals?: number;
        approveToRouter?: boolean; // default true
        toContext?: `0x${string}`;
      }
    | {
        // Borrow just enough to repay all flash obligations for this token
        mode: "coverFlash";
        toProtocol: string;
        token: Address;
        decimals?: number;
        extraBps?: number;        // extra headroom on top of premium-augmented need
        approveToRouter?: boolean; // default true
        toContext?: `0x${string}`;
      };

  type MoveFlowBuilder = {
    // chunk builders
    buildUnlockDebt: (p: BuildUnlockDebtParams) => void;
    buildMoveCollateral: (p: BuildMoveCollateralParams) => void;
    buildBorrow: (p: BuildBorrowParams) => void;
    // Compound-specific helpers
    setCompoundMarket: (debtToken: Address) => void;
    // raw accessors
    build: () => ProtocolInstruction[];
    getFlashObligations: () => Record<Address, { flashLoanUtxoIndex: number }>;
  };

  /**
   * Create a composable move-flow session builder.
   * Allows building unlock debt, move collateral, and borrow steps incrementally.
   * 
   * Usage:
   * ```typescript
   * const b = createMoveBuilder();
   * b.buildUnlockDebt({ fromProtocol: "Aave V3", debtToken: USDC, expectedDebt: "1000", ... });
   * b.buildMoveCollateral({ fromProtocol: "Aave V3", toProtocol: "Compound V3", ... });
   * b.buildBorrow({ mode: "coverFlash", toProtocol: "Compound V3", token: USDC, ... });
   * await executeFlowWithApprovals(b.build());
   * ```
   */
  const createMoveBuilder = useCallback((): MoveFlowBuilder => {
    if (!userAddress) {
      // Return a no-op builder; you can also throw if you prefer hard-fail
      const noOp = () => {
        // No-op: user address not available
      };
      return {
        buildUnlockDebt: noOp,
        buildMoveCollateral: noOp,
        buildBorrow: noOp,
        setCompoundMarket: noOp,
        build: () => [],
        getFlashObligations: () => ({}),
      };
    }

    const instructions: ProtocolInstruction[] = [];
    const flashLoanOutputs = new Map<Address, number>(); // Track flash loan output UTXO indices by token
    let compoundMarket: Address | null = null; // Track Compound market (debt token/base token)
    let utxoCount = 0; // Track UTXO count as we build instructions

    // Tiny helpers
    const add = (inst: ProtocolInstruction, createsUtxo = false) => {
      instructions.push(inst);
      if (createsUtxo) {
        utxoCount++;
      }
      return instructions.length - 1;
    };

    const addRouter = (data: `0x${string}`, createsUtxo = false) => add(createRouterInstruction(data), createsUtxo);
    const addProto = (protocol: string, data: `0x${string}`, createsUtxo = false) =>
      add(createProtocolInstruction(protocol, data), createsUtxo);

    /**
     * Get context for a protocol operation
     * For Compound, returns encoded market address if set
     */
    const getContext = (protocol: string, defaultContext: `0x${string}` = "0x"): `0x${string}` => {
      if (protocol === "compound" && compoundMarket) {
        return encodeCompoundMarket(compoundMarket);
      }
      return defaultContext;
    };

    const builder: MoveFlowBuilder = {
      // 1) UNLOCK DEBT (one call per debt asset you want to migrate)
      buildUnlockDebt: ({
        fromProtocol,
        debtToken,
        expectedDebt,
        debtDecimals = 18,
        fromContext = "0x",
        flash: { version },
      }) => {
        const from = normalizeProtocolName(fromProtocol);
        const expected = parseUnits(expectedDebt, debtDecimals);

        // Validate expected debt amount
        if (expected === 0n) {
          throw new Error(`Invalid debt amount: ${expectedDebt}. Cannot create flash loan with zero amount.`);
        }

        // [0] GetBorrowBalance(source) -> used as the *exact* repay amount
        // For Compound, use market context if fromProtocol is Compound
        const fromCtx = from === "compound" ? getContext(from, encodeCompoundMarket(debtToken)) : getContext(from, fromContext as `0x${string}`);
        const utxoIndexForGetBorrow = utxoCount; // Track UTXO index before adding GetBorrowBalance
        addProto(
          from,
          encodeLendingInstruction(LendingOp.GetBorrowBalance, debtToken, userAddress, 0n, fromCtx, 999) as `0x${string}`,
          true, // GetBorrowBalance creates 1 UTXO
        );

        // [1] FlashLoan: use GetBorrowBalance UTXO to flash loan exactly what we need
        // The flash loan will use the GetBorrowBalance output (exact debt amount)
        let provider: FlashLoanProvider;
        if (version === "aave") {
          provider = FlashLoanProvider.AaveV3;
        } else if (version === "v3") {
          provider = FlashLoanProvider.BalancerV3;
        } else {
          provider = FlashLoanProvider.BalancerV2;
        }
        const flashData = encodeFlashLoan(provider, utxoIndexForGetBorrow);
        const flashLoanUtxoIndex = utxoCount; // Track UTXO index before adding flash loan
        addRouter(flashData as `0x${string}`, true); // FlashLoan creates 1 UTXO (with repayment amount)
        
        // Store the flash loan output UTXO index for this token (normalize to lowercase for consistent lookup)
        flashLoanOutputs.set((debtToken as Address).toLowerCase() as Address, flashLoanUtxoIndex);

        // [2] Approve flash tokens to the *source* gateway so it can pull for Repay
        addRouter(encodeApprove(flashLoanUtxoIndex, from) as `0x${string}`, true); // Approve creates 1 dummy UTXO

        // [3] Repay(source): uses GetBorrowBalance UTXO so the amount is exact on-chain
        addProto(
          from,
          encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, fromCtx, utxoIndexForGetBorrow) as `0x${string}`,
          true, // Repay creates 1 UTXO (refund)
        );

        // Note: Flash loan output (flashLoanUtxoIndex UTXO) contains the repayment amount (principal + fee)
        // This will be used by buildBorrow in coverFlash mode to borrow exactly what's needed
      },

      // 2) MOVE COLLATERAL (withdraw from source -> deposit into dest)
      buildMoveCollateral: ({
        fromProtocol,
        toProtocol,
        collateralToken,
        withdraw,
        collateralDecimals = 18,
        fromContext = "0x",
        toContext = "0x",
      }) => {
        const from = normalizeProtocolName(fromProtocol);
        const to = normalizeProtocolName(toProtocol);

        // Get contexts for both protocols (Compound needs market context)
        const fromCtx = from === "compound" ? getContext(from, encodeCompoundMarket(collateralToken)) : getContext(from, fromContext as `0x${string}`);
        const toCtx = to === "compound" && compoundMarket ? getContext(to, encodeCompoundMarket(compoundMarket)) : getContext(to, toContext as `0x${string}`);

        // Optional GetSupplyBalance if max
        let utxoIndexForGetSupply: number | undefined;
        if ("max" in withdraw && withdraw.max) {
          // Record the UTXO index where GetSupplyBalance will create its output
          utxoIndexForGetSupply = utxoCount;
          addProto(
            from,
            encodeLendingInstruction(LendingOp.GetSupplyBalance, collateralToken, userAddress, 0n, fromCtx, 999) as `0x${string}`,
            true, // GetSupplyBalance creates 1 UTXO
          );
        }

        // Withdraw
        const withdrawAmt =
          "amount" in withdraw ? parseUnits(withdraw.amount, collateralDecimals) : 0n;
        // Track UTXO index where WithdrawCollateral will create its output
        const utxoIndexForWithdraw = utxoCount;
        addProto(
          from,
          encodeLendingInstruction(
            LendingOp.WithdrawCollateral,
            collateralToken,
            userAddress,
            withdrawAmt,
            fromCtx,
            "max" in withdraw && withdraw.max && utxoIndexForGetSupply !== undefined ? utxoIndexForGetSupply : 999,
          ) as `0x${string}`,
          true, // WithdrawCollateral creates 1 UTXO
        );

        // Approve withdrawn collateral to *target* gateway (use UTXO index, not instruction index)
        addRouter(encodeApprove(utxoIndexForWithdraw, to) as `0x${string}`, true); // Approve creates 1 dummy UTXO

        // Deposit on target using the withdraw UTXO (use UTXO index, not instruction index)
        addProto(
          to,
          encodeLendingInstruction(LendingOp.Deposit, collateralToken, userAddress, 0n, toCtx, utxoIndexForWithdraw) as `0x${string}`,
          false, // Deposit doesn't create UTXO
        );
      },

      // 3) BORROW (either exact amount or "cover all flash obligations for this token")
      buildBorrow: (p: BuildBorrowParams) => {
        const {
          toProtocol,
          token,
          toContext = "0x",
          approveToRouter = true,
        } = p as any;

        const to = normalizeProtocolName(toProtocol);

        let borrowAmt: bigint;

        if (p.mode === "exact") {
          borrowAmt = parseUnits(p.amount, p.decimals ?? 18);
        } else {
          // coverFlash mode: use the flash loan output UTXO for this token
          // The flash loan output contains the repayment amount (principal + fee)
          // Normalize token address to lowercase for consistent lookup
          const flashLoanUtxoIndex = flashLoanOutputs.get((token as Address).toLowerCase() as Address);
          
          if (flashLoanUtxoIndex === undefined) {
            // No flash loan found for this token - this should not happen if buildUnlockDebt was called first
            throw new Error(`Flash loan output not found for token ${token}. Make sure buildUnlockDebt was called before buildBorrow.`);
          }

          // Use the flash loan output UTXO to borrow exactly what's needed to repay
          // The flash loan output already contains the repayment amount (principal + fee)
          // When using InputPtr, the gateway will use the UTXO amount, so we set borrowAmt to 0
          // Set to 0 - the gateway will use the UTXO amount via InputPtr
          borrowAmt = 0n; // Gateway will use UTXO amount via InputPtr
        }

        // Get context for target protocol (Compound needs market context)
        const toCtx = to === "compound" && compoundMarket ? getContext(to, encodeCompoundMarket(compoundMarket)) : getContext(to, toContext as `0x${string}`);

        // Track UTXO index where Borrow will create its output
        const utxoIndexForBorrow = utxoCount;

        // Borrow on target
        // In coverFlash mode, use the flash loan output UTXO to borrow exactly what's needed
        // Normalize token address to lowercase for consistent lookup
        const borrowInputIndex = p.mode === "coverFlash" 
          ? (flashLoanOutputs.get((token as Address).toLowerCase() as Address) ?? 999)
          : 999;
        
        addProto(
          to,
          encodeLendingInstruction(LendingOp.Borrow, token, userAddress, borrowAmt, toCtx, borrowInputIndex) as `0x${string}`,
          true, // Borrow creates 1 UTXO
        );

        // Approve borrowed tokens to the router so it can settle flash principal+premium (use UTXO index, not instruction index)
        const shouldApproveToRouter = approveToRouter && p.mode !== "coverFlash";

        if (shouldApproveToRouter) {
          addRouter(encodeApprove(utxoIndexForBorrow, "router") as `0x${string}`, true); // Approve creates 1 dummy UTXO
        }
      },

      // Set Compound market (debt token/base token address)
      // This should be called before building operations involving Compound
      setCompoundMarket: (debtToken: Address) => {
        compoundMarket = debtToken;
      },

        build: () => instructions,

      getFlashObligations: () => {
        // Return flash loan output UTXO indices by token
        const obj: Record<Address, { flashLoanUtxoIndex: number }> = {};
        for (const [token, utxoIndex] of flashLoanOutputs.entries()) {
          obj[token] = { flashLoanUtxoIndex: utxoIndex };
        }
        return obj;
      },
    };

    return builder;
  }, [userAddress, encodeCompoundMarket]);

  // Combined confirmation state (either single tx or batch)
  const isAnyConfirmed = isConfirmed || isBatchConfirmed;

  return {
    // Builder functions
    buildDepositFlow,
    buildBorrowFlow,
    buildRepayFlow,
    buildRepayFlowAsync, // Use this for max repayments
    buildWithdrawFlow,
    createMoveBuilder, // Modular move position builder
    // Execution functions
    executeInstructions,
    executeFlowWithApprovals, // Sequential execution (fallback - use executeFlowBatchedIfPossible instead)
    executeFlowBatchedIfPossible, // Batched execution (preferred - use this as default)
    getAuthorizations,
    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isApproving,
    writeContract,
    // Batch state (EIP-5792)
    batchId,
    batchStatus,
    isBatchConfirmed,
    canDoAtomicBatch, // Export capability detection for UI
    // Combined confirmation state (use this in modals)
    isAnyConfirmed,
  };
};

