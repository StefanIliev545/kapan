import { useCallback, useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, decodeAbiParameters, encodeAbiParameters, decodeFunctionData, type Address } from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import {
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeLendingInstruction,
  encodeFlashLoanV2,
  encodeFlashLoanV3,
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
    if (!isConfirmed || !hash) return;

    // Use refetchQueries instead of invalidateQueries for faster refresh
    // This only refetches active/mounted queries instead of marking all as stale
    Promise.all([
      queryClient.refetchQueries({ queryKey: ['readContract'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['readContracts'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['balance'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['token'], type: 'active' }),
    ]).catch(error => {
      console.warn('Error refetching queries after transaction:', error);
    });

    // Also dispatch a custom event for any listeners that might need it
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("txCompleted"));
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

        // Decode and check if approval amount is zero (ERC20 approve(address,uint256))
        try {
          const decoded = decodeFunctionData({ abi: ERC20ABI, data: authCall.data });
          if (decoded.functionName === "approve") {
            const amount = decoded.args?.[1] as bigint;
            if (amount === 0n) {
              console.warn(`executeFlowWithApprovals: Skipping zero-amount approval for token ${authCall.target}`);
              continue; // Skip zero-amount approvals
            }
          }
        } catch (e) {
          // If ABI-aware decoding fails, fall back to selector-based check
          try {
            const selector = authCall.data.slice(0, 10).toLowerCase(); // 4-byte selector
            const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)
            if (selector === APPROVE_SELECTOR) {
              const decodedParams = decodeAbiParameters(
                [{ type: "address" }, { type: "uint256" }],
                authCall.data.slice(10) as `0x${string}`
              );
              const amount = decodedParams[1] as bigint;
              if (amount === 0n) {
                console.warn(`executeFlowWithApprovals: Skipping zero-amount approval for token ${authCall.target}`);
                continue;
              }
            }
          } catch (e2) {
            console.log(`executeFlowWithApprovals: Could not decode approval amount, proceeding anyway`, e2);
          }
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

  // --- Types for modular move position builder ---
  type FlashConfig = {
    version: "v3" | "v2";
    premiumBps?: number; // Aave v3 default often 9 bps; fetch from on-chain ideally
    bufferBps?: number;  // small headroom between GetBorrowBalance and real repay (default 10)
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

  // Internal: how much we still owe the router to close flash loans, by token
  type FlashDebtBucket = {
    // What user asked in unlock steps (sum of expectedDebt per token)
    expectedSum: bigint;
    // Premium owed across all unlocks for this token
    premiumSum: bigint;
    // We also keep count of flash calls in case you want to reconcile later
    flashCalls: number;
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
    getFlashObligations: () => Record<Address, { expectedSum: bigint; premiumSum: bigint }>;
  };

  /**
   * Helper to encode Compound market context
   * Context format: abi.encode(address marketBaseToken)
   */
  const encodeCompoundMarket = (marketAddress: Address): `0x${string}` => {
    return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
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
    const flashDebts = new Map<Address, FlashDebtBucket>();
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

    const ensureBucket = (token: Address) => {
      if (!flashDebts.has(token)) {
        flashDebts.set(token, { expectedSum: 0n, premiumSum: 0n, flashCalls: 0 });
      }
      const bucket = flashDebts.get(token);
      if (!bucket) {
        throw new Error("Failed to ensure flash debt bucket");
      }
      return bucket;
    };

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
        flash: { version, premiumBps = 9, bufferBps = 10 },
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

        // [1] FlashLoan: bring debt tokens into the router (principal includes a tiny buffer)
        const principal = (expected * BigInt(10000 + bufferBps)) / 10000n;
        
        // Double-check principal is not zero (shouldn't happen if expected > 0)
        if (principal === 0n) {
          throw new Error(`Calculated flash loan principal is zero. Expected debt: ${expectedDebt}, Parsed: ${expected.toString()}`);
        }

        const flashData =
          version === "v3"
            ? encodeFlashLoanV3(principal, debtToken, userAddress)
            : encodeFlashLoanV2(principal, debtToken, userAddress);
        const iFlash = addRouter(flashData as `0x${string}`, true); // FlashLoan creates 1 UTXO

        // [2] Approve flash tokens to the *source* gateway so it can pull for Repay
        addRouter(encodeApprove(iFlash, from) as `0x${string}`, true); // Approve creates 1 dummy UTXO

        // [3] Repay(source): uses GetBorrowBalance UTXO so the amount is exact on-chain
        addProto(
          from,
          encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, fromCtx, utxoIndexForGetBorrow) as `0x${string}`,
          true, // Repay creates 1 UTXO (refund)
        );

        // Record the future amount we must borrow on target to return flash:
        // Need at least (expected + premium) — the buffer remains in router after repay.
        const premium = (expected * BigInt(premiumBps)) / 10000n;
        const bucket = ensureBucket(debtToken);
        bucket.expectedSum += expected;
        bucket.premiumSum += premium;
        bucket.flashCalls += 1;
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
          // coverFlash mode
          const bucket = flashDebts.get(token);
          if (!bucket) {
            // Nothing to repay for this token; no-op
            return;
          }

          const base = bucket.expectedSum + bucket.premiumSum; // need >= expected + premium
          const extraBps = p.extraBps ?? 0;
          borrowAmt = (base * BigInt(10000 + extraBps)) / 10000n;
        }

        // Get context for target protocol (Compound needs market context)
        const toCtx = to === "compound" && compoundMarket ? getContext(to, encodeCompoundMarket(compoundMarket)) : getContext(to, toContext as `0x${string}`);

        // Track UTXO index where Borrow will create its output
        const utxoIndexForBorrow = utxoCount;

        // Borrow on target
        addProto(
          to,
          encodeLendingInstruction(LendingOp.Borrow, token, userAddress, borrowAmt, toCtx, 999) as `0x${string}`,
          true, // Borrow creates 1 UTXO
        );

        // Approve borrowed tokens to the router so it can settle flash principal+premium (use UTXO index, not instruction index)
        if (approveToRouter) {
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
        const obj: Record<Address, { expectedSum: bigint; premiumSum: bigint }> = {};
        for (const [token, b] of flashDebts.entries()) {
          obj[token] = { expectedSum: b.expectedSum, premiumSum: b.premiumSum };
        }
        return obj;
      },
    };

    return builder;
  }, [userAddress]);

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

