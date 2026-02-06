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
  encodeAbiParameters,
  keccak256,
  toHex,
} from "viem";
import { AbiCoder } from "ethers";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import {
  buildAndRegisterAppData,
  isChainSupported,
  normalizeProtocolForAppCode,
  type KapanOperationType,
} from "~~/utils/cow";
import {
  ProtocolInstruction,
  createRouterInstruction,
  encodeToOutput,
} from "~~/utils/v2/instructionHelpers";
import { logger } from "~~/utils/logger";

// ============ Types ============

/**
 * Instructions for conditional orders.
 *
 * UTXO Context for KapanConditionalOrderManager:
 * - Pre-hook: Manager prepends ToOutput(sellAmount, sellToken) as UTXO[0]
 * - Post-hook: Manager prepends TWO ToOutputs:
 *   - UTXO[0] = actualSellAmount (sellToken) - for flash loan repayment calculations
 *   - UTXO[1] = actualBuyAmount (buyToken) - received tokens from swap
 *
 * This differs from KapanOrderManager which only prepends buyAmount as UTXO[0] in post-hook!
 */
export interface ConditionalOrderInstructions {
  /** Instructions to run before the swap (UTXO[0] = sellToken amount) */
  preInstructions: ProtocolInstruction[];
  /** Instructions to run after the swap (UTXO[0] = sellAmount, UTXO[1] = buyAmount) */
  postInstructions: ProtocolInstruction[];
  /**
   * For flash loan mode: UTXO index to push for flash loan repayment.
   * NOTE: This is shifted by 2 from the old manager due to the two prepended UTXOs!
   * If set, the hook automatically appends PushToken(index, adapterAddress) to postInstructions.
   */
  flashLoanRepaymentUtxoIndex?: number;
}

/**
 * Flash loan configuration for single-tx execution.
 */
export interface FlashLoanConfig {
  /** Flash loan liquidity provider address (e.g., Aave Pool, Morpho) */
  lender: Address;
  /** Token to borrow (should match sellToken) */
  token: Address;
  /** Amount to borrow per chunk */
  amount: bigint;
}

/**
 * LimitPriceTrigger parameters (matches contract struct)
 */
export interface LimitPriceTriggerParams {
  /** Protocol for price oracle */
  protocolId: Hex;
  /** Protocol-specific context */
  protocolContext: Hex;
  /** Token to sell */
  sellToken: Address;
  /** Token to buy */
  buyToken: Address;
  /** Decimals of sell token */
  sellDecimals: number;
  /** Decimals of buy token */
  buyDecimals: number;
  /** Limit price (8 decimals, like Chainlink) */
  limitPrice: bigint;
  /** true = trigger when price >= limit (take profit), false = trigger when price <= limit (stop loss) */
  triggerAbovePrice: boolean;
  /** Total amount to sell across all chunks (SELL orders) or max willing to sell (BUY orders) */
  totalSellAmount: bigint;
  /** Total amount to buy across all chunks (BUY orders only, ignored for SELL) */
  totalBuyAmount: bigint;
  /** Number of chunks (1 = single execution) */
  numChunks: number;
  /** Maximum slippage tolerance in basis points */
  maxSlippageBps: number;
  /** true = BUY order (exact buy, max sell), false = SELL order (exact sell, min buy) */
  isKindBuy: boolean;
}

/**
 * Input for building a CoW conditional order.
 */
export interface CowConditionalOrderInput {
  // === Trigger params ===
  /** Trigger contract address (e.g., LimitPriceTrigger) */
  triggerAddress: Address;
  /** Encoded trigger parameters */
  triggerStaticData: Hex;

  // === Token configuration ===
  /** Token to sell */
  sellToken: Address;
  /** Token to buy */
  buyToken: Address;

  // === Instructions ===
  /** Pre-swap instructions (encoded as ProtocolInstruction[]) */
  preInstructions: ProtocolInstruction[];
  /** Post-swap instructions (encoded as ProtocolInstruction[]) */
  postInstructions: ProtocolInstruction[];

  // === Lifecycle ===
  /** Max iterations (0 = unlimited until cancelled) */
  maxIterations: number;

  // === Flash loan (optional) ===
  /** Flash loan config for single-tx execution */
  flashLoan?: FlashLoanConfig;
  /** Address to refund remaining sellToken (e.g., adapter for flash loan repayment) */
  sellTokenRefundAddress?: Address;

  // === Operation type (for order categorization) ===
  operationType?: KapanOperationType;
  protocolName?: string;

  // === Order kind ===
  /** true = BUY order (exact buy, max sell), false = SELL order (exact sell, min buy). Default: false (SELL) */
  isKindBuy?: boolean;
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
export interface BuildConditionalOrderResult {
  /** Whether the build succeeded */
  success: boolean;
  /** All calls in correct execution order, ready for batching */
  calls: Call[];
  /** Order salt */
  salt: Hex;
  /** AppData hash registered with CoW API */
  appDataHash: string;
  /** Error message if build failed */
  error?: string;
}

// ============ Protocol ID Helpers ============

/**
 * Get protocol ID bytes4 from protocol name
 */
export function getProtocolId(protocolName: string): Hex {
  const normalized = protocolName.toLowerCase();
  if (normalized.includes("aave")) {
    return keccak256(toHex("aave-v3")).slice(0, 10) as Hex;
  }
  if (normalized.includes("compound")) {
    return keccak256(toHex("compound-v3")).slice(0, 10) as Hex;
  }
  if (normalized.includes("morpho")) {
    return keccak256(toHex("morpho-blue")).slice(0, 10) as Hex;
  }
  if (normalized.includes("euler")) {
    return keccak256(toHex("euler-v2")).slice(0, 10) as Hex;
  }
  // Default to aave
  return keccak256(toHex("aave-v3")).slice(0, 10) as Hex;
}

/**
 * Encode LimitPriceTrigger params for the trigger contract
 *
 * IMPORTANT: Must encode as a tuple to match Solidity's abi.decode(data, (TriggerParams))
 * The struct contains a dynamic `bytes` field, so abi.encode adds an offset pointer.
 * Using separate parameters (not a tuple) produces different encoding that fails to decode.
 */
export function encodeLimitPriceTriggerParams(params: LimitPriceTriggerParams): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "protocolId", type: "bytes4" },
          { name: "protocolContext", type: "bytes" },
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "sellDecimals", type: "uint8" },
          { name: "buyDecimals", type: "uint8" },
          { name: "limitPrice", type: "uint256" },
          { name: "triggerAbovePrice", type: "bool" },
          { name: "totalSellAmount", type: "uint256" },
          { name: "totalBuyAmount", type: "uint256" },
          { name: "numChunks", type: "uint8" },
          { name: "maxSlippageBps", type: "uint256" },
          { name: "isKindBuy", type: "bool" },
        ],
      },
    ],
    [
      {
        protocolId: params.protocolId,
        protocolContext: params.protocolContext,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        sellDecimals: params.sellDecimals,
        buyDecimals: params.buyDecimals,
        limitPrice: params.limitPrice,
        triggerAbovePrice: params.triggerAbovePrice,
        totalSellAmount: params.totalSellAmount,
        totalBuyAmount: params.totalBuyAmount,
        numChunks: params.numChunks,
        maxSlippageBps: BigInt(params.maxSlippageBps),
        isKindBuy: params.isKindBuy,
      },
    ]
  );
}

// Minimal ABI for conditional order creation
const CONDITIONAL_ORDER_MANAGER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "user", type: "address" },
          { name: "trigger", type: "address" },
          { name: "triggerStaticData", type: "bytes" },
          { name: "preInstructions", type: "bytes" },
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "postInstructions", type: "bytes" },
          { name: "appDataHash", type: "bytes32" },
          { name: "maxIterations", type: "uint256" },
          { name: "sellTokenRefundAddress", type: "address" },
          { name: "isKindBuy", type: "bool" },
        ],
        name: "params",
        type: "tuple",
      },
      { name: "salt", type: "bytes32" },
    ],
    name: "createOrder",
    outputs: [{ name: "orderHash", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Use ethers.js AbiCoder for encoding - viem's encodeAbiParameters doesn't properly
// handle empty arrays (returns "0x" which fails Solidity abi.decode)
const coder = AbiCoder.defaultAbiCoder();

/**
 * Encode pre/post instructions as bytes for storage
 * NOTE: Must always return properly ABI-encoded bytes, even for empty arrays!
 * Returning "0x" for empty arrays causes Solidity abi.decode to fail.
 */
function encodeInstructions(instructions: ProtocolInstruction[]): Hex {
  // Use ethers.js which properly encodes empty arrays
  return coder.encode(
    ["tuple(string protocolName, bytes data)[]"],
    [instructions.map(i => [i.protocolName, i.data])],
  ) as Hex;
}

/**
 * Generate a random salt for order creation
 */
function generateOrderSalt(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return ("0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

/**
 * Flatten instructions for authorization checks.
 * For conditional orders, we need to account for the different UTXO layout.
 *
 * IMPORTANT: Prepends dummy ToOutput instructions to simulate the UTXOs that
 * KapanConditionalOrderManager prepends at execution time:
 * - UTXO[0] = actualSellAmount (sellToken)
 * - UTXO[1] = actualBuyAmount (buyToken)
 *
 * This ensures inputIndex references resolve correctly during authorization.
 * We use "worst case" amounts (max slippage) so approvals are sufficient.
 */
function flattenInstructions(
  preInstructions: ProtocolInstruction[],
  postInstructions: ProtocolInstruction[],
  sellToken?: Address,
  buyToken?: Address,
  sellAmount?: bigint,
  buyAmount?: bigint
): ProtocolInstruction[] {
  const flattened: ProtocolInstruction[] = [];
  const seen = new Set<string>();

  // Prepend dummy ToOutput instructions matching what OrderManager prepends at execution time.
  // This ensures inputIndex references resolve correctly during authorization.
  // Use max amounts (worst case) so approvals are sufficient for any execution.
  if (sellToken && sellAmount !== undefined && sellAmount > 0n) {
    // UTXO[0] = actualSellAmount
    flattened.push(createRouterInstruction(encodeToOutput(sellAmount, sellToken)));
  }
  if (buyToken && buyAmount !== undefined && buyAmount > 0n) {
    // UTXO[1] = actualBuyAmount
    flattened.push(createRouterInstruction(encodeToOutput(buyAmount, buyToken)));
  }

  for (const inst of [...preInstructions, ...postInstructions]) {
    const key = `${inst.protocolName}:${inst.data}`;
    if (!seen.has(key)) {
      seen.add(key);
      flattened.push(inst);
    }
  }

  return flattened;
}

/**
 * Hook for creating CoW Protocol conditional orders with trigger-based execution.
 *
 * This hook works with KapanConditionalOrderManager and supports:
 * - LimitPriceTrigger for price-based limit orders
 * - LtvTrigger for auto-deleverage
 * - AutoLeverageTrigger for auto-leverage
 *
 * Key difference from useCowLimitOrder:
 * - Post-hook UTXOs: UTXO[0] = sellAmount, UTXO[1] = buyAmount
 * - (Old manager had: UTXO[0] = buyAmount only)
 *
 * @example
 * ```tsx
 * const { buildOrderCalls, isReady, managerAddress } = useCowConditionalOrder();
 *
 * const result = await buildOrderCalls({
 *   triggerAddress: limitPriceTriggerAddress,
 *   triggerStaticData: encodedParams,
 *   sellToken: oldCollateral,
 *   buyToken: newCollateral,
 *   preInstructions: [],
 *   postInstructions: postHookInstructions, // Reference UTXO[1] for buyAmount!
 *   maxIterations: numChunks,
 *   flashLoan: { lender, token, amount },
 *   sellTokenRefundAddress: adapterAddress,
 * });
 * ```
 */
export function useCowConditionalOrder() {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Get deployed contracts
  // Note: Using type assertions until types are regenerated after deploy
  const { data: conditionalOrderManagerContract, isLoading: isManagerLoading } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager" as "KapanRouter",
  });
  const { data: routerContract } = useDeployedContractInfo({
    contractName: "KapanRouter",
  });
  // LimitPriceTrigger must be deployed for conditional orders to work
  const { data: limitPriceTriggerContract } = useDeployedContractInfo({
    contractName: "LimitPriceTrigger" as "KapanRouter",
  });

  const managerAddress = conditionalOrderManagerContract?.address as Address | undefined;
  const limitPriceTriggerAddress = limitPriceTriggerContract?.address as Address | undefined;

  // Router hook for authorization
  const { getAuthorizations } = useKapanRouterV2();

  /**
   * Check if user has delegated to the ConditionalOrderManager
   */
  const checkDelegation = useCallback(async (): Promise<boolean> => {
    if (!userAddress || !managerAddress || !publicClient || !routerContract) {
      return false;
    }

    try {
      const isDelegated = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "userDelegates",
        args: [userAddress, managerAddress],
      }) as boolean;

      return isDelegated;
    } catch (error) {
      logger.error("[useCowConditionalOrder] Error checking delegation:", error);
      return false;
    }
  }, [userAddress, managerAddress, publicClient, routerContract]);

  /**
   * Build all calls needed for conditional order creation.
   */
  const buildOrderCalls = useCallback(
    async (input: CowConditionalOrderInput): Promise<BuildConditionalOrderResult | undefined> => {
      if (!userAddress || !managerAddress || !routerContract) {
        logger.error("[useCowConditionalOrder] Missing context for buildOrderCalls");
        return undefined;
      }

      if (!isChainSupported(chainId)) {
        logger.error("[useCowConditionalOrder] Chain not supported:", chainId);
        return undefined;
      }

      // Validate: flash loan orders REQUIRE sellTokenRefundAddress (KapanCowAdapter)
      // The adapter handles flash loan repayment - without it, tokens get stuck
      if (input.flashLoan && !input.sellTokenRefundAddress) {
        logger.error("[useCowConditionalOrder] Flash loan orders require sellTokenRefundAddress (KapanCowAdapter) for repayment");
        return {
          success: false,
          calls: [],
          salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
          appDataHash: "",
          error: "Flash loan orders require KapanCowAdapter for repayment. Adapter not configured for this chain.",
        };
      }

      // 1. Generate salt
      const salt = generateOrderSalt();
      logger.debug("[useCowConditionalOrder] Generated salt:", salt);

      // 2. Build and register appData
      // Uses the same hook pattern as KapanOrderManager
      const appDataOptions: Parameters<typeof buildAndRegisterAppData>[4] = {
        operationType: input.operationType,
        protocol: input.protocolName ? normalizeProtocolForAppCode(input.protocolName) : undefined,
      };
      if (input.flashLoan) {
        appDataOptions.flashLoan = {
          lender: input.flashLoan.lender,
          token: input.flashLoan.token,
          amount: input.flashLoan.amount,
          // Use balance-based transfer for conditional orders since amounts are dynamic
          useBalanceTransfer: true,
        };
      }

      const appDataResult = await buildAndRegisterAppData(
        chainId,
        managerAddress,
        userAddress,
        salt,
        appDataOptions
      );

      if (!appDataResult.registered) {
        logger.error("[useCowConditionalOrder] AppData registration failed:", appDataResult.error);
        return {
          success: false,
          calls: [],
          salt,
          appDataHash: appDataResult.appDataHash || "",
          error: `AppData registration failed: ${appDataResult.error}`,
        };
      }

      logger.debug("[useCowConditionalOrder] AppData registered:", appDataResult.appDataHash);

      // 3. Prepare post-instructions with flash loan repayment if needed
      const finalPostInstructions = [...input.postInstructions];
      if (input.flashLoan && input.sellTokenRefundAddress) {
        // Flash loan repayment is handled via sellTokenRefundAddress in the manager
        // No need to add explicit PushToken - manager does it automatically
      }

      // 4. Build order parameters
      const orderParams = {
        user: userAddress,
        trigger: input.triggerAddress,
        triggerStaticData: input.triggerStaticData,
        preInstructions: encodeInstructions(input.preInstructions),
        sellToken: input.sellToken,
        buyToken: input.buyToken,
        postInstructions: encodeInstructions(finalPostInstructions),
        appDataHash: appDataResult.appDataHash as Hex,
        maxIterations: BigInt(input.maxIterations),
        sellTokenRefundAddress: input.sellTokenRefundAddress || ("0x0000000000000000000000000000000000000000" as Address),
        isKindBuy: input.isKindBuy ?? false,
      };

      // 5. Collect all calls in order
      const calls: Call[] = [];

      // 5a. Check delegation and add call if needed
      const isDelegated = await checkDelegation();
      if (!isDelegated) {
        calls.push({
          to: routerContract.address as Address,
          data: encodeFunctionData({
            abi: routerContract.abi,
            functionName: "setDelegate",
            args: [managerAddress, true],
          }) as Hex,
        });
      }

      // 5b. Get authorization calls for all instructions
      // Calculate worst-case amounts for authorization (with 20% buffer for interest/slippage)
      const AUTH_BUFFER_BPS = 2000n; // 20% buffer
      const perChunkSellAmount = input.flashLoan?.amount ?? 0n;
      const totalSellAmount = perChunkSellAmount * BigInt(input.maxIterations);
      const sellAmountWithBuffer = totalSellAmount + (totalSellAmount * AUTH_BUFFER_BPS) / 10000n;
      // For buyAmount, use same as sellAmount with buffer (conservative 1:1 estimate)
      // This covers most swap scenarios; gateways typically use max approval anyway
      const buyAmountWithBuffer = sellAmountWithBuffer;

      const allInstructions = flattenInstructions(
        input.preInstructions,
        finalPostInstructions,
        input.sellToken,
        input.buyToken,
        sellAmountWithBuffer,
        buyAmountWithBuffer
      );
      if (allInstructions.length > 0) {
        const rawAuthCalls = await getAuthorizations(allInstructions);
        const seenAuthCalls = new Set<string>();
        for (const { target, data } of rawAuthCalls) {
          if (target && data && data.length > 0) {
            const key = `${target.toLowerCase()}:${data.toLowerCase()}`;
            if (!seenAuthCalls.has(key)) {
              seenAuthCalls.add(key);
              calls.push({ to: target as Address, data: data as Hex });
            }
          }
        }
      }

      // 5c. Order creation call
      calls.push({
        to: managerAddress,
        data: encodeFunctionData({
          abi: conditionalOrderManagerContract?.abi ?? CONDITIONAL_ORDER_MANAGER_ABI,
          functionName: "createOrder",
          args: [orderParams as Parameters<typeof encodeFunctionData>["args"], salt],
        }) as Hex,
      });

      return {
        success: true,
        calls,
        salt,
        appDataHash: appDataResult.appDataHash,
      };
    },
    [userAddress, managerAddress, conditionalOrderManagerContract, routerContract, chainId, checkDelegation, getAuthorizations]
  );

  /**
   * Whether the hook is ready to build orders
   */
  const isReady = useMemo(() => {
    return !!(
      userAddress &&
      managerAddress &&
      routerContract &&
      isChainSupported(chainId)
    );
  }, [userAddress, managerAddress, routerContract, chainId]);

  return {
    /** Build all calls needed for conditional order creation */
    buildOrderCalls,
    /** Whether the hook is ready (wallet connected, contracts deployed, chain supported) */
    isReady,
    /** Conditional order manager contract address */
    managerAddress,
    /** Router contract address */
    routerAddress: routerContract?.address as Address | undefined,
    /** LimitPriceTrigger contract address */
    limitPriceTriggerAddress,
    /** Whether contracts are still loading */
    isLoading: isManagerLoading,
    /** Check if user has delegated to ConditionalOrderManager */
    checkDelegation,
    /** Helper to encode LimitPriceTrigger params */
    encodeLimitPriceTriggerParams,
    /** Helper to get protocol ID */
    getProtocolId,
  };
}
