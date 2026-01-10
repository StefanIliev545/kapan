import { keccak256, toUtf8Bytes, Interface } from "ethers";
import stringify from "json-stringify-deterministic";
import { getCowApiUrl, COW_FLASH_LOAN_ROUTER, COW_AAVE_BORROWERS, getKapanCowAdapter, getPreferredFlashLoanLender } from "./addresses";
import { BALANCER, ALL_AAVE_V3_POOLS } from "~~/utils/constants";
import { withRetry, isNetworkError, isRateLimitError } from "~~/utils/retry";

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
  /** Optional: dApp identifier for solver recognition (e.g., "cow-sdk://flashloans/aave/v3/collateral-swap") */
  dappId?: string;
}

/**
 * Flash loan metadata for CoW Protocol (v1.10.0 schema - matching working Aave implementation)
 * When included in appData, solvers will take a flash loan on behalf of the user
 * @see https://docs.cow.fi/cow-protocol/concepts/flash-loans/integrators
 * 
 * CRITICAL: Based on analysis of working Aave collateral swap tx 0x9c69c319...:
 * - receiver MUST be the protocolAdapter (AaveBorrower), NOT the final destination
 * - The pre-hook on the borrower handles token routing
 * 
 * Schema:
 * {
 *   "liquidityProvider": "0x...",  // Flash loan provider (Aave Pool)
 *   "protocolAdapter": "0x...",    // CoW Protocol borrower adapter (AaveBorrower)
 *   "receiver": "0x...",           // SAME as protocolAdapter - flash loan lands here first
 *   "token": "0x...",              // Token to borrow
 *   "amount": "1000000"            // Amount in wei/atoms as string
 * }
 */
export interface FlashLoanMetadata {
  /** Flash loan liquidity provider address (e.g., Aave Pool) */
  liquidityProvider: string;
  /** CoW Protocol borrower adapter (AaveBorrower for Aave) */
  protocolAdapter: string;
  /** 
   * Who receives the borrowed tokens - MUST be same as protocolAdapter!
   * The borrower contract receives flash loan, then pre-hook routes tokens.
   */
  receiver: string;
  /** Token to borrow */
  token: string;
  /** Amount to borrow (in wei/atoms as string) */
  amount: string;
}

/**
 * Operation types for Kapan orders - encoded in appCode for on-chain derivation
 */
export type KapanOperationType =
  | "leverage-up"
  | "close-position"
  | "debt-swap"
  | "collateral-swap";

/**
 * Lending protocol identifiers for appCode
 */
export type KapanProtocol =
  | "aave"
  | "compound"
  | "venus"
  | "morpho";

/**
 * Build the appCode string with operation type and optional protocol
 * Format: "kapan:operation-type/protocol" or "kapan:operation-type" or just "kapan"
 * Examples: "kapan:collateral-swap/morpho", "kapan:debt-swap/aave", "kapan:leverage-up"
 */
export function buildAppCode(operationType?: KapanOperationType, protocol?: KapanProtocol): string {
  if (!operationType) return "kapan";
  if (!protocol) return `kapan:${operationType}`;
  return `kapan:${operationType}/${protocol}`;
}

/**
 * Normalize protocol name to KapanProtocol
 */
export function normalizeProtocolForAppCode(protocolName: string): KapanProtocol | undefined {
  const lower = protocolName.toLowerCase();
  if (lower.includes("morpho")) return "morpho";
  if (lower.includes("aave")) return "aave";
  if (lower.includes("compound")) return "compound";
  if (lower.includes("venus")) return "venus";
  return undefined;
}

/**
 * Parse operation type and protocol from appCode
 * Returns undefined if not a kapan appCode or no operation type encoded
 */
export function parseOperationTypeFromAppCode(appCode: string): KapanOperationType | undefined {
  if (!appCode.startsWith("kapan:")) return undefined;
  // Handle format "kapan:operation-type/protocol" or "kapan:operation-type"
  const rest = appCode.slice(6);
  const type = rest.split("/")[0] as KapanOperationType;
  const validTypes: KapanOperationType[] = ["leverage-up", "close-position", "debt-swap", "collateral-swap"];
  return validTypes.includes(type) ? type : undefined;
}

/**
 * Parse protocol from appCode
 * Returns undefined if not present
 */
export function parseProtocolFromAppCode(appCode: string): KapanProtocol | undefined {
  if (!appCode.startsWith("kapan:")) return undefined;
  const rest = appCode.slice(6);
  const parts = rest.split("/");
  if (parts.length < 2) return undefined;
  const protocol = parts[1] as KapanProtocol;
  const validProtocols: KapanProtocol[] = ["aave", "compound", "venus", "morpho"];
  return validProtocols.includes(protocol) ? protocol : undefined;
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

// ABI for CoW Protocol Borrower contracts (ERC3156Borrower, AaveBorrower)
// Used to approve tokens for transfer from borrower to OrderManager
const BORROWER_ABI = [
  "function approve(address token, address target, uint256 amount) external",
];

// ABI for ERC20 token transfer
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
];

// ABI for KapanCowAdapter
const KAPAN_ADAPTER_ABI = [
  "function fundOrder(address token, address recipient, uint256 amount) external",
];

const borrowerIface = new Interface(BORROWER_ABI);
const erc20Iface = new Interface(ERC20_ABI);
const kapanAdapterIface = new Interface(KAPAN_ADAPTER_ABI);

/**
 * Get the appropriate CoW Protocol borrower address based on lender type
 *
 * SUPPORTED LENDERS:
 * - Aave V3: Use AaveBorrower (RECOMMENDED for CoW limit orders)
 * - ERC-3156 compliant lenders (Maker): Use ERC3156Borrower
 *
 * NOT SUPPORTED:
 * - Balancer V2: Does NOT implement ERC-3156, will fail silently!
 *
 * For limit orders, use getCowFlashLoanLender() which only returns Aave V3 addresses.
 *
 * @see https://github.com/cowprotocol/flash-loan-router
 */
export function getCowBorrower(lenderAddress: string, chainId?: number): string {
  // Check if the lender is an Aave V3 Pool
  const aavePools = ALL_AAVE_V3_POOLS.map(a => a.toLowerCase());

  if (aavePools.includes(lenderAddress.toLowerCase())) {
    // Check for chain-specific borrower (e.g., Base uses a factory-deployed adapter)
    if (chainId && COW_AAVE_BORROWERS[chainId]) {
      return COW_AAVE_BORROWERS[chainId];
    }
    return COW_FLASH_LOAN_ROUTER.aaveBorrower;
  }

  // Warn if using Balancer - it won't work with CoW FlashLoanRouter!
  if (lenderAddress.toLowerCase() === BALANCER.v2Vault.toLowerCase()) {
    console.error("[getCowBorrower] ERROR: Balancer V2 is NOT supported by CoW FlashLoanRouter!");
    console.error("[getCowBorrower] Balancer V2 does not implement ERC-3156. Order will fail!");
    console.error("[getCowBorrower] Use getCowFlashLoanLender() to get a supported lender (Aave V3).");
  }

  // Default to ERC3156Borrower for Maker and other ERC-3156 compliant lenders
  // NOTE: This will NOT work for Balancer V2!
  return COW_FLASH_LOAN_ROUTER.erc3156Borrower;
}

/**
 * Encode a call to Borrower.approve() to allow OrderManager to pull flash loan tokens
 * This must be called as a pre-hook before the order executes
 */
export function encodeBorrowerApprove(
  borrowerAddress: string,
  token: string,
  spender: string,
  amount: bigint
): string {
  return borrowerIface.encodeFunctionData("approve", [token, spender, amount]);
}

/**
 * Encode a token transfer call (for moving tokens from borrower to OrderManager)
 */
export function encodeTokenTransfer(
  recipient: string,
  amount: bigint
): string {
  return erc20Iface.encodeFunctionData("transfer", [recipient, amount]);
}

/**
 * Encode a token transferFrom call
 */
export function encodeTokenTransferFrom(
  from: string,
  to: string,
  amount: bigint
): string {
  return erc20Iface.encodeFunctionData("transferFrom", [from, to, amount]);
}

/**
 * Encode a call to KapanCowAdapter.fundOrder()
 * This is used in pre-hook to transfer flash-loaned tokens to OrderManager
 */
export function encodeAdapterFundOrder(
  token: string,
  recipient: string,
  amount: bigint
): string {
  return kapanAdapterIface.encodeFunctionData("fundOrder", [token, recipient, amount]);
}

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
  chainId: number,
  options?: {
    /** Gas limit for pre-hook (default: 300000 for borrower, 800000 for post) */
    preHookGasLimit?: string;
    /** Gas limit for post-hook (default: 800000) */
    postHookGasLimit?: string;
    /** Partner fee in basis points */
    partnerFeeBps?: number;
    /** Partner fee recipient */
    partnerFeeRecipient?: string;
    /** Slippage tolerance in basis points */
    slippageBps?: number;
    /** Operation type for order categorization */
    operationType?: KapanOperationType;
    /** Lending protocol (e.g., "aave", "morpho") for appCode tagging */
    protocol?: KapanProtocol;
    /** Flash loan configuration for single-tx leverage */
    flashLoan?: {
      /** Flash loan liquidity provider (Aave pool) */
      lender: string;
      /** Token to borrow */
      token: string;
      /** Amount to borrow */
      amount: bigint;
    };
  }
): AppDataDocument {
  // Gas limits - generous limits for complex operations
  // Pre-hook: 800k for patterns like close-with-collateral (PullToken + Repay + Withdraw)
  // Post-hook: 1.75M for complex protocols like Venus
  const preHookGasLimit = options?.preHookGasLimit ?? "800000";
  const postHookGasLimit = options?.postHookGasLimit ?? "1750000";

  // Encode the hook calls to OrderManager using (user, salt) lookup
  // Note: chunkIndex is NOT passed - contract reads from iterationCount
  const preHookCalldata = encodePreHookCall(orderManagerAddress, user, salt);
  const postHookCalldata = encodePostHookCall(orderManagerAddress, user, salt);

  // For flash loan orders with KapanCowAdapter:
  // - Pre-hook 1: KapanCowAdapter.fundOrder() - transfers tokens to OrderManager
  // - Pre-hook 2: OrderManager.executePreHookBySalt() - any pre-logic
  // - Post-hook: OrderManager.executePostHookBySalt() - deposits/borrows for repayment
  //
  // For non-flash-loan orders:
  // - Both hooks target OrderManager
  let preHooks: CowHook[];
  let postHooks: CowHook[];
  
  if (options?.flashLoan) {
    const kapanAdapter = getKapanCowAdapter(chainId);
    
    if (kapanAdapter) {
      // Use KapanCowAdapter - our custom borrower that works with HooksTrampoline
      const fundOrderCalldata = encodeAdapterFundOrder(
        options.flashLoan.token,
        orderManagerAddress,
        options.flashLoan.amount
      );
      
      preHooks = [
        // First: Transfer flash-loaned tokens from Adapter to OrderManager
        {
          target: kapanAdapter,
          callData: fundOrderCalldata,
          gasLimit: "100000",
          dappId: "kapan://flashloans/adapter/fund",
        },
        // Second: Execute any pre-hook logic on OrderManager
        {
          target: orderManagerAddress,
          callData: preHookCalldata,
          gasLimit: preHookGasLimit,
          dappId: "kapan://flashloans/pre-hook",
        },
      ];
      
      // Post-hook targets OrderManager (handles deposit collateral, borrow for repay)
      postHooks = [{
        target: orderManagerAddress,
        callData: postHookCalldata,
        gasLimit: postHookGasLimit,
        dappId: "kapan://flashloans/post-hook",
      }];
    } else {
      // Fallback: Use CoW's standard AaveBorrower
      // Note: This requires the solver to understand token routing
      const protocolAdapter = getCowBorrower(options.flashLoan.lender, chainId);
      
      console.warn(
        `[buildKapanAppData] KapanCowAdapter not deployed on chain ${chainId}. ` +
        `Using standard borrower ${protocolAdapter}. Flash loan may not work correctly.`
      );
      
      preHooks = [{
        target: protocolAdapter,
        callData: preHookCalldata,
        gasLimit: preHookGasLimit,
        dappId: "kapan://flashloans/aave/v3/leverage",
      }];
      
      postHooks = [{
        target: orderManagerAddress,
        callData: postHookCalldata,
        gasLimit: postHookGasLimit,
        dappId: "kapan://flashloans/aave/v3/leverage",
      }];
    }
  } else {
    // Non-flash-loan: both hooks target OrderManager
    preHooks = [{
      target: orderManagerAddress,
      callData: preHookCalldata,
      gasLimit: preHookGasLimit,
    }];
    
    postHooks = [{
      target: orderManagerAddress,
      callData: postHookCalldata,
      gasLimit: postHookGasLimit,
    }];
  }

  // Use version 1.10.0 to match working Aave implementation
  const appData: AppDataDocument = {
    version: "1.10.0",
    appCode: buildAppCode(options?.operationType, options?.protocol),
    metadata: {
      hooks: {
        pre: preHooks,
        post: postHooks,
      },
    },
  };

  // Flash loan metadata for CoW Protocol
  // @see https://github.com/cowprotocol/flash-loan-router
  //
  // With KapanCowAdapter:
  // 1. FlashLoanRouter.flashLoanAndSettle() is called
  // 2. Flash loan goes to KapanCowAdapter (our borrower)
  // 3. Pre-hook: Adapter.fundOrder() moves tokens to OrderManager
  // 4. Settlement executes trade with OrderManager as owner
  // 5. Post-hook: OrderManager deposits/borrows, sends repayment to Adapter
  // 6. Adapter repays flash loan to Aave
  if (options?.flashLoan) {
    const kapanAdapter = getKapanCowAdapter(chainId);
    // Use KapanCowAdapter if deployed, otherwise fall back to standard borrower
    const protocolAdapter = kapanAdapter || getCowBorrower(options.flashLoan.lender, chainId);
    const flashLoanAmount = options.flashLoan.amount;
    const flashLoanToken = options.flashLoan.token;
    
    console.log("[buildKapanAppData] Flash loan metadata:", {
      liquidityProvider: options.flashLoan.lender,
      protocolAdapter: protocolAdapter,
      receiver: protocolAdapter, // ProtocolAdapter or OrderManager .. both seem to work
      token: flashLoanToken,
      amount: flashLoanAmount.toString(),
      usingKapanAdapter: !!kapanAdapter,
    });
    
    // Flash loan metadata for CoW API:
    // - protocolAdapter: The borrower contract that handles flash loan mechanics (KapanCowAdapter)
    // - receiver: OrderManager (balance override here, fundOrder pre-hook transfers tokens)
    // At settlement time, actual tokens flow: Lender → Adapter → (fundOrder) → OrderManager
    appData.metadata.flashloan = {
      liquidityProvider: options.flashLoan.lender,
      protocolAdapter: protocolAdapter,
      receiver: protocolAdapter, // ProtocolAdapter or OrderManager .. both seem to work
      token: flashLoanToken,
      amount: flashLoanAmount.toString(),
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
 * 
 * Uses deterministic JSON stringification for consistent hashing.
 */
export function computeAppDataHash(appDataDoc: AppDataDocument): string {
  const json = stringify(appDataDoc);
  return keccak256(toUtf8Bytes(json));
}

/**
 * Register AppData with the CoW Protocol API
 * This is required so solvers can fetch the full AppData document during settlement
 * 
 * Uses the simpler `/api/v1/app_data` endpoint that computes the hash server-side.
 * This avoids hash mismatch issues from different JSON serialization methods.
 * 
 * @param chainId - Chain ID
 * @param appDataHash - The expected keccak256 hash (for verification, not used in request)
 * @param appDataDoc - The full AppData document
 * @returns The API response with the computed hash
 */
export async function registerAppData(
  chainId: number,
  appDataHash: string,
  appDataDoc: AppDataDocument
): Promise<{ success: boolean; error?: string; computedHash?: string }> {
  const apiUrl = getCowApiUrl(chainId);
  if (!apiUrl) {
    return { success: false, error: `Chain ${chainId} not supported by CoW Protocol` };
  }

  console.log("[registerAppData] Chain ID:", chainId);

  // Use deterministic stringify for consistent serialization
  const fullAppDataJson = stringify(appDataDoc);
  console.log("[registerAppData] Registering appData:");
  console.log("[registerAppData] Full JSON:", fullAppDataJson);
  if (appDataDoc.metadata.flashloan) {
    console.log("[registerAppData] Flash loan config:", JSON.stringify(appDataDoc.metadata.flashloan, null, 2));
  }
  if (appDataDoc.metadata.hooks) {
    console.log("[registerAppData] Pre-hooks:", appDataDoc.metadata.hooks.pre?.length || 0);
    console.log("[registerAppData] Post-hooks:", appDataDoc.metadata.hooks.post?.length || 0);
  }

  // Build request body - fullAppData should be a JSON string
  const requestBody = JSON.stringify({
    fullAppData: fullAppDataJson,
  });
  console.log("[registerAppData] Request body:", requestBody);

  // Use our Next.js API proxy to bypass browser-level interference
  // (ad blockers, VPNs, corporate proxies can block direct CoW API calls)
  const proxyUrl = `/api/cow/${chainId}/app-data`;
  console.log("[registerAppData] Using proxy:", proxyUrl);

  try {
    return await withRetry(
      async () => {
        const response = await fetch(proxyUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBody,
        });

        // Handle rate limiting explicitly - throw to trigger retry
        if (response.status === 429) {
          throw new Error("CoW API rate limit exceeded");
        }

        if (response.ok || response.status === 200 || response.status === 201) {
          // The API returns the computed appDataHash
          const result = await response.json();
          const computedHash = result.appDataHash || result;
          console.log("[registerAppData] Success! Computed hash:", computedHash);
          return { success: true, computedHash: typeof computedHash === 'string' ? computedHash : undefined };
        }

        // 409 Conflict means it already exists - that's fine
        if (response.status === 409) {
          return { success: true };
        }

        const errorText = await response.text();
        console.error("[registerAppData] API error response:", errorText);
        console.error("[registerAppData] Request body was:", fullAppDataJson);
        console.error("[registerAppData] Full appData document:", JSON.stringify(appDataDoc, null, 2));

        // Try to parse error for more details
        let parsedError = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.description) {
            parsedError = errorJson.description;
          } else if (errorJson.errorType) {
            parsedError = `${errorJson.errorType}: ${errorJson.description || errorText}`;
          }
        } catch {
          // Keep original errorText
        }

        // Don't retry client errors (4xx except 429)
        if (response.status >= 400 && response.status < 500) {
          return { success: false, error: `API error ${response.status}: ${parsedError}` };
        }

        // Throw server errors to trigger retry
        throw new Error(`API error ${response.status}: ${parsedError}`);
      },
      {
        retries: 2,
        baseDelay: 1000,
        isRetryable: (error) => {
          // Retry on network errors and rate limits
          if (isNetworkError(error) || isRateLimitError(error)) return true;
          // Retry on server errors (wrapped in Error objects from our throw above)
          if (error instanceof Error && error.message.startsWith("API error 5")) return true;
          return false;
        },
        onRetry: (attempt, error, delay) => {
          console.warn(`[registerAppData] Retry ${attempt}, waiting ${delay}ms`, error);
        },
      }
    );
  } catch (error) {
    console.error("[registerAppData] All retries failed:", error);
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
  options?: Parameters<typeof buildKapanAppData>[4]
): Promise<{
  appDataDoc: AppDataDocument;
  appDataHash: string;
  registered: boolean;
  error?: string;
}> {
  const appDataDoc = buildKapanAppData(orderManagerAddress, user, salt, chainId, options);
  
  // Register with CoW API - it will compute the correct hash
  const result = await registerAppData(chainId, "", appDataDoc);
  
  // Use the hash computed by the API if available, otherwise fall back to local computation
  const appDataHash = result.computedHash || computeAppDataHash(appDataDoc);
  
  if (result.computedHash) {
    console.log("[buildAndRegisterAppData] Using API-computed hash:", result.computedHash);
  } else {
    console.log("[buildAndRegisterAppData] Using locally-computed hash:", appDataHash);
  }
  
  return {
    appDataDoc,
    appDataHash,
    registered: result.success,
    error: result.error,
  };
}

/**
 * Build flash loan options with the preferred lender for a chain
 * Automatically selects Morpho (0% fee) when available, falls back to Aave (0.05% fee)
 * 
 * @param chainId - Chain ID
 * @param token - Token to flash loan
 * @param amount - Amount to flash loan
 * @returns Flash loan options or undefined if no lender available
 */
export function buildFlashLoanOptions(
  chainId: number,
  token: string,
  amount: bigint
): { lender: string; token: string; amount: bigint } | undefined {
  const lenderInfo = getPreferredFlashLoanLender(chainId);
  if (!lenderInfo) {
    console.warn(`[buildFlashLoanOptions] No flash loan lender available for chain ${chainId}`);
    return undefined;
  }
  
  console.log(`[buildFlashLoanOptions] Using ${lenderInfo.provider} (${lenderInfo.feeBps / 100}% fee) on chain ${chainId}`);
  
  return {
    lender: lenderInfo.address,
    token,
    amount,
  };
}

/**
 * Fetch appData document from CoW API by hash
 * Uses the local API proxy to avoid CORS issues
 *
 * @param chainId - Chain ID
 * @param appDataHash - The appData hash to look up
 * @returns The appData document or null if not found
 */
export async function fetchAppData(
  chainId: number,
  appDataHash: string
): Promise<AppDataDocument | null> {
  try {
    const response = await fetch(`/api/cow/${chainId}/app-data?hash=${appDataHash}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.warn(`[fetchAppData] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // CoW API returns { fullAppData: { appCode, metadata, ... } } structure
    if (data.fullAppData) {
      return data.fullAppData as AppDataDocument;
    }

    // Or it might return the document directly
    if (data.appCode && data.metadata) {
      return data as AppDataDocument;
    }

    return null;
  } catch (error) {
    console.warn("[fetchAppData] Fetch failed:", error);
    return null;
  }
}

/**
 * Fetch and parse operation type from appData
 *
 * @param chainId - Chain ID
 * @param appDataHash - The appData hash to look up
 * @returns The operation type or undefined if not found/parseable
 */
export async function fetchOperationTypeFromAppData(
  chainId: number,
  appDataHash: string
): Promise<KapanOperationType | undefined> {
  const appData = await fetchAppData(chainId, appDataHash);
  if (!appData) return undefined;

  return parseOperationTypeFromAppCode(appData.appCode);
}
