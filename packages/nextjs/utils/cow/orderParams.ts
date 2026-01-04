import { AbiCoder, keccak256, toUtf8Bytes, parseUnits } from "ethers";
import { ProtocolInstruction } from "../v2/instructionHelpers";

/**
 * Completion types for Kapan CoW orders
 * Determines when an order is considered complete
 */
export enum CompletionType {
  /** Complete when target LTV is reached */
  TargetLTV = 0,
  /** Complete when target balance is reached */
  TargetBalance = 1,
  /** Complete after N iterations (chunks) */
  Iterations = 2,
  /** Run until manually cancelled */
  UntilCancelled = 3,
}

/**
 * Order status enum
 */
export enum OrderStatus {
  None = 0,
  Active = 1,
  Completed = 2,
  Cancelled = 3,
}

/**
 * Input parameters for creating a Kapan CoW order
 */
export interface KapanOrderInput {
  /** User address (order owner) */
  user: string;
  
  /** 
   * Pre-swap instructions per iteration (e.g., borrow + push to OrderManager)
   * Array where each element is the instructions for that iteration.
   * If fewer entries than iterations, the last entry is reused.
   * 
   * For convenience, can also pass a single ProtocolInstruction[] which will be used for all iterations.
   */
  preInstructions?: ProtocolInstruction[] | ProtocolInstruction[][];
  
  /** Total amount to process across all chunks (raw bigint or human-readable string with decimals) */
  preTotalAmount: string | bigint;
  preTotalAmountDecimals?: number;
  
  /** Token being sold (output of pre-hook) */
  sellToken: string;
  
  /** Token being bought (input to post-hook) */
  buyToken: string;
  
  /** Maximum sell amount per chunk (raw bigint or human-readable string with decimals) */
  chunkSize: string | bigint;
  chunkSizeDecimals?: number;
  
  /** Minimum buy amount per chunk - slippage protection (raw bigint or human-readable string with decimals) */
  minBuyPerChunk: string | bigint;
  minBuyPerChunkDecimals?: number;
  
  /** 
   * Post-swap instructions per iteration (e.g., deposit + borrow for most, deposit-only for last)
   * Array where each element is the instructions for that iteration.
   * If fewer entries than iterations, the last entry is reused.
   * 
   * For convenience, can also pass a single ProtocolInstruction[] which will be used for all iterations.
   * 
   * Typical pattern for multiply:
   * - Iterations 0 to N-2: [deposit, borrow, push] 
   * - Iteration N-1 (last): [deposit only]
   */
  postInstructions?: ProtocolInstruction[] | ProtocolInstruction[][];
  
  /** How to determine when order is complete */
  completion?: CompletionType;
  
  /** Target value (interpretation depends on completion type) */
  targetValue?: number;
  
  /** Minimum health factor to maintain (safety) */
  minHealthFactor?: string;
  
  /** Pre-computed appData hash (includes hooks) */
  appDataHash?: string;
  
  /** Flash loan mode: when true, order.receiver = Settlement (required by CoW solvers) */
  isFlashLoanOrder?: boolean;
}

/**
 * On-chain order parameters struct (matches Solidity)
 */
export interface KapanOrderParams {
  user: string;
  preInstructionsPerIteration: string[];  // Array of encoded instructions per iteration
  preTotalAmount: bigint;
  sellToken: string;
  buyToken: string;
  chunkSize: bigint;
  minBuyPerChunk: bigint;
  postInstructionsPerIteration: string[]; // Array of encoded instructions per iteration
  completion: number;
  targetValue: bigint;
  minHealthFactor: bigint;
  appDataHash: string;
  isFlashLoanOrder: boolean;  // When true, order.receiver = Settlement (required by CoW solvers)
}

/**
 * Order context returned from getOrder() view function
 */
export interface OrderContext {
  params: KapanOrderParams;
  status: OrderStatus;
  executedAmount: bigint;
  iterationCount: bigint;
  createdAt: bigint;
}

const coder = AbiCoder.defaultAbiCoder();

/**
 * Encode protocol instructions array to bytes
 * Format: abi.encode(ProtocolInstruction[])
 */
export function encodeInstructions(instructions: ProtocolInstruction[] | undefined): string {
  if (!instructions || instructions.length === 0) {
    // Encode empty array properly so contract can decode it
    return coder.encode(
      ["tuple(string protocolName, bytes data)[]"],
      [[]]
    );
  }
  
  return coder.encode(
    ["tuple(string protocolName, bytes data)[]"],
    [instructions.map(i => ({
      protocolName: i.protocolName,
      data: i.data,
    }))]
  );
}

/**
 * Check if input is per-iteration instructions (array of arrays)
 */
function isPerIterationInstructions(
  instructions: ProtocolInstruction[] | ProtocolInstruction[][] | undefined
): instructions is ProtocolInstruction[][] {
  if (!instructions || instructions.length === 0) return false;
  // Check if first element is an array (per-iteration) or an object (single set)
  return Array.isArray(instructions[0]);
}

/**
 * Normalize instructions to per-iteration format
 * If single array provided, wraps it in an array (same instructions for all iterations)
 */
function normalizeToPerIteration(
  instructions: ProtocolInstruction[] | ProtocolInstruction[][] | undefined
): ProtocolInstruction[][] {
  if (!instructions || instructions.length === 0) {
    return [[]]; // Single iteration with no instructions
  }
  
  if (isPerIterationInstructions(instructions)) {
    return instructions;
  }
  
  // Single set of instructions - use for all iterations
  return [instructions];
}

/**
 * Encode per-iteration instructions to array of encoded bytes
 */
export function encodePerIterationInstructions(
  instructions: ProtocolInstruction[] | ProtocolInstruction[][] | undefined
): string[] {
  const perIteration = normalizeToPerIteration(instructions);
  return perIteration.map(iter => encodeInstructions(iter));
}

/**
 * Decode protocol instructions from bytes
 */
export function decodeInstructions(data: string): ProtocolInstruction[] {
  if (!data || data === "0x" || data.length <= 2) {
    return [];
  }
  
  try {
    const [decoded] = coder.decode(
      ["tuple(string protocolName, bytes data)[]"],
      data
    );
    return decoded.map((i: any) => ({
      protocolName: i.protocolName,
      data: i.data,
    }));
  } catch {
    return [];
  }
}

/**
 * Parse amount - handles both raw bigint and human-readable string
 */
function parseAmount(value: string | bigint, decimals: number): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  return parseUnits(value, decimals);
}

/**
 * Build order parameters for KapanOrderManager.createOrder()
 * 
 * @param input - User-friendly order input
 * @returns Encoded parameters ready for contract call
 */
export function buildOrderParams(input: KapanOrderInput): KapanOrderParams {
  const preTotalAmountDecimals = input.preTotalAmountDecimals ?? 18;
  const chunkSizeDecimals = input.chunkSizeDecimals ?? 18;
  const minBuyDecimals = input.minBuyPerChunkDecimals ?? 18;
  
  return {
    user: input.user,
    preInstructionsPerIteration: encodePerIterationInstructions(input.preInstructions),
    preTotalAmount: parseAmount(input.preTotalAmount, preTotalAmountDecimals),
    sellToken: input.sellToken,
    buyToken: input.buyToken,
    chunkSize: parseAmount(input.chunkSize, chunkSizeDecimals),
    minBuyPerChunk: parseAmount(input.minBuyPerChunk, minBuyDecimals),
    postInstructionsPerIteration: encodePerIterationInstructions(input.postInstructions),
    completion: input.completion ?? CompletionType.Iterations,
    targetValue: BigInt(input.targetValue ?? 1),
    minHealthFactor: parseUnits(input.minHealthFactor ?? "1.1", 18),
    appDataHash: input.appDataHash ?? keccak256(toUtf8Bytes("kapan-order")),
    isFlashLoanOrder: input.isFlashLoanOrder ?? false,
  };
}

/**
 * Generate a unique salt for order creation
 * Salt is used to make order hashes unique
 */
export function generateOrderSalt(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return "0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute estimated order hash (approximation for UI purposes)
 * Note: Actual order hash is computed on-chain with block.timestamp
 */
export function computeOrderHashPreview(
  params: KapanOrderParams,
  salt: string
): string {
  return keccak256(
    coder.encode(
      [
        "tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash)",
        "bytes32",
        "uint256"
      ],
      [
        params,
        salt,
        0 // placeholder for block.timestamp
      ]
    )
  );
}

/**
 * Parse order context from contract response
 */
export function parseOrderContext(rawContext: any): OrderContext {
  return {
    params: {
      user: rawContext.params.user,
      preInstructionsPerIteration: rawContext.params.preInstructionsPerIteration || [],
      preTotalAmount: BigInt(rawContext.params.preTotalAmount),
      sellToken: rawContext.params.sellToken,
      buyToken: rawContext.params.buyToken,
      chunkSize: BigInt(rawContext.params.chunkSize),
      minBuyPerChunk: BigInt(rawContext.params.minBuyPerChunk),
      postInstructionsPerIteration: rawContext.params.postInstructionsPerIteration || [],
      completion: Number(rawContext.params.completion),
      targetValue: BigInt(rawContext.params.targetValue),
      minHealthFactor: BigInt(rawContext.params.minHealthFactor),
      appDataHash: rawContext.params.appDataHash,
      isFlashLoanOrder: Boolean(rawContext.params.isFlashLoanOrder),
    },
    status: Number(rawContext.status) as OrderStatus,
    executedAmount: BigInt(rawContext.executedAmount),
    iterationCount: BigInt(rawContext.iterationCount),
    createdAt: BigInt(rawContext.createdAt),
  };
}

/**
 * Calculate progress percentage for an order
 */
export function calculateOrderProgress(context: OrderContext): number {
  const { params, executedAmount, iterationCount } = context;
  
  switch (params.completion) {
    case CompletionType.Iterations:
      if (params.targetValue === 0n) return 100;
      return Number((iterationCount * 100n) / params.targetValue);
    
    case CompletionType.TargetBalance:
      if (params.preTotalAmount === 0n) return 100;
      return Number((executedAmount * 100n) / params.preTotalAmount);
    
    case CompletionType.TargetLTV:
      // LTV progress requires reading from lending protocol
      // Return execution-based progress as fallback
      if (params.preTotalAmount === 0n) return 100;
      return Number((executedAmount * 100n) / params.preTotalAmount);
    
    case CompletionType.UntilCancelled:
      return 0; // No progress for until-cancelled orders
    
    default:
      return 0;
  }
}

/**
 * Get human-readable status string
 */
export function getOrderStatusText(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.None:
      return "Not Found";
    case OrderStatus.Active:
      return "Active";
    case OrderStatus.Completed:
      return "Completed";
    case OrderStatus.Cancelled:
      return "Cancelled";
    default:
      return "Unknown";
  }
}

/**
 * Get human-readable completion type string
 */
export function getCompletionTypeText(completion: CompletionType): string {
  switch (completion) {
    case CompletionType.TargetLTV:
      return "Target LTV";
    case CompletionType.TargetBalance:
      return "Target Balance";
    case CompletionType.Iterations:
      return "Fixed Iterations";
    case CompletionType.UntilCancelled:
      return "Until Cancelled";
    default:
      return "Unknown";
  }
}
