import { useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import {
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeLendingInstruction,
  LendingOp,
} from "~~/utils/v2/instructionHelpers";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";

/**
 * Hook for building and executing instructions on KapanRouter v2
 * 
 * This hook provides utilities to:
 * - Build instruction sequences (deposit, borrow, repay, withdraw)
 * - Get authorizations required for the instructions
 * - Execute the instructions on the router
 */
export const useKapanRouterV2 = () => {
  const { address: userAddress } = useAccount();
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  /**
   * Build a basic deposit flow: PullToken -> Approve -> Deposit
   * @param protocolName - Protocol to deposit to (e.g., "aave", "compound", "venus")
   * @param tokenAddress - Token address to deposit
   * @param amount - Amount to deposit (as string, e.g., "100.5")
   * @param decimals - Token decimals (default: 18)
   */
  const buildDepositFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const amountBigInt = parseUnits(amount, decimals);

    return [
      // Pull tokens from user to router
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0] = pulled tokens)
      createRouterInstruction(encodeApprove(0, protocolName)),
      // Deposit tokens (uses UTXO[0] as input)
      createProtocolInstruction(
        protocolName,
        encodeLendingInstruction(LendingOp.Deposit, tokenAddress, userAddress, 0n, "0x", 0)
      ),
    ];
  }, [userAddress]);

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

    const amountBigInt = parseUnits(amount, decimals);

    return [
      // Borrow tokens (creates UTXO[0] with borrowed tokens)
      createProtocolInstruction(
        protocolName,
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
   * @param amount - Amount to repay (as string)
   * @param decimals - Token decimals (default: 18)
   */
  const buildRepayFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const amountBigInt = parseUnits(amount, decimals);

    return [
      // Pull tokens from user to router
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0])
      createRouterInstruction(encodeApprove(0, protocolName)),
      // Repay debt (uses UTXO[0] as input, creates UTXO[1] with refund if any)
      createProtocolInstruction(
        protocolName,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, 0n, "0x", 0)
      ),
      // Push refund to user if any (UTXO[1])
      createRouterInstruction(encodePushToken(1, userAddress)),
    ];
  }, [userAddress]);

  /**
   * Build a basic withdraw flow: Withdraw -> PushToken
   * @param protocolName - Protocol to withdraw from
   * @param tokenAddress - Token address to withdraw
   * @param amount - Amount to withdraw (as string)
   * @param decimals - Token decimals (default: 18)
   */
  const buildWithdrawFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const amountBigInt = parseUnits(amount, decimals);

    return [
      // Withdraw collateral (creates UTXO[0] with withdrawn tokens)
      createProtocolInstruction(
        protocolName,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, tokenAddress, userAddress, amountBigInt, "0x", 999)
      ),
      // Push withdrawn tokens to user (UTXO[0])
      createRouterInstruction(encodePushToken(0, userAddress)),
    ];
  }, [userAddress]);

  /**
   * Get authorizations required for a set of instructions
   * This calls the router's authorizeRouter function to get the approvals needed
   */
  const getAuthorizations = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<any[]> => {
    if (!routerContract) {
      throw new Error("Router contract not available");
    }

    // Convert instructions to the format expected by the contract
    const protocolInstructions = instructions.map(inst => ({
      protocolName: inst.protocolName,
      data: inst.data as `0x${string}`,
    }));

    // TODO: Call router's authorizeRouter function
    // For now, return empty array - this needs to be implemented based on the router's ABI
    return [];
  }, [routerContract]);

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
      notification.error(error.message || "Failed to execute instructions");
      throw error;
    }
  }, [routerContract, userAddress, writeContractAsync]);

  return {
    // Builder functions
    buildDepositFlow,
    buildBorrowFlow,
    buildRepayFlow,
    buildWithdrawFlow,
    // Execution functions
    executeInstructions,
    getAuthorizations,
    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeContract,
  };
};

