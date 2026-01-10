/**
 * CoW Order Recovery Utility
 *
 * When an order is created on-chain but WatchTower doesn't pick it up,
 * this utility can parse the transaction and attempt to re-register
 * the appData with the CoW API to surface the actual error.
 */

import { AbiCoder, Interface } from "ethers";
import { PublicClient } from "viem";
import { buildKapanAppData, AppDataDocument, registerAppData, computeAppDataHash } from "./appData";
import { COW_FLASH_LOAN_PROVIDERS } from "./addresses";

// ABI for decoding
const orderManagerAbi = [
  "function createOrder(tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash, bool isFlashLoanOrder) params, bytes32 salt, uint256 seedAmount) returns (bytes32)",
  "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash, bool isFlashLoanOrder) params, uint8 status, uint256 executedAmount, uint256 iterationCount, uint256 createdAt))",
  "function orderSalts(bytes32 orderHash) view returns (bytes32)",
  "event OrderCreated(bytes32 indexed orderHash, address indexed user, address sellToken, address buyToken, uint256 totalAmount, uint256 chunkSize)",
];

const orderManagerIface = new Interface(orderManagerAbi);
const coder = AbiCoder.defaultAbiCoder();

// RouterInstruction type for decoding
const ROUTER_INSTRUCTION_TYPE = "tuple(uint256 amount, address token, address user, uint8 instructionType)";
const PROTOCOL_INSTRUCTION_TYPE = "tuple(string protocolName, bytes data)[]";

export interface RecoveryResult {
  success: boolean;
  orderHash?: string;
  user?: string;
  salt?: string;
  sellToken?: string;
  buyToken?: string;
  isFlashLoanOrder?: boolean;
  storedAppDataHash?: string;
  computedAppDataHash?: string;
  hashMatch?: boolean;
  flashLoanAmount?: string;
  flashLoanToken?: string;
  flashLoanProvider?: string;
  appDataDoc?: AppDataDocument;
  apiResult?: {
    success: boolean;
    error?: string;
    computedHash?: string;
  };
  error?: string;
  debug?: Record<string, unknown>;
}

/**
 * Try to decode a router instruction
 */
function tryDecodeRouterInstruction(data: string): { amount: bigint; token: string; instrType: number } | null {
  try {
    const routerInstr = coder.decode([ROUTER_INSTRUCTION_TYPE], data);
    const [amount, token, , instrType] = routerInstr[0] as [bigint, string, string, number];
    return { amount, token, instrType };
  } catch {
    return null;
  }
}

/**
 * Try to decode a router instruction with InputPtr variant
 */
function tryDecodeRouterInstructionWithInput(data: string): { amount: bigint; token: string; instrType: number } | null {
  try {
    const routerInstrWithInput = coder.decode(
      [ROUTER_INSTRUCTION_TYPE, "tuple(uint256 index)"],
      data
    );
    const decoded = routerInstrWithInput as unknown as [[bigint, string, string, number], { index: bigint }];
    const [amount, token, , instrType] = decoded[0];
    return { amount, token, instrType };
  } catch {
    return null;
  }
}

/**
 * Find PullToken instruction in decoded instructions
 */
function findPullTokenInstruction(instructions: Array<{ protocolName: string; data: string }>): { amount: bigint; token: string } | null {
  for (const instr of instructions) {
    if (instr.protocolName !== "router") continue;

    // Try standard decode
    const standard = tryDecodeRouterInstruction(instr.data);
    if (standard && standard.instrType === 1) {
      return { amount: standard.amount, token: standard.token };
    }

    // Try InputPtr variant
    const withInput = tryDecodeRouterInstructionWithInput(instr.data);
    if (withInput && withInput.instrType === 1) {
      return { amount: withInput.amount, token: withInput.token };
    }
  }
  return null;
}

/**
 * Decode pre-instructions to extract flash loan amount
 * For close-with-collateral, first instruction is PullToken(amount, token, orderManager)
 */
function extractFlashLoanAmountFromInstructions(preInstructionsBytes: string): { amount: bigint; token: string } | null {
  try {
    // Decode as ProtocolInstruction[]
    const decoded = coder.decode([PROTOCOL_INSTRUCTION_TYPE], preInstructionsBytes);
    const instructions = decoded[0] as Array<{ protocolName: string; data: string }>;

    if (instructions.length === 0) return null;

    return findPullTokenInstruction(instructions);
  } catch (e) {
    console.error("[extractFlashLoanAmount] Failed to decode instructions:", e);
    return null;
  }
}

/** Order params type from transaction decoding */
interface OrderParams {
  user: string;
  preInstructionsPerIteration: string[];
  preTotalAmount: bigint;
  sellToken: string;
  buyToken: string;
  chunkSize: bigint;
  minBuyPerChunk: bigint;
  postInstructionsPerIteration: string[];
  completion: number;
  targetValue: bigint;
  minHealthFactor: bigint;
  appDataHash: string;
  isFlashLoanOrder: boolean;
}

/**
 * Decode createOrder transaction input
 */
function decodeCreateOrderTx(input: string, debug: Record<string, unknown>): { params: OrderParams; salt: string; seedAmount: bigint } | { error: string } {
  try {
    const decoded = orderManagerIface.decodeFunctionData("createOrder", input);
    const params = decoded[0] as OrderParams;
    const salt = decoded[1] as string;
    const seedAmount = decoded[2] as bigint;
    debug.decodedParams = {
      user: params.user,
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      isFlashLoanOrder: params.isFlashLoanOrder,
      appDataHash: params.appDataHash,
    };
    debug.salt = salt;
    debug.seedAmount = seedAmount.toString();
    return { params, salt, seedAmount };
  } catch (e) {
    return { error: `Failed to decode createOrder call: ${e}` };
  }
}

/**
 * Extract order hash from transaction receipt
 */
function extractOrderHashFromReceipt(
  receipt: Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>,
  debug: Record<string, unknown>
): string | undefined {
  const orderCreatedTopic = orderManagerIface.getEvent("OrderCreated")?.topicHash;
  const orderCreatedLog = receipt.logs.find(log =>
    log.topics[0]?.toLowerCase() === orderCreatedTopic?.toLowerCase()
  );

  if (orderCreatedLog && orderCreatedLog.topics[1]) {
    const orderHash = orderCreatedLog.topics[1];
    debug.orderHash = orderHash;
    return orderHash;
  }
  return undefined;
}

/**
 * Extract flash loan info from order params
 */
function extractFlashLoanInfo(
  params: OrderParams,
  debug: Record<string, unknown>
): { amount?: bigint; token?: string } {
  if (!params.isFlashLoanOrder || params.preInstructionsPerIteration.length === 0) {
    return {};
  }

  const extracted = extractFlashLoanAmountFromInstructions(params.preInstructionsPerIteration[0]);
  if (extracted) {
    debug.extractedFlashLoan = {
      amount: extracted.amount.toString(),
      token: extracted.token,
    };
    return { amount: extracted.amount, token: extracted.token };
  }

  // Fallback: for close-with-collateral, flash loan token is buyToken
  debug.flashLoanFallback = "Using buyToken as flash loan token";
  return { token: params.buyToken };
}

/**
 * Try to match appData with different flash loan providers
 */
function tryMatchAppDataWithProviders(
  orderManagerAddress: string,
  params: OrderParams,
  salt: string,
  chainId: number,
  flashLoanAmount: bigint,
  flashLoanToken: string,
  debug: Record<string, unknown>
): { appDataDoc: AppDataDocument; provider: string; hash: string } | undefined {
  const providers = COW_FLASH_LOAN_PROVIDERS[chainId] || [];

  for (const provider of providers) {
    const appDataDoc = buildKapanAppData(
      orderManagerAddress,
      params.user,
      salt,
      chainId,
      {
        flashLoan: {
          lender: provider.address,
          token: flashLoanToken,
          amount: flashLoanAmount,
        },
      }
    );

    const hash = computeAppDataHash(appDataDoc);
    debug[`tried_${provider.provider}`] = hash;

    if (hash.toLowerCase() === params.appDataHash.toLowerCase()) {
      return { appDataDoc, provider: provider.provider, hash };
    }
  }

  return undefined;
}

/**
 * Build appData for flash loan order
 */
function buildFlashLoanAppData(
  orderManagerAddress: string,
  params: OrderParams,
  salt: string,
  chainId: number,
  flashLoanAmount: bigint,
  flashLoanToken: string,
  debug: Record<string, unknown>
): { appDataDoc: AppDataDocument; provider: string; hash: string } {
  // Try to match with known providers
  const matched = tryMatchAppDataWithProviders(
    orderManagerAddress, params, salt, chainId, flashLoanAmount, flashLoanToken, debug
  );
  if (matched) return matched;

  // If no match, use default provider
  const providers = COW_FLASH_LOAN_PROVIDERS[chainId] || [];
  const appDataDoc = buildKapanAppData(
    orderManagerAddress,
    params.user,
    salt,
    chainId,
    {
      flashLoan: {
        lender: providers[0]?.address || "",
        token: flashLoanToken,
        amount: flashLoanAmount,
      },
    }
  );
  return {
    appDataDoc,
    provider: "default (no match)",
    hash: computeAppDataHash(appDataDoc),
  };
}

/**
 * Build appData for order (handles both flash loan and regular orders)
 */
function buildOrderAppData(
  orderManagerAddress: string,
  params: OrderParams,
  salt: string,
  chainId: number,
  flashLoanAmount: bigint | undefined,
  flashLoanToken: string | undefined,
  debug: Record<string, unknown>
): { appDataDoc: AppDataDocument; provider?: string; hash: string } {
  if (params.isFlashLoanOrder && flashLoanAmount && flashLoanToken) {
    return buildFlashLoanAppData(
      orderManagerAddress, params, salt, chainId, flashLoanAmount, flashLoanToken, debug
    );
  }

  // Non-flash-loan order
  const appDataDoc = buildKapanAppData(orderManagerAddress, params.user, salt, chainId);
  return { appDataDoc, hash: computeAppDataHash(appDataDoc) };
}

/**
 * Recover order data from a transaction hash
 */
export async function recoverOrderFromTx(
  txHash: string,
  chainId: number,
  publicClient: PublicClient,
  orderManagerAddress: string
): Promise<RecoveryResult> {
  const debug: Record<string, unknown> = {};

  try {
    // 1. Fetch transaction
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    if (!tx) {
      return { success: false, error: "Transaction not found" };
    }
    debug.txTo = tx.to;
    debug.txFrom = tx.from;

    // 2. Decode createOrder call
    const decoded = decodeCreateOrderTx(tx.input, debug);
    if ("error" in decoded) {
      return { success: false, error: decoded.error, debug };
    }
    const { params, salt } = decoded;

    // 3. Get OrderCreated event from receipt
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt) {
      return { success: false, error: "Transaction receipt not found", debug };
    }

    const orderHash = extractOrderHashFromReceipt(receipt, debug);

    // 4. Extract flash loan info if needed
    const flashLoanInfo = extractFlashLoanInfo(params, debug);

    // 5. Build appData
    const { appDataDoc, provider, hash: computedHash } = buildOrderAppData(
      orderManagerAddress, params, salt, chainId,
      flashLoanInfo.amount, flashLoanInfo.token, debug
    );

    const hashMatch = computedHash.toLowerCase() === params.appDataHash.toLowerCase();

    // 6. Attempt to register with CoW API
    const apiResult = await registerAppData(chainId, computedHash, appDataDoc);

    return {
      success: true,
      orderHash,
      user: params.user,
      salt,
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      isFlashLoanOrder: params.isFlashLoanOrder,
      storedAppDataHash: params.appDataHash,
      computedAppDataHash: computedHash,
      hashMatch,
      flashLoanAmount: flashLoanInfo.amount?.toString(),
      flashLoanToken: flashLoanInfo.token,
      flashLoanProvider: provider,
      appDataDoc,
      apiResult,
      debug,
    };
  } catch (e) {
    return {
      success: false,
      error: `Recovery failed: ${e}`,
      debug,
    };
  }
}

/**
 * Directly attempt to register appData without parsing tx
 * Useful when we have the parameters already
 */
export async function retryAppDataRegistration(
  chainId: number,
  orderManagerAddress: string,
  user: string,
  salt: string,
  flashLoanConfig?: {
    lender: string;
    token: string;
    amount: bigint;
  }
): Promise<{
  success: boolean;
  appDataHash?: string;
  appDataDoc?: AppDataDocument;
  apiResult?: { success: boolean; error?: string; computedHash?: string };
  error?: string;
}> {
  try {
    const appDataDoc = buildKapanAppData(
      orderManagerAddress,
      user,
      salt,
      chainId,
      flashLoanConfig ? { flashLoan: flashLoanConfig } : undefined
    );

    const appDataHash = computeAppDataHash(appDataDoc);
    const apiResult = await registerAppData(chainId, appDataHash, appDataDoc);

    return {
      success: apiResult.success,
      appDataHash,
      appDataDoc,
      apiResult,
    };
  } catch (e) {
    return {
      success: false,
      error: `Registration failed: ${e}`,
    };
  }
}

/**
 * CoW API order response
 */
export interface CowOrder {
  uid: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  kind: string;
  owner: string;
  appData: string;
  creationDate: string;
  status: "open" | "fulfilled" | "cancelled" | "expired" | "presignaturePending";
  invalidated: boolean;
  class: "market" | "limit" | "liquidity";
}

/**
 * Fetch orders for an owner from the CoW API
 */
export async function fetchOrdersForOwner(
  chainId: number,
  owner: string
): Promise<{ success: boolean; orders?: CowOrder[]; error?: string }> {
  try {
    const response = await fetch(`/api/cow/${chainId}/orders?owner=${owner}`);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `API error ${response.status}: ${errorText}` };
    }

    const orders = await response.json();
    return { success: true, orders };
  } catch (e) {
    return { success: false, error: `Network error: ${e}` };
  }
}

/**
 * Fetch a specific order by UID from the CoW API
 */
export async function fetchOrderByUid(
  chainId: number,
  uid: string
): Promise<{ success: boolean; order?: CowOrder; error?: string }> {
  try {
    const response = await fetch(`/api/cow/${chainId}/orders?uid=${uid}`);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `API error ${response.status}: ${errorText}` };
    }

    const order = await response.json();
    return { success: true, order };
  } catch (e) {
    return { success: false, error: `Network error: ${e}` };
  }
}

/**
 * Check if an order exists in the CoW orderbook by checking orders for an owner
 * and looking for matching appDataHash
 */
export async function checkOrderInOrderbook(
  chainId: number,
  orderManagerAddress: string,
  appDataHash: string
): Promise<{ found: boolean; order?: CowOrder; error?: string }> {
  const result = await fetchOrdersForOwner(chainId, orderManagerAddress);

  if (!result.success || !result.orders) {
    return { found: false, error: result.error };
  }

  // Look for order with matching appDataHash
  const matchingOrder = result.orders.find(
    order => order.appData.toLowerCase() === appDataHash.toLowerCase()
  );

  if (matchingOrder) {
    return { found: true, order: matchingOrder };
  }

  return { found: false };
}
