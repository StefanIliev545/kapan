import { keccak256, toUtf8Bytes, Interface } from "ethers";
import { getCowApiUrl } from "./addresses";

/**
 * Hook definition for CoW AppData
 */
export interface CowHook {
  /** Target contract address */
  target: string;
  /** Encoded calldata for the hook */
  callData: string;
  /** Gas limit for hook execution */
  gasLimit: string;
}

/**
 * Flash loan metadata for CoW Protocol (schema v0.2.0)
 * When included in appData, solvers will take a flash loan on behalf of the user
 * @see https://docs.cow.fi/cow-protocol/concepts/flash-loans/integrators
 */
export interface FlashLoanMetadata {
  /** Flash loan liquidity provider address (e.g., Aave Pool, Balancer Vault) */
  liquidityProvider: string;
  /** Protocol adapter address - the CoW flash loan router */
  protocolAdapter: string;
  /** Receiver address - who receives the flash loaned tokens */
  receiver: string;
  /** Token to borrow */
  token: string;
  /** Amount to borrow (in wei/atoms as string) */
  amount: string;
}

/**
 * AppData document structure for CoW Protocol
 * @see https://docs.cow.fi/cow-protocol/reference/sdks/app-data
 */
export interface AppDataDocument {
  version: string;
  appCode: string;
  metadata: {
    hooks?: {
      pre?: CowHook[];
      post?: CowHook[];
    };
    /** Optional: Flash loan configuration for single-tx leverage */
    flashloan?: FlashLoanMetadata;
    /** Optional: Partner fee configuration */
    partnerFee?: {
      bps: number;
      recipient: string;
    };
    /** Optional: Quote information */
    quote?: {
      slippageBps: number;
    };
  };
}

// ABI for KapanOrderManager hook functions
// Using (user, salt) variant allows pre-computing appData before order creation
// Note: chunkIndex is NOT passed - the contract reads it from iterationCount
// This allows the same appData to work for ALL chunks
const ORDER_MANAGER_HOOK_ABI = [
  "function executePreHookBySalt(address user, bytes32 salt) external",
  "function executePostHookBySalt(address user, bytes32 salt) external",
];

const orderManagerIface = new Interface(ORDER_MANAGER_HOOK_ABI);

/**
 * Encode a pre-hook call for KapanOrderManager using (user, salt) lookup
 * This allows pre-computing appData before order creation
 * The pre-hook withdraws collateral and prepares tokens for the swap
 * Note: Chunk index is determined by the contract from iterationCount,
 * so the same calldata works for all chunks.
 */
export function encodePreHookCall(
  orderManagerAddress: string,
  user: string,
  salt: string
): string {
  return orderManagerIface.encodeFunctionData("executePreHookBySalt", [
    user,
    salt,
  ]);
}

/**
 * Encode a post-hook call for KapanOrderManager using (user, salt) lookup
 * This allows pre-computing appData before order creation
 * The post-hook deposits the swapped tokens and updates order state
 */
export function encodePostHookCall(
  orderManagerAddress: string,
  user: string,
  salt: string
): string {
  return orderManagerIface.encodeFunctionData("executePostHookBySalt", [
    user,
    salt,
  ]);
}



/**
 * Build the full AppData document for a Kapan CoW order
 * 
 * Uses (user, salt) lookup pattern which allows pre-computing appData BEFORE
 * the order is created on-chain. This is critical because:
 * 1. appDataHash must be included in the on-chain order params
 * 2. appData (with hooks) must be registered with CoW API
 * 3. Both must reference the same (user, salt) that will be used in createOrder()
 * 
 * The same appData works for ALL chunks because the contract determines
 * the current chunk index from its own iterationCount state.
 * 
 * @param orderManagerAddress - Address of the KapanOrderManager contract
 * @param user - User address (order creator)
 * @param salt - Order salt (generated before order creation)
 * @param options - Additional options
 * @returns The AppData document ready for hashing/registration
 */
export function buildKapanAppData(
  orderManagerAddress: string,
  user: string,
  salt: string,
  options?: {
    /** Gas limit for pre-hook (default: 1000000) */
    preHookGasLimit?: string;
    /** Gas limit for post-hook (default: 1000000) */
    postHookGasLimit?: string;
    /** Partner fee in basis points */
    partnerFeeBps?: number;
    /** Partner fee recipient */
    partnerFeeRecipient?: string;
    /** Slippage tolerance in basis points */
    slippageBps?: number;
    /** Flash loan configuration for single-tx leverage (schema v0.2.0) */
    flashLoan?: {
      /** Flash loan liquidity provider (Aave pool, Balancer vault, etc.) */
      lender: string;
      /** CoW protocol adapter address (AaveBorrower or ERC3156Borrower) */
      protocolAdapter: string;
      /** Token to borrow */
      token: string;
      /** Amount to borrow */
      amount: bigint;
    };
  }
): AppDataDocument {
  const preHookGasLimit = options?.preHookGasLimit ?? "1000000";
  const postHookGasLimit = options?.postHookGasLimit ?? "1000000";

  // Encode the hook calls to OrderManager using (user, salt) lookup
  // Note: chunkIndex is NOT passed - contract reads from iterationCount
  const preHookCalldata = encodePreHookCall(orderManagerAddress, user, salt);
  const postHookCalldata = encodePostHookCall(orderManagerAddress, user, salt);

  // Hooks are executed by Settlement → HooksTrampoline → target
  // So we specify OrderManager as the target directly (not wrapped in another trampoline call)
  const preHooks: CowHook[] = [{
    target: orderManagerAddress,
    callData: preHookCalldata,
    gasLimit: preHookGasLimit,
  }];

  const postHooks: CowHook[] = [{
    target: orderManagerAddress,
    callData: postHookCalldata,
    gasLimit: postHookGasLimit,
  }];

  const appData: AppDataDocument = {
    version: "1.12.0",
    appCode: "KapanFinance",
    metadata: {
      hooks: {
        pre: preHooks,
        post: postHooks,
      },
    },
  };

  // Add flash loan metadata if provided (schema v0.2.0)
  // This hints to CoW solvers to take a flash loan for single-tx execution
  // - liquidityProvider: The flash loan lender (Aave pool, Balancer vault, etc.)
  // - protocolAdapter: The CoW flash loan router's borrower contract
  // - receiver: Who receives the flash loaned tokens (the orderManager)
  if (options?.flashLoan) {
    appData.metadata.flashloan = {
      liquidityProvider: options.flashLoan.lender,
      protocolAdapter: options.flashLoan.protocolAdapter,
      receiver: orderManagerAddress,
      token: options.flashLoan.token,
      amount: options.flashLoan.amount.toString(),
    };
  }

  // Add optional metadata
  if (options?.partnerFeeBps && options?.partnerFeeRecipient) {
    appData.metadata.partnerFee = {
      bps: options.partnerFeeBps,
      recipient: options.partnerFeeRecipient,
    };
  }

  if (options?.slippageBps) {
    appData.metadata.quote = {
      slippageBps: options.slippageBps,
    };
  }

  return appData;
}

/**
 * Compute the keccak256 hash of an AppData document
 * This hash is used as the appData field in GPv2Orders
 */
export function computeAppDataHash(appDataDoc: AppDataDocument): string {
  const json = JSON.stringify(appDataDoc);
  return keccak256(toUtf8Bytes(json));
}

/**
 * Register AppData with the CoW Protocol API
 * This is required so solvers can fetch the full AppData document during settlement
 * 
 * @param chainId - Chain ID
 * @param appDataHash - The keccak256 hash of the AppData document
 * @param appDataDoc - The full AppData document
 * @returns The API response
 */
export async function registerAppData(
  chainId: number,
  appDataHash: string,
  appDataDoc: AppDataDocument
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = getCowApiUrl(chainId);
  if (!apiUrl) {
    return { success: false, error: `Chain ${chainId} not supported by CoW Protocol` };
  }

  try {
    const fullAppDataJson = JSON.stringify(appDataDoc);
    console.log("[registerAppData] Registering appData:");
    console.log("[registerAppData] Full JSON:", fullAppDataJson);
    if (appDataDoc.metadata.flashloan) {
      console.log("[registerAppData] Flash loan config:", JSON.stringify(appDataDoc.metadata.flashloan, null, 2));
    }
    if (appDataDoc.metadata.hooks) {
      console.log("[registerAppData] Pre-hooks:", appDataDoc.metadata.hooks.pre?.length || 0);
      console.log("[registerAppData] Post-hooks:", appDataDoc.metadata.hooks.post?.length || 0);
    }
    
    const response = await fetch(`${apiUrl}/api/v1/app_data/${appDataHash}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullAppData: fullAppDataJson,
      }),
    });

    if (response.ok || response.status === 200 || response.status === 201) {
      return { success: true };
    }

    // 409 Conflict means it already exists - that's fine
    if (response.status === 409) {
      return { success: true };
    }

    const errorText = await response.text();
    console.error("[registerAppData] API error response:", errorText);
    console.error("[registerAppData] Request body was:", fullAppDataJson);
    return { success: false, error: `API error ${response.status}: ${errorText}` };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

/**
 * Helper to build and register AppData in one call
 * 
 * The same appData works for ALL chunks because the contract determines
 * the current chunk index from its own iterationCount state.
 * 
 * @param chainId - Chain ID for CoW API
 * @param orderManagerAddress - KapanOrderManager contract address
 * @param user - User address (order creator)
 * @param salt - Order salt (must match what will be used in createOrder)
 * @param options - Additional options
 * @returns Object with appDataDoc, appDataHash, and registration result
 */
export async function buildAndRegisterAppData(
  chainId: number,
  orderManagerAddress: string,
  user: string,
  salt: string,
  options?: Parameters<typeof buildKapanAppData>[3]
): Promise<{
  appDataDoc: AppDataDocument;
  appDataHash: string;
  registered: boolean;
  error?: string;
}> {
  const appDataDoc = buildKapanAppData(orderManagerAddress, user, salt, options);
  const appDataHash = computeAppDataHash(appDataDoc);
  
  const result = await registerAppData(chainId, appDataHash, appDataDoc);
  
  return {
    appDataDoc,
    appDataHash,
    registered: result.success,
    error: result.error,
  };
}
