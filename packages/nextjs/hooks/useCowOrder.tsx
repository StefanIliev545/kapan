import { useCallback, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useChainId,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  type Address,
  type Hex,
  encodeFunctionData,
} from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import {
  buildOrderParams,
  generateOrderSalt,
  parseOrderContext,
  type KapanOrderInput,
  type OrderContext,
  OrderStatus,
  isChainSupported,
  buildAndRegisterAppData,
  getCowExplorerAddressUrl,
} from "~~/utils/cow";
import { ProtocolInstruction } from "~~/utils/v2/instructionHelpers";
import { logger } from "~~/utils/logger";

/**
 * Flatten per-iteration instructions to a single array (for authorization)
 * Deduplicates by combining all unique instructions across iterations
 */
function flattenInstructions(
  instructions: ProtocolInstruction[] | ProtocolInstruction[][] | undefined
): ProtocolInstruction[] {
  if (!instructions || instructions.length === 0) return [];
  
  // Check if it's per-iteration (array of arrays)
  if (Array.isArray(instructions[0]) && Array.isArray((instructions[0] as ProtocolInstruction[])[0]?.protocolName ? [] : instructions[0])) {
    // It's ProtocolInstruction[][] - flatten all iterations
    const perIteration = instructions as ProtocolInstruction[][];
    const flattened: ProtocolInstruction[] = [];
    const seen = new Set<string>();
    
    for (const iteration of perIteration) {
      for (const inst of iteration) {
        // Deduplicate by protocolName + data hash
        const key = `${inst.protocolName}:${inst.data}`;
        if (!seen.has(key)) {
          seen.add(key);
          flattened.push(inst);
        }
      }
    }
    return flattened;
  }
  
  // It's a single ProtocolInstruction[] - check if elements are ProtocolInstruction or arrays
  if (instructions.length > 0 && typeof (instructions[0] as any).protocolName === 'string') {
    return instructions as ProtocolInstruction[];
  }
  
  // Fallback: assume per-iteration
  const perIteration = instructions as ProtocolInstruction[][];
  return perIteration.flat();
}

// Minimal ABI for functions not in deployed contract (fallback)
const ORDER_MANAGER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "user", type: "address" },
          { name: "preInstructionsPerIteration", type: "bytes[]" },
          { name: "preTotalAmount", type: "uint256" },
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "chunkSize", type: "uint256" },
          { name: "minBuyPerChunk", type: "uint256" },
          { name: "postInstructionsPerIteration", type: "bytes[]" },
          { name: "completion", type: "uint8" },
          { name: "targetValue", type: "uint256" },
          { name: "minHealthFactor", type: "uint256" },
          { name: "appDataHash", type: "bytes32" },
          { name: "isFlashLoanOrder", type: "bool" },
          { name: "isKindBuy", type: "bool" },
        ],
        name: "params",
        type: "tuple",
      },
      { name: "salt", type: "bytes32" },
      { name: "seedAmount", type: "uint256" },
    ],
    name: "createOrder",
    outputs: [{ name: "orderHash", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "cancelOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "getOrder",
    outputs: [
      {
        components: [
          {
            components: [
              { name: "user", type: "address" },
              { name: "preInstructionsPerIteration", type: "bytes[]" },
              { name: "preTotalAmount", type: "uint256" },
              { name: "sellToken", type: "address" },
              { name: "buyToken", type: "address" },
              { name: "chunkSize", type: "uint256" },
              { name: "minBuyPerChunk", type: "uint256" },
              { name: "postInstructionsPerIteration", type: "bytes[]" },
              { name: "completion", type: "uint8" },
              { name: "targetValue", type: "uint256" },
              { name: "minHealthFactor", type: "uint256" },
              { name: "appDataHash", type: "bytes32" },
              { name: "isFlashLoanOrder", type: "bool" },
              { name: "isKindBuy", type: "bool" },
            ],
            name: "params",
            type: "tuple",
          },
          { name: "status", type: "uint8" },
          { name: "executedAmount", type: "uint256" },
          { name: "iterationCount", type: "uint256" },
          { name: "createdAt", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserOrders",
    outputs: [{ name: "", type: "bytes32[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "isOrderComplete",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Flash loan configuration for CoW Protocol single-tx execution
 * When provided, solvers will take a flash loan and the post-hook borrows to repay it
 * 
 * CoW Protocol schema: { lender, borrower (optional), token, amount }
 * The borrower (who receives flash loaned tokens) is set to OrderManager automatically.
 */
export interface FlashLoanConfig {
  /** Flash loan liquidity provider address (Aave Pool or Balancer Vault) */
  lender: string;
  /** Token to borrow (should match sellToken) */
  token: string;
  /** Amount to borrow (flash loan amount) */
  amount: bigint;
}

/**
 * Extended order input with optional pre-built instructions
 */
export interface CreateOrderInput extends KapanOrderInput {
  /** 
   * Pre-built instructions per iteration (alternative to building them here)
   * Can be single array (same for all) or array of arrays (per-iteration)
   */
  preInstructions?: ProtocolInstruction[] | ProtocolInstruction[][];
  postInstructions?: ProtocolInstruction[] | ProtocolInstruction[][];
  /** Amount of sell tokens to seed OrderManager for first chunk (pulled from user) */
  seedAmount?: bigint;
  /** Flash loan config for single-tx execution (bypasses seed requirement) */
  flashLoan?: FlashLoanConfig;
}

/**
 * Hook for managing Kapan CoW Protocol orders
 * 
 * @example
 * ```tsx
 * const { createOrder, cancelOrder, getUserOrders, isCreating } = useCowOrder();
 * 
 * // Create a leverage-down order
 * const orderHash = await createOrder({
 *   user: address,
 *   sellToken: wethAddress,
 *   buyToken: usdcAddress,
 *   preTotalAmount: "1.0",
 *   chunkSize: "0.1",
 *   minBuyPerChunk: "180",
 *   completion: CompletionType.Iterations,
 *   targetValue: 10,
 *   preInstructions: withdrawCollateralFlow,
 *   postInstructions: repayDebtFlow,
 * });
 * ```
 */
export function useCowOrder() {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const queryClient = useQueryClient();
  
  // Get deployed contracts for current chain (automatically handles chain switching)
  const { data: orderManagerContract, isLoading: isOrderManagerLoading } = useDeployedContractInfo({ 
    contractName: "KapanOrderManager" 
  });
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });
  
  // Extract address from deployed contract info
  const orderManagerAddress = orderManagerContract?.address as Address | undefined;
  
  // Use router hook for authorization handling
  const { getAuthorizations } = useKapanRouterV2();
  
  const [isCreating, setIsCreating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  /**
   * Check if user has delegated to the OrderManager
   */
  const checkDelegation = useCallback(async (): Promise<boolean> => {
    if (!userAddress || !orderManagerAddress || !publicClient || !routerContract) {
      return false;
    }
    
    try {
      const isDelegated = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "userDelegates",
        args: [userAddress, orderManagerAddress],
      }) as boolean;
      
      return isDelegated;
    } catch (error) {
      logger.error("[useCowOrder] Error checking delegation:", error);
      return false;
    }
  }, [userAddress, orderManagerAddress, publicClient, routerContract]);
  
  /**
   * Set delegation to OrderManager (required for CoW orders)
   */
  const setDelegation = useCallback(async (approved = true): Promise<string | undefined> => {
    if (!userAddress || !orderManagerAddress || !walletClient || !routerContract) {
      notification.error("Wallet not connected or contracts not deployed");
      return undefined;
    }
    
    const notificationId = notification.loading(
      <TransactionToast 
        step="pending" 
        message={approved ? "Enabling CoW order permissions..." : "Revoking CoW order permissions..."} 
      />
    );
    
    try {
      const txHash = await walletClient.writeContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "setDelegate",
        args: [orderManagerAddress, approved],
        account: userAddress,
      });
      
      notification.remove(notificationId);
      
      const sentNotificationId = notification.loading(
        <TransactionToast 
          step="sent" 
          txHash={txHash}
          message="Waiting for confirmation..."
          blockExplorerLink={getBlockExplorerTxLink(chainId, txHash)}
        />
      );
      
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      
      notification.remove(sentNotificationId);
      notification.success(
        <TransactionToast 
          step="confirmed" 
          txHash={txHash}
          message={approved ? "CoW order permissions enabled" : "CoW order permissions revoked"}
        />
      );
      
      return txHash;
    } catch (error: any) {
      notification.remove(notificationId);
      logger.error("[useCowOrder] Error setting delegation:", error);
      notification.error(`Failed to set delegation: ${error.shortMessage || error.message}`);
      return undefined;
    }
  }, [userAddress, orderManagerAddress, walletClient, routerContract, publicClient, chainId]);

  /**
   * Build all calls needed for CoW order creation (for batching)
   * 
   * This also registers appData with CoW API before returning calls.
   * 
   * If seedAmount is provided, includes an ERC20 approve call so OrderManager
   * can pull the seed tokens during createOrder.
   * 
   * Returns: { delegationCall?, authCalls[], seedApproveCall?, orderCall, salt, appDataHash }
   */
  const buildOrderCalls = useCallback(async (
    input: CreateOrderInput
  ): Promise<{
    delegationCall?: { to: Address; data: Hex };
    authCalls: { to: Address; data: Hex }[];
    seedApproveCall?: { to: Address; data: Hex };
    orderCall: { to: Address; data: Hex };
    salt: string;
    appDataHash: string;
  } | undefined> => {
    if (!userAddress || !orderManagerAddress || !routerContract) {
      logger.error("[useCowOrder] Missing context for buildOrderCalls");
      return undefined;
    }

    // 1. Generate salt first
    const salt = generateOrderSalt();

    // 2. Build and register appData with CoW API
    // Note: chunkIndex is NOT needed - the contract reads it from iterationCount
    // This allows the same appData to work for ALL chunks
    const appDataResult = await buildAndRegisterAppData(
      chainId,
      orderManagerAddress,
      userAddress,
      salt,
      // Pass flash loan config if provided - this hints to solvers to use flash loan
      input.flashLoan ? {
        flashLoan: {
          lender: input.flashLoan.lender,
          token: input.flashLoan.token,
          amount: input.flashLoan.amount,
        },
      } : undefined,
    );

    if (!appDataResult.registered) {
      logger.error("[useCowOrder] AppData registration failed:", appDataResult.error);
      return undefined;
    }

    // 3. Build order parameters with appDataHash
    // Set isFlashLoanOrder based on whether flash loan config is provided
    const orderParams = buildOrderParams({
      ...input,
      appDataHash: appDataResult.appDataHash,
      isFlashLoanOrder: !!input.flashLoan,
      isKindBuy: input.isKindBuy ?? false,
    });

    // 4. Check delegation
    const isDelegated = await checkDelegation();
    let delegationCall: { to: Address; data: Hex } | undefined;
    
    if (!isDelegated) {
      delegationCall = {
        to: routerContract.address as Address,
        data: encodeFunctionData({
          abi: routerContract.abi,
          functionName: "setDelegate",
          args: [orderManagerAddress, true],
        }) as Hex,
      };
    }

    // 5. Get authorization calls for pre/post instructions
    // Flatten per-iteration instructions for authorization check
    const allInstructions = [
      ...flattenInstructions(input.preInstructions),
      ...flattenInstructions(input.postInstructions),
    ];
    
    let authCalls: { to: Address; data: Hex }[] = [];
    if (allInstructions.length > 0) {
      const rawAuthCalls = await getAuthorizations(allInstructions);
      authCalls = rawAuthCalls
        .filter(({ target, data }) => target && data && data.length > 0)
        .map(({ target, data }) => ({ to: target as Address, data: data as Hex }));
    }

    // 6. Build seed token approve call if seedAmount provided (not needed for flash loan mode)
    // This allows OrderManager to pull tokens during createOrder
    // Skip for flash loan mode - solver provides funds via flash loan
    const seedAmount = input.flashLoan ? 0n : (input.seedAmount ?? 0n);
    let seedApproveCall: { to: Address; data: Hex } | undefined;
    
    if (seedAmount > 0n) {
      const ERC20_APPROVE_ABI = [{
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
      }];
      
      seedApproveCall = {
        to: input.sellToken as Address,
        data: encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [orderManagerAddress, seedAmount],
        }) as Hex,
      };
    }

    // 7. Build order creation call with seedAmount
    const orderCall = {
      to: orderManagerAddress,
      data: encodeFunctionData({
        abi: orderManagerContract?.abi ?? ORDER_MANAGER_ABI,
        functionName: "createOrder",
        args: [orderParams as any, salt as `0x${string}`, seedAmount],
      }) as Hex,
    };

    return { delegationCall, authCalls, seedApproveCall, orderCall, salt, appDataHash: appDataResult.appDataHash };
  }, [userAddress, orderManagerAddress, orderManagerContract, routerContract, chainId, checkDelegation, getAuthorizations]);

  /**
   * Create a new CoW order
   * 
   * Flow:
   * 1. Generate salt (deterministic ID before order exists on-chain)
   * 2. Build and register appData with CoW API using (user, salt)
   * 3. Get appDataHash from registered appData
   * 4. Set delegation if needed
   * 5. Execute authorization calls (credit delegation, etc.)
   * 6. Create order on-chain with appDataHash in params
   * 
   * This order is critical because:
   * - appDataHash must be in the on-chain order params
   * - CoW solvers fetch appData by hash to find hooks
   * - Hooks reference (user, salt) which maps to orderHash on-chain
   */
  const createOrder = useCallback(async (
    input: CreateOrderInput
  ): Promise<string | undefined> => {
    if (!userAddress || !orderManagerAddress || !publicClient || !walletClient) {
      notification.error("Wallet not connected or contracts not deployed");
      return undefined;
    }

    if (!isChainSupported(chainId)) {
      notification.error(`Chain ${chainId} is not supported by CoW Protocol`);
      return undefined;
    }

    setIsCreating(true);
    let notificationId: string | number | null = null;

    try {
      // 1. Generate salt first - this is our deterministic order ID before on-chain creation
      const salt = generateOrderSalt();
      
      logger.debug("[useCowOrder] Creating order with salt:", salt);

      // 2. Build and register appData with CoW API BEFORE order creation
      // This is critical: appData uses (user, salt) to reference the order
      // which gets mapped to orderHash when createOrder is called
      // Note: chunkIndex is NOT needed - the contract reads it from iterationCount
      // This allows the same appData to work for ALL chunks
      logger.debug("[useCowOrder] Registering AppData for (user, salt):", userAddress, salt);
      const appDataResult = await buildAndRegisterAppData(
        chainId,
        orderManagerAddress,
        userAddress,
        salt,
      );

      if (!appDataResult.registered) {
        throw new Error(`AppData registration failed: ${appDataResult.error}`);
      }
      
      logger.debug("[useCowOrder] AppData registered:", appDataResult.appDataHash);

      // 3. Build order parameters with the registered appDataHash
      // Note: isFlashLoanOrder is set based on flashLoan config in CreateOrderInput
      const orderParams = buildOrderParams({
        ...input,
        appDataHash: appDataResult.appDataHash,
        isFlashLoanOrder: !!input.flashLoan,
      });
      
      logger.debug("[useCowOrder] Order params:", {
        user: orderParams.user,
        sellToken: orderParams.sellToken,
        buyToken: orderParams.buyToken,
        chunkSize: orderParams.chunkSize.toString(),
        completion: orderParams.completion,
        appDataHash: orderParams.appDataHash,
      });

      // 4. Check and set delegation to OrderManager (required for CoW hooks)
      const isDelegated = await checkDelegation();
      if (!isDelegated) {
        logger.debug("[useCowOrder] Setting up delegation to OrderManager");
        const delegationTx = await setDelegation(true);
        if (!delegationTx) {
          throw new Error("Failed to set delegation - CoW orders require router delegation");
        }
      }

      // 5. Get authorizations for pre/post instructions
      // Flatten per-iteration instructions for authorization check
      const allInstructions = [
        ...flattenInstructions(input.preInstructions),
        ...flattenInstructions(input.postInstructions),
      ];
      
      let authCalls: { target: Address; data: `0x${string}` }[] = [];
      if (allInstructions.length > 0) {
        authCalls = await getAuthorizations(allInstructions);
        logger.debug("[useCowOrder] Authorization calls needed:", authCalls.length);
      }

      // 6. Execute authorization calls (e.g., credit delegation)
      if (authCalls.length > 0) {
        notificationId = notification.loading(
          <TransactionToast step="pending" message="Setting up authorizations..." />
        );

        for (const authCall of authCalls) {
          if (!authCall.target || !authCall.data) continue;

          const authHash = await walletClient.sendTransaction({
            account: userAddress,
            to: authCall.target,
            data: authCall.data,
          });

          await publicClient.waitForTransactionReceipt({ hash: authHash });
        }

        notification.remove(notificationId);
        notification.success(
          <TransactionToast step="confirmed" message="Authorizations set" />
        );
      }

      // 7. Approve and transfer seed tokens if provided
      const seedAmount = input.seedAmount ?? 0n;
      
      if (seedAmount > 0n) {
        notificationId = notification.loading(
          <TransactionToast step="pending" message="Approving seed tokens..." />
        );

        const ERC20_APPROVE_ABI = [{
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        }];

        const approveCalldata = encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [orderManagerAddress, seedAmount],
        });

        const approveHash = await walletClient.sendTransaction({
          account: userAddress,
          to: input.sellToken as Address,
          data: approveCalldata,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        notification.remove(notificationId);
        logger.debug("[useCowOrder] Seed token approval confirmed");
      }

      // 8. Create the order on-chain with appDataHash and seedAmount
      notificationId = notification.loading(
        <TransactionToast step="pending" message="Creating CoW order..." />
      );

      const createCalldata = encodeFunctionData({
        abi: orderManagerContract?.abi ?? ORDER_MANAGER_ABI,
        functionName: "createOrder",
        args: [orderParams as any, salt as `0x${string}`, seedAmount],
      });

      const txHash = await walletClient.sendTransaction({
        account: userAddress,
        to: orderManagerAddress,
        data: createCalldata,
      });

      notification.remove(notificationId);
      const blockExplorerUrl = getBlockExplorerTxLink(chainId, txHash);
      
      notificationId = notification.loading(
        <TransactionToast 
          step="sent" 
          txHash={txHash} 
          message="Waiting for confirmation..."
          blockExplorerLink={blockExplorerUrl}
        />
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // 8. Extract order hash from OrderCreated event
      let orderHash: string | undefined;
      for (const log of receipt.logs) {
        try {
          // OrderCreated event signature: OrderCreated(bytes32 indexed orderHash, address indexed user, ...)
          // Topic 0 is event signature, Topic 1 is indexed orderHash
          if (log.topics[0] && log.topics[1]) {
            orderHash = log.topics[1]; // First indexed param is orderHash
            break;
          }
        } catch {
          // Skip logs that don't match
        }
      }

      if (!orderHash) {
        logger.warn("[useCowOrder] Could not extract orderHash from event, using salt as identifier");
        orderHash = salt;
      }

      // Log order details for debugging
      logger.info("[useCowOrder] Order created successfully!");
      logger.info(`  Order Hash: ${orderHash}`);
      logger.info(`  Salt: ${salt}`);
      logger.info(`  Tx Hash: ${txHash}`);
      logger.info(`  User: ${userAddress}`);
      logger.info(`  AppData Hash: ${appDataResult.appDataHash}`);

      notification.remove(notificationId);
      
      // Build CoW Explorer link - use orderManagerAddress since orders are created by the contract
      const cowExplorerUrl = orderManagerAddress 
        ? getCowExplorerAddressUrl(chainId, orderManagerAddress)
        : undefined;
      const shortOrderHash = orderHash ? `${orderHash.slice(0, 10)}...${orderHash.slice(-8)}` : "";
      
      notification.success(
        <TransactionToast 
          step="confirmed" 
          txHash={txHash}
          message={`Limit order created! Order: ${shortOrderHash}`}
          blockExplorerLink={blockExplorerUrl}
          secondaryLink={cowExplorerUrl}
          secondaryLinkText="View on CoW Explorer"
        />
      );

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ["cow-orders"] });

      return orderHash;

    } catch (error: any) {
      if (notificationId) notification.remove(notificationId);
      
      const message = error?.shortMessage || error?.message || "Failed to create order";
      const isRejection = message.toLowerCase().includes("rejected") || 
                          message.toLowerCase().includes("denied");
      
      notification.error(
        <TransactionToast 
          step="failed" 
          message={isRejection ? "User rejected request" : message}
        />
      );
      
      logger.error("[useCowOrder] Create order failed:", error);
      return undefined;

    } finally {
      setIsCreating(false);
    }
  }, [userAddress, orderManagerAddress, orderManagerContract, publicClient, walletClient, chainId, getAuthorizations, queryClient, checkDelegation, setDelegation]);

  /**
   * Cancel an active order
   */
  const cancelOrder = useCallback(async (orderHash: string): Promise<boolean> => {
    if (!userAddress || !orderManagerAddress || !publicClient || !walletClient) {
      notification.error("Wallet not connected");
      return false;
    }

    setIsCancelling(true);
    let notificationId: string | number | null = null;

    try {
      notificationId = notification.loading(
        <TransactionToast step="pending" message="Cancelling order..." />
      );

      const cancelCalldata = encodeFunctionData({
        abi: orderManagerContract?.abi ?? ORDER_MANAGER_ABI,
        functionName: "cancelOrder",
        args: [orderHash as `0x${string}`],
      });

      const txHash = await walletClient.sendTransaction({
        account: userAddress,
        to: orderManagerAddress,
        data: cancelCalldata,
      });

      notification.remove(notificationId);
      const blockExplorerUrl = getBlockExplorerTxLink(chainId, txHash);

      notificationId = notification.loading(
        <TransactionToast 
          step="sent" 
          txHash={txHash}
          message="Waiting for confirmation..."
          blockExplorerLink={blockExplorerUrl}
        />
      );

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      notification.remove(notificationId);
      notification.success(
        <TransactionToast 
          step="confirmed" 
          txHash={txHash}
          message="Order cancelled"
          blockExplorerLink={blockExplorerUrl}
        />
      );

      queryClient.invalidateQueries({ queryKey: ["cow-orders"] });
      return true;

    } catch (error: any) {
      if (notificationId) notification.remove(notificationId);
      
      const message = error?.shortMessage || error?.message || "Failed to cancel order";
      notification.error(
        <TransactionToast step="failed" message={message} />
      );
      
      logger.error("[useCowOrder] Cancel order failed:", error);
      return false;

    } finally {
      setIsCancelling(false);
    }
  }, [userAddress, orderManagerAddress, orderManagerContract, publicClient, walletClient, chainId, queryClient]);

  /**
   * Get order details by hash
   */
  const getOrder = useCallback(async (orderHash: string): Promise<OrderContext | undefined> => {
    if (!orderManagerAddress || !publicClient || !orderManagerContract) return undefined;

    try {
      const result = await publicClient.readContract({
        address: orderManagerAddress,
        abi: orderManagerContract.abi,
        functionName: "getOrder",
        args: [orderHash as `0x${string}`],
      });

      return parseOrderContext(result);
    } catch (error) {
      logger.error("[useCowOrder] Get order failed:", error);
      return undefined;
    }
  }, [orderManagerAddress, orderManagerContract, publicClient]);

  /**
   * Get all order hashes for the current user
   */
  const getUserOrders = useCallback(async (): Promise<string[]> => {
    if (!userAddress || !orderManagerAddress || !publicClient || !orderManagerContract) return [];

    // Check if the contract has getUserOrders function (older deployments may not)
    const hasGetUserOrders = orderManagerContract.abi.some(
      (item: { name?: string; type?: string }) => item.type === "function" && item.name === "getUserOrders"
    );
    
    if (!hasGetUserOrders) {
      logger.warn("[useCowOrder] OrderManager contract does not have getUserOrders function - needs redeployment");
      return [];
    }

    try {
      const result = await publicClient.readContract({
        address: orderManagerAddress,
        abi: orderManagerContract.abi,
        functionName: "getUserOrders",
        args: [userAddress],
      });

      return result as string[];
    } catch (error) {
      // Handle case where function exists in ABI but not in deployed contract
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('returned no data') || errorMessage.includes('0x')) {
        logger.warn("[useCowOrder] OrderManager contract needs redeployment - getUserOrders not available");
        return [];
      }
      logger.error("[useCowOrder] Get user orders failed:", error);
      return [];
    }
  }, [userAddress, orderManagerAddress, orderManagerContract, publicClient]);

  /**
   * Get all order details for the current user
   */
  const getUserOrdersWithDetails = useCallback(async (): Promise<{
    orderHash: string;
    context: OrderContext;
  }[]> => {
    const orderHashes = await getUserOrders();
    const orders: { orderHash: string; context: OrderContext }[] = [];

    for (const hash of orderHashes) {
      const context = await getOrder(hash);
      if (context && context.status !== OrderStatus.None) {
        orders.push({ orderHash: hash, context });
      }
    }

    return orders;
  }, [getUserOrders, getOrder]);

  /**
   * Check if an order is complete
   */
  const isOrderComplete = useCallback(async (orderHash: string): Promise<boolean> => {
    if (!orderManagerAddress || !publicClient || !orderManagerContract) return false;

    try {
      const result = await publicClient.readContract({
        address: orderManagerAddress,
        abi: orderManagerContract.abi,
        functionName: "isOrderComplete",
        args: [orderHash as `0x${string}`],
      });

      return result as boolean;
    } catch (error) {
      logger.error("[useCowOrder] Check order complete failed:", error);
      return false;
    }
  }, [orderManagerAddress, orderManagerContract, publicClient]);

  return {
    // Actions
    createOrder,
    cancelOrder,
    
    // Batching support
    buildOrderCalls,
    
    // Delegation
    checkDelegation,
    setDelegation,
    
    // Queries
    getOrder,
    getUserOrders,
    getUserOrdersWithDetails,
    isOrderComplete,
    
    // State
    isCreating,
    isCancelling,
    isLoading: isOrderManagerLoading,
    
    // Contract availability - requires deployed contract AND CoW Protocol support on chain
    isAvailable: !!orderManagerAddress && isChainSupported(chainId),
    orderManagerAddress,
  };
}
