import { useCallback, useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, type Address } from "viem";
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

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const [isApproving, setIsApproving] = useState(false);

  // Refresh Wagmi queries when transaction completes
  useEffect(() => {
    if (isConfirmed && hash) {
      // Invalidate all Wagmi queries to refresh balances, positions, etc.
      // Wagmi queries are prefixed with 'wagmi' in the query key
      queryClient.invalidateQueries({
        predicate: (query) => {
          // Invalidate Wagmi queries (they start with ['wagmi', ...])
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === 'wagmi';
        },
      });
      
      // Also dispatch a custom event for any listeners that might need it
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("txCompleted"));
      }
    }
  }, [isConfirmed, hash, queryClient]);

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

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);

    return [
      // Pull tokens from user to router
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0] = pulled tokens)
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // Deposit tokens (uses UTXO[0] as input)
      createProtocolInstruction(
        normalizedProtocol,
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
    // For max repayments, pull a bit more than needed to cover interest accrual
    // The repay instruction will use MaxUint256 to repay all debt, and refund excess
    const amountBigInt = isMax || amount.toLowerCase() === "max"
      ? (2n ** 256n - 1n) // MaxUint256 for PullToken - we'll pull max available
      : parseUnits(amount, decimals);

    // For max repay, the repay instruction should use MaxUint256 to signal "repay all"
    const repayAmount = isMax || amount.toLowerCase() === "max" ? (2n ** 256n - 1n) : 0n;

    return [
      // Pull tokens from user to router (use MaxUint256 for max repay to pull all available)
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      // Approve gateway to pull tokens from router (UTXO[0])
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // Repay debt (uses UTXO[0] as input, creates UTXO[1] with refund if any)
      // For max repay, use MaxUint256 in amount parameter - protocol will repay all debt
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, repayAmount, "0x", 0)
      ),
      // Push refund to user if any (UTXO[1])
      createRouterInstruction(encodePushToken(1, userAddress)),
    ];
  }, [userAddress]);

  /**
   * Build a basic withdraw flow: Withdraw -> PushToken
   * @param protocolName - Protocol to withdraw from
   * @param tokenAddress - Token address to withdraw
   * @param amount - Amount to withdraw (as string). Use "max" or MaxUint256 string for full withdrawal
   * @param decimals - Token decimals (default: 18)
   * @param isMax - Whether to withdraw the maximum available amount (uses MaxUint256 sentinel)
   */
  const buildWithdrawFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    // For max withdrawals, use MaxUint256 as a sentinel value
    // The protocol will withdraw all available including accrued interest
    const amountBigInt = isMax || amount.toLowerCase() === "max" 
      ? (2n ** 256n - 1n) // MaxUint256
      : parseUnits(amount, decimals);

    

    return [
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.GetSupplyBalance, tokenAddress, userAddress, 0n, "0x", 0)
      ),
      // Withdraw collateral (creates UTXO[0] with withdrawn tokens)
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, tokenAddress, userAddress, amountBigInt, "0x", isMax ? 0 : 999)
      ),
      // Push withdrawn tokens to user (UTXO[0])
      createRouterInstruction(encodePushToken(1, userAddress)),
    ];
  }, [userAddress]);

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
      const [targets, data] = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "authorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
      }) as [Address[], `0x${string}`[]];

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
      notification.error(error.message || "Failed to execute instructions");
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
      for (let i = 0; i < authCalls.length; i++) {
        const authCall = authCalls[i];
        if (!authCall.target || !authCall.data || authCall.data.length === 0) {
          console.warn(`executeFlowWithApprovals: Skipping invalid auth call ${i}`, authCall);
          continue; // Skip invalid auth calls
        }

        console.log(`executeFlowWithApprovals: Processing approval ${i + 1}/${authCalls.length}`, {
          target: authCall.target,
          dataLength: authCall.data.length,
        });
        setIsApproving(true);

        // Get token address from the target (it's the token contract address)
        const tokenAddress = authCall.target;

        // Get token symbol for user notification (try to read, fallback to address)
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

        notification.info(`Approving ${tokenSymbol}...`);

        // Execute the approval call directly using the encoded data from authorizeInstructions
        // The router has already encoded the approve(address spender, uint256 amount) call
        // Fetch the current nonce explicitly to avoid MetaMask nonce issues with Hardhat
        const currentNonce = await publicClient.getTransactionCount({
          address: userAddress as Address,
        });
        
        const approveHash = await walletClient.sendTransaction({
          to: authCall.target,
          data: authCall.data,
          nonce: currentNonce, // Explicitly set nonce to prevent MetaMask caching issues
        });

        // Wait for approval confirmation (crucial for mobile wallets)
        // Add a small delay after receipt to ensure Hardhat processes the nonce update
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        
        // Small delay to ensure Hardhat updates nonce state (helps with interval mining)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        notification.success(`${tokenSymbol} approved ✅`);
        setIsApproving(false);
      }

      // 3. Execute the router instructions (now that approvals are in place)
      notification.info("Executing transaction...");
      const resultHash = await executeInstructions(instructions);
      return resultHash;
    } catch (error: any) {
      setIsApproving(false);
      console.error("Error in executeFlowWithApprovals:", error);
      notification.error(error.message || "Failed to execute flow with approvals");
      throw error;
    }
  }, [routerContract, userAddress, publicClient, walletClient, getAuthorizations, executeInstructions]);

  return {
    // Builder functions
    buildDepositFlow,
    buildBorrowFlow,
    buildRepayFlow,
    buildWithdrawFlow,
    // Execution functions
    executeInstructions,
    executeFlowWithApprovals,
    getAuthorizations,
    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isApproving,
    writeContract,
  };
};

