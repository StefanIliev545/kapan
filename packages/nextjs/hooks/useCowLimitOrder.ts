import { useCallback, useMemo } from "react";
import {
  useAccount,
  usePublicClient,
  useChainId,
} from "wagmi";
import {
  type Address,
  type Hex,
  encodeFunctionData,
} from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import {
  buildOrderParams,
  generateOrderSalt,
  buildAndRegisterAppData,
  isChainSupported,
  CompletionType,
} from "~~/utils/cow";
import { ProtocolInstruction } from "~~/utils/v2/instructionHelpers";
import { logger } from "~~/utils/logger";

// Re-export CompletionType for convenience
export { CompletionType } from "~~/utils/cow";

// ============ Types ============

/**
 * Instructions for a single chunk/iteration.
 * 
 * UTXO Context:
 * - Pre-hook: OrderManager prepends ToOutput(chunkSize, sellToken) as UTXO[0]
 * - Post-hook: OrderManager prepends ToOutput(receivedAmount, buyToken) as UTXO[0]
 * 
 * Your instructions should reference UTXO[0] as the starting point.
 */
export interface ChunkInstructions {
  /** Instructions to run before the swap (UTXO[0] = sellToken amount) */
  preInstructions: ProtocolInstruction[];
  /** Instructions to run after the swap (UTXO[0] = buyToken amount from swap) */
  postInstructions: ProtocolInstruction[];
}

/**
 * Flash loan configuration for single-tx execution.
 * When provided, solvers will take a flash loan and your post-hook
 * should borrow to repay it (via PushToken to the borrower address).
 */
export interface FlashLoanConfig {
  /** Flash loan liquidity provider address (e.g., Aave Pool, Morpho) */
  lender: Address;
  /** Token to borrow (should match sellToken) */
  token: Address;
  /** Total amount to borrow across all chunks */
  amount: bigint;
}

/**
 * Input for building a CoW limit order with lending integration.
 */
export interface CowLimitOrderInput {
  // === Order params ===
  /** Token to sell (e.g., debt token for leverage) */
  sellToken: Address;
  /** Token to buy (e.g., collateral token for leverage) */
  buyToken: Address;
  /** Amount to sell per chunk (uniform for all chunks) */
  chunkSize: bigint;
  /** Minimum amount to receive per chunk (slippage protection) */
  minBuyPerChunk: bigint;
  /** Total amount to process across all chunks */
  totalAmount: bigint;

  // === Per-chunk instructions ===
  /** 
   * Instructions for each chunk. 
   * If fewer entries than actual iterations, the last entry is reused.
   */
  chunks: ChunkInstructions[];

  // === Completion ===
  /** How to determine when the order is complete */
  completion: CompletionType;
  /** Target value (interpretation depends on completion type) - e.g., number of iterations */
  targetValue: number;
  /** Minimum health factor to maintain (safety check) - as string like "1.1" */
  minHealthFactor?: string;

  // === Flash loan (optional) ===
  /** Flash loan config for single-tx execution */
  flashLoan?: FlashLoanConfig;

  // === Seed amount (for non-flash-loan mode) ===
  /** Amount to seed OrderManager for first chunk (pulled from user) */
  seedAmount?: bigint;

  // === Pre-order instructions (optional) ===
  /** 
   * Instructions to execute BEFORE creating the order (e.g., initial deposit, seed borrow).
   * These will be included in authorization checks but executed separately.
   */
  preOrderInstructions?: ProtocolInstruction[];
}

/**
 * A transaction call ready for batching
 */
export interface Call {
  to: Address;
  data: Hex;
}

/**
 * Result of building order calls
 */
export interface BuildOrderResult {
  /** All calls in correct execution order, ready for batching */
  calls: Call[];
  /** Order salt (deterministic ID) */
  salt: string;
  /** AppData hash registered with CoW API */
  appDataHash: string;
}

// Minimal ABI for order creation
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
] as const;

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Flatten per-iteration instructions to a single array for authorization.
 * Deduplicates by combining all unique instructions across iterations.
 */
function flattenInstructions(
  chunks: ChunkInstructions[],
  preOrderInstructions?: ProtocolInstruction[]
): ProtocolInstruction[] {
  const flattened: ProtocolInstruction[] = [];
  const seen = new Set<string>();

  // Include pre-order instructions first
  if (preOrderInstructions) {
    for (const inst of preOrderInstructions) {
      const key = `${inst.protocolName}:${inst.data}`;
      if (!seen.has(key)) {
        seen.add(key);
        flattened.push(inst);
      }
    }
  }

  // Include chunk instructions
  for (const chunk of chunks) {
    for (const inst of [...chunk.preInstructions, ...chunk.postInstructions]) {
      const key = `${inst.protocolName}:${inst.data}`;
      if (!seen.has(key)) {
        seen.add(key);
        flattened.push(inst);
      }
    }
  }

  return flattened;
}

/**
 * Hook for creating CoW Protocol limit orders with lending integration.
 * 
 * This hook abstracts away CoW Protocol complexity:
 * - Generates deterministic order salt
 * - Builds and registers appData with pre/post hooks
 * - Handles delegation to OrderManager
 * - Builds authorization calls for lending operations
 * - Returns all calls in correct order for batching
 * 
 * @example
 * ```tsx
 * const { buildOrderCalls, isReady, orderManagerAddress } = useCowLimitOrder();
 * 
 * const result = await buildOrderCalls({
 *   sellToken: debtToken,
 *   buyToken: collateralToken,
 *   chunkSize: parseUnits("1000", 6),
 *   minBuyPerChunk: parseUnits("0.5", 18),
 *   totalAmount: parseUnits("3000", 6),
 *   chunks: [
 *     { preInstructions: [], postInstructions: depositAndBorrowInstructions },
 *     { preInstructions: [], postInstructions: depositAndBorrowInstructions },
 *     { preInstructions: [], postInstructions: depositOnlyInstructions },
 *   ],
 *   completion: CompletionType.Iterations,
 *   targetValue: 3n,
 *   flashLoan: { lender: aavePool, token: debtToken, amount: totalFlashLoan },
 * });
 * 
 * // Execute all calls via wallet batching (EIP-5792) or sequentially
 * await walletClient.sendCalls({ calls: result.calls });
 * ```
 */
export function useCowLimitOrder() {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Get deployed contracts
  const { data: orderManagerContract, isLoading: isOrderManagerLoading } = useDeployedContractInfo({
    contractName: "KapanOrderManager",
  });
  const { data: routerContract } = useDeployedContractInfo({
    contractName: "KapanRouter",
  });

  const orderManagerAddress = orderManagerContract?.address as Address | undefined;

  // Router hook for authorization
  const { getAuthorizations } = useKapanRouterV2();

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
      logger.error("[useCowLimitOrder] Error checking delegation:", error);
      return false;
    }
  }, [userAddress, orderManagerAddress, publicClient, routerContract]);

  /**
   * Build all calls needed for order creation.
   * 
   * This handles:
   * 1. Salt generation
   * 2. AppData building and registration with CoW API
   * 3. Delegation call (if needed)
   * 4. Authorization calls for lending operations
   * 5. Seed token approval (for non-flash-loan mode)
   * 6. Order creation call
   * 
   * @returns All calls in correct order, plus salt and appDataHash
   */
  const buildOrderCalls = useCallback(
    async (input: CowLimitOrderInput): Promise<BuildOrderResult | undefined> => {
      if (!userAddress || !orderManagerAddress || !routerContract) {
        logger.error("[useCowLimitOrder] Missing context for buildOrderCalls");
        return undefined;
      }

      if (!isChainSupported(chainId)) {
        logger.error("[useCowLimitOrder] Chain not supported:", chainId);
        return undefined;
      }

      // 1. Generate salt
      const salt = generateOrderSalt();
      logger.debug("[useCowLimitOrder] Generated salt:", salt);

      // 2. Build and register appData
      const appDataResult = await buildAndRegisterAppData(
        chainId,
        orderManagerAddress,
        userAddress,
        salt,
        input.flashLoan
          ? {
              flashLoan: {
                lender: input.flashLoan.lender,
                token: input.flashLoan.token,
                amount: input.flashLoan.amount,
              },
            }
          : undefined
      );

      if (!appDataResult.registered) {
        logger.error("[useCowLimitOrder] AppData registration failed:", appDataResult.error);
        return undefined;
      }

      logger.debug("[useCowLimitOrder] AppData registered:", appDataResult.appDataHash);

      // 3. Build order parameters
      const preInstructionsPerIteration = input.chunks.map((c) => c.preInstructions);
      const postInstructionsPerIteration = input.chunks.map((c) => c.postInstructions);

      const orderParams = buildOrderParams({
        user: userAddress,
        sellToken: input.sellToken,
        buyToken: input.buyToken,
        preTotalAmount: input.totalAmount,  // Raw bigint - no parsing needed
        chunkSize: input.chunkSize,          // Raw bigint - no parsing needed
        minBuyPerChunk: input.minBuyPerChunk, // Raw bigint - no parsing needed
        completion: input.completion,
        targetValue: input.targetValue,
        minHealthFactor: input.minHealthFactor ?? "1.1",
        preInstructions: preInstructionsPerIteration,
        postInstructions: postInstructionsPerIteration,
        appDataHash: appDataResult.appDataHash,
        isFlashLoanOrder: !!input.flashLoan,
      });

      // 4. Collect all calls in order
      const calls: Call[] = [];

      // 4a. Check delegation and add call if needed
      const isDelegated = await checkDelegation();
      if (!isDelegated) {
        calls.push({
          to: routerContract.address as Address,
          data: encodeFunctionData({
            abi: routerContract.abi,
            functionName: "setDelegate",
            args: [orderManagerAddress, true],
          }) as Hex,
        });
      }

      // 4b. Get authorization calls for all instructions (including pre-order)
      const allInstructions = flattenInstructions(input.chunks, input.preOrderInstructions);
      if (allInstructions.length > 0) {
        const rawAuthCalls = await getAuthorizations(allInstructions);
        for (const { target, data } of rawAuthCalls) {
          if (target && data && data.length > 0) {
            calls.push({ to: target as Address, data: data as Hex });
          }
        }
      }

      // 4c. Seed token approval (for non-flash-loan mode)
      const seedAmount = input.flashLoan ? 0n : (input.seedAmount ?? 0n);
      if (seedAmount > 0n) {
        calls.push({
          to: input.sellToken,
          data: encodeFunctionData({
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [orderManagerAddress, seedAmount],
          }) as Hex,
        });
      }

      // 4d. Order creation call
      calls.push({
        to: orderManagerAddress,
        data: encodeFunctionData({
          abi: orderManagerContract?.abi ?? ORDER_MANAGER_ABI,
          functionName: "createOrder",
          args: [orderParams as any, salt as `0x${string}`, seedAmount],
        }) as Hex,
      });

      return {
        calls,
        salt,
        appDataHash: appDataResult.appDataHash,
      };
    },
    [userAddress, orderManagerAddress, orderManagerContract, routerContract, chainId, checkDelegation, getAuthorizations]
  );

  /**
   * Whether the hook is ready to build orders
   */
  const isReady = useMemo(() => {
    return !!(
      userAddress &&
      orderManagerAddress &&
      routerContract &&
      isChainSupported(chainId)
    );
  }, [userAddress, orderManagerAddress, routerContract, chainId]);

  /**
   * Build a router call from instructions.
   * Use this for pre-order instructions like initial deposit or seed borrow.
   */
  const buildRouterCall = useCallback(
    (instructions: ProtocolInstruction[]): Call | undefined => {
      if (!routerContract || instructions.length === 0) {
        return undefined;
      }

      return {
        to: routerContract.address as Address,
        data: encodeFunctionData({
          abi: routerContract.abi,
          functionName: "processProtocolInstructions",
          args: [
            instructions.map((inst) => ({
              protocolName: inst.protocolName,
              data: inst.data as `0x${string}`,
            })),
          ],
        }) as Hex,
      };
    },
    [routerContract]
  );

  return {
    /** Build all calls needed for order creation */
    buildOrderCalls,
    /** Build a router call from instructions (for pre-order setup) */
    buildRouterCall,
    /** Whether the hook is ready (wallet connected, contracts deployed, chain supported) */
    isReady,
    /** Order manager contract address */
    orderManagerAddress,
    /** Router contract address */
    routerAddress: routerContract?.address as Address | undefined,
    /** Whether contracts are still loading */
    isLoading: isOrderManagerLoading,
    /** Check if user has delegated to OrderManager */
    checkDelegation,
  };
}
