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
const ORDER_MANAGER_HOOK_ABI = [
  "function executePreHookBySalt(address user, bytes32 salt, uint256 chunkIndex) external",
  "function executePostHookBySalt(address user, bytes32 salt) external",
];

const orderManagerIface = new Interface(ORDER_MANAGER_HOOK_ABI);

/**
 * Encode a pre-hook call for KapanOrderManager using (user, salt) lookup
 * This allows pre-computing appData before order creation
 * The pre-hook withdraws collateral and prepares tokens for the swap
 */
export function encodePreHookCall(
  orderManagerAddress: string,
  user: string,
  salt: string,
  chunkIndex: number = 0
): string {
  return orderManagerIface.encodeFunctionData("executePreHookBySalt", [
    user,
    salt,
    chunkIndex,
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
 * @param orderManagerAddress - Address of the KapanOrderManager contract
 * @param user - User address (order creator)
 * @param salt - Order salt (generated before order creation)
 * @param chunkIndex - Current chunk index (default 0 for first chunk)
 * @param options - Additional options
 * @returns The AppData document ready for hashing/registration
 */
export function buildKapanAppData(
  orderManagerAddress: string,
  user: string,
  salt: string,
  chunkIndex: number = 0,
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
  }
): AppDataDocument {
  const preHookGasLimit = options?.preHookGasLimit ?? "1000000";
  const postHookGasLimit = options?.postHookGasLimit ?? "1000000";

  // Encode the hook calls to OrderManager using (user, salt) lookup
  const preHookCalldata = encodePreHookCall(orderManagerAddress, user, salt, chunkIndex);
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
    version: "1.6.0",
    appCode: "KapanFinance",
    metadata: {
      hooks: {
        pre: preHooks,
        post: postHooks,
      },
    },
  };

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
    const response = await fetch(`${apiUrl}/api/v1/app_data/${appDataHash}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullAppData: JSON.stringify(appDataDoc),
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
    return { success: false, error: `API error ${response.status}: ${errorText}` };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

/**
 * Helper to build and register AppData in one call
 * 
 * @param chainId - Chain ID for CoW API
 * @param orderManagerAddress - KapanOrderManager contract address
 * @param user - User address (order creator)
 * @param salt - Order salt (must match what will be used in createOrder)
 * @param chunkIndex - Current chunk index (default 0)
 * @param options - Additional options
 * @returns Object with appDataDoc, appDataHash, and registration result
 */
export async function buildAndRegisterAppData(
  chainId: number,
  orderManagerAddress: string,
  user: string,
  salt: string,
  chunkIndex: number = 0,
  options?: Parameters<typeof buildKapanAppData>[4]
): Promise<{
  appDataDoc: AppDataDocument;
  appDataHash: string;
  registered: boolean;
  error?: string;
}> {
  const appDataDoc = buildKapanAppData(orderManagerAddress, user, salt, chunkIndex, options);
  const appDataHash = computeAppDataHash(appDataDoc);
  
  const result = await registerAppData(chainId, appDataHash, appDataDoc);
  
  return {
    appDataDoc,
    appDataHash,
    registered: result.success,
    error: result.error,
  };
}
