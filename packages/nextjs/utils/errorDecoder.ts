// Error decoding utilities for DeFi transactions

// Known DeFi error selectors and their human-readable messages
const KNOWN_ERRORS: Record<string, string> = {
  // Aave V3 errors
  "0x77a6a896": "Borrow cap exceeded - this asset has reached its maximum borrow limit on Aave",
  "0xf58f733a": "Supply cap exceeded - this asset has reached its maximum supply limit on Aave",
  "0x53587745": "Borrowing not enabled - this asset cannot be borrowed on Aave",
  "0x6d305815": "Reserve frozen - this asset is temporarily frozen on Aave",
  "0xd37f5f1c": "Reserve paused - this asset is temporarily paused on Aave",
  "0x30d1eeb9": "Asset not borrowable in isolation mode",
  "0xc27f9abe": "Siloed borrowing violation - cannot borrow multiple siloed assets",
  "0xe24734c2": "Debt ceiling exceeded",
  "0x366eb54d": "Health factor too low - would put position at liquidation risk",
  "0xe3fa20f5": "Insufficient collateral to cover new borrow",
  "0xb7f5e224": "Not enough available balance",
  "0x6679996d": "Collateral cannot be used for borrowing - this asset has LTV=0 on Aave (e.g., PT tokens)",

  // 1inch / Swap errors
  "0x9a446475": "Swap slippage too high - try increasing slippage tolerance",
  "0x11157667": "Insufficient output amount from swap",

  // ERC20 errors
  "0xfb8f41b2": "Insufficient token allowance",
  "0xe450d38c": "Insufficient token balance",

  // Flash loan errors
  "0xfb37391e": "Invalid flash loan executor return",
  "0x342b12c9": "Flash loan premium exceeds maximum",

  // General
  "0x08c379a0": "Transaction reverted", // Error(string) - will be decoded separately

  // Venus / Compound errors
  "0xbb55fd27": "Insufficient liquidity - you need to enter the market first or add more collateral",
  "0x4ef4c3e1": "Mint not allowed - market may be paused or you haven't entered it",
  "0x69609fc6": "Market not listed - this asset is not available on Venus",
  "0x7a7fcb5a": "Enter markets failed - could not enable asset as collateral",

  // Unknown errors we've seen (will be improved with more logging)
  "0x00b284f2": "Withdrawal failed - check Aave pool status and your collateral balance",
  "0xf0dbeea5": "Transaction failed - check protocol status and try again",

  // ========================================================================
  // Kapan Router Errors
  // ========================================================================
  "0xef3ff4ae": "BadIndex - invalid UTXO reference in instruction sequence",
  "0x5104a0b8": "GatewayAlreadyExists - gateway already registered for this protocol",
  "0xbb2b1516": "GatewayNotFound - no gateway registered for this protocol",
  "0xea8e4eb5": "NotAuthorized - caller not authorized for this action",
  "0xad1991f5": "ZeroToken - token address cannot be zero",
  "0x1f2a2005": "ZeroAmount - amount cannot be zero",
  "0xf2365b5b": "NoValue - operation requires a value",
  "0x12227519": "FractionTooLarge - split fraction exceeds maximum",
  "0x936bb5ad": "TokenMismatch - token address does not match expected",
  "0xcaccb6d9": "Underflow - arithmetic underflow in calculation",
  "0x5049b049": "FlashLoanRequiresTransientStack - flash loan needs transient storage",
  "0x882f8103": "UnsupportedFlashLoanProvider - flash loan provider not supported",
  "0x3e6ad70a": "UniswapV3RequiresPoolAddress - Uniswap V3 flash loan requires pool address",
  "0xabd2d467": "AavePoolNotRegistered - Aave pool address not configured",
  "0xd6fd6fc3": "ZeroLendPoolNotRegistered - ZeroLend pool address not configured",

  // ========================================================================
  // Morpho Gateway Errors
  // ========================================================================
  "0xa8148603": "MarketNotRegistered - Morpho market not registered in gateway",
  "0x494e7807": "InvalidMarketParams - invalid Morpho market parameters",

  // ========================================================================
  // Euler V2 / EVC Errors
  // ========================================================================
  // EVC errors
  "0xf1be4519": "EVC_ControllerViolation - account already has a different controller enabled (Euler allows only 1 per sub-account)",
  "0x6a03e7fb": "E_ControllerViolation - account would have too many controllers (Euler allows only 1)",
  "0x8ca0c0c2": "E_InvalidAddress - invalid address provided",
  "0xf3d7f4eb": "E_NotAuthorized - caller not authorized (operator not set)",
  "0xf61c8d97": "E_ControllerDisabled - controller vault not enabled for this account",
  "0x7fe32d04": "E_CollateralDisabled - collateral vault not enabled for this account",
  "0x9f8c5c8e": "E_CheckDeferredLiquidity - account liquidity check failed (health factor too low)",
  // EVault errors (borrow vaults)
  "0x6c2e2d8f": "E_AccountLiquidity - insufficient collateral value to support borrow",
  "0x2b7f0b02": "E_BadCollateral - collateral not accepted by this vault or has LTV=0",
  "0xee33fd59": "E_BorrowCapExceeded - vault borrow cap has been reached",
  "0x10074ad5": "E_SupplyCapExceeded - vault supply cap has been reached",
  "0x4a0f0518": "E_InsufficientCash - vault doesn't have enough liquidity to borrow",
  "0xb1e1fc57": "E_InsufficientBalance - insufficient share balance for withdrawal",
  "0x7e0de5bb": "E_OperatorNotAuthorized - operator not authorized for this sub-account",
  "0x1c0a3527": "E_InvalidReceiver - invalid receiver address for transfer",
  "0x18e33c1a": "E_RepayTooMuch - repay amount exceeds outstanding debt",
  "0xbd68e48e": "E_SelfTransfer - cannot transfer to self",
  "0x5d4a42af": "E_VaultStatusCheckDeferred - vault status check is deferred",
  // Oracle errors
  "0x95aa9d3d": "E_PriceFeedNotSet - no price feed configured for this asset",
  "0x47fbbf93": "E_PriceFeedStale - price feed data is stale or outdated",
  "0x2098c0d3": "E_BadPrice - oracle returned invalid or zero price",

  // ========================================================================
  // Flash Loan Errors
  // ========================================================================
  "0x0a3fad83": "FlashLoanNotEnabled - flash loans not enabled on this deployment",
  "0xc884f6ae": "UnauthorizedFlashCaller - flash loan callback from unauthorized caller",
  "0x88aac56f": "NestedFlashNotAllowed - cannot nest flash loans",
  "0xfb211cb6": "ProviderNotConfigured - flash loan provider not configured",
  "0x331eb0f0": "InvalidFlashParams - invalid flash loan parameters",
  "0x06ef72f2": "BadInitiator - flash loan initiator mismatch",
  "0x2083cd40": "InvalidPool - flash loan pool address invalid",
  "0x07326195": "TokenNotInPool - token not available in flash loan pool",

  // ========================================================================
  // CoW Protocol / Order Manager Errors
  // ========================================================================
  "0x9e41bdd7": "OnlyRouter - only router can call this function",
  "0x15b31976": "OnlySettlement - only CoW settlement contract can call",
  "0x1a4a635d": "OnlyDuringSettlement - can only be called during CoW settlement",
  "0x21eeab00": "InvalidLender - flash loan lender address invalid",
  "0xdb360fce": "FlashLoanInProgress - flash loan already in progress",
  "0x5c427cd9": "UnauthorizedCaller - caller not authorized",
  "0x50652932": "InvalidOrderManager - order manager address invalid",
  "0x1d4ecc5b": "OrderNotActive - order is not in active state",
  "0xd36d8965": "OrderNotFound - order does not exist",
  "0x966753c5": "OrderAlreadyExists - order with this ID already exists",
  "0xd8f59fa5": "InvalidHandler - order handler address invalid",
  "0x72ce59fc": "NotHooksTrampoline - caller is not the hooks trampoline",
  "0x1c65ea76": "HookExecutionFailed - CoW hook execution failed",
  "0x82b42900": "Unauthorized - caller not authorized",
  "0xac494dfc": "InvalidOrderState - order is in an invalid state for this action",
  "0xd92e233d": "ZeroAddress - address cannot be zero",
  "0xe617d131": "PreHookAlreadyExecuted - pre-hook has already been executed",
  "0x7fae2de4": "PreHookNotExecuted - pre-hook must be executed first",
  "0x13e916e5": "CannotCancelMidExecution - cannot cancel order during execution",
};

/**
 * Convert data to a hex string
 */
function convertToHexString(data: string | Uint8Array | unknown): string | null {
  if (!data) return null;

  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
    return "0x" + Array.from(data as Uint8Array).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  if (typeof data === "object" && data !== null && "toString" in data) {
    return String(data);
  }

  return null;
}

/**
 * Decode Error(string) revert data
 */
function decodeErrorString(dataStr: string): string {
  try {
    // Skip the offset (32 bytes) and length (32 bytes), then decode the string
    const stringStart = 64 + 64; // offset + length position
    const lengthHex = dataStr.slice(10 + 64, 10 + 64 + 64);
    const length = parseInt(lengthHex, 16);
    const stringHex = dataStr.slice(10 + stringStart, 10 + stringStart + length * 2);
    const decoded = Buffer.from(stringHex, "hex").toString("utf8");
    return decoded || "Transaction reverted";
  } catch {
    return "Transaction reverted with an error";
  }
}

/**
 * Panic code messages
 */
const PANIC_MESSAGES: Record<number, string> = {
  0x00: "Generic panic",
  0x01: "Assertion failed",
  0x11: "Arithmetic overflow/underflow",
  0x12: "Division by zero",
  0x21: "Invalid enum value",
  0x22: "Storage encoding error",
  0x31: "Empty array pop",
  0x32: "Array out of bounds",
  0x41: "Memory allocation error",
  0x51: "Zero function pointer call",
};

/**
 * Decode Panic(uint256) revert data
 */
function decodePanicError(dataStr: string): string {
  try {
    const panicCode = parseInt(dataStr.slice(10), 16);
    return PANIC_MESSAGES[panicCode] || `Panic code: ${panicCode}`;
  } catch {
    return "Transaction panicked";
  }
}

// Decode error from revert data
export function decodeRevertReason(data: string | Uint8Array | unknown): string {
  const dataStr = convertToHexString(data);

  if (!dataStr) {
    return "Transaction reverted without a reason";
  }

  if (dataStr === "0x" || dataStr.length < 10) {
    return "Transaction reverted without a reason";
  }

  const selector = dataStr.slice(0, 10).toLowerCase();

  // Check known errors first
  if (KNOWN_ERRORS[selector]) {
    return KNOWN_ERRORS[selector];
  }

  // Try to decode Error(string)
  if (selector === "0x08c379a0") {
    return decodeErrorString(dataStr);
  }

  // Try to decode Panic(uint256)
  if (selector === "0x4e487b71") {
    return decodePanicError(dataStr);
  }

  return `Unknown error (${selector})`;
}

/**
 * Helper to extract hex string from various data formats
 */
function extractHexData(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string" && data.startsWith("0x")) return data;

  if (typeof data === "object" && data !== null) {
    // Check if it's an object with a data property
    if ("data" in data && typeof (data as Record<string, unknown>).data === "string") {
      return (data as Record<string, unknown>).data as string;
    }
    // Try to stringify and extract hex
    try {
      const str = String(data);
      const match = str.match(/(0x[a-fA-F0-9]{8,})/);
      return match ? match[1] : "";
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Extract revert data from error object
 */
function extractRevertDataFromError(error: any): string {
  // Check various places where revert data might be stored
  let revertData = extractHexData(error?.cause?.data) || extractHexData(error?.data) || "";

  // Try viem's walk method if available
  if (!revertData && error?.walk) {
    try {
      const walkError = error.walk((e: any) => e?.data);
      revertData = extractHexData(walkError?.data);
    } catch {
      // walk failed, continue
    }
  }

  return revertData;
}

/**
 * Extract revert data from error message patterns
 */
function extractRevertDataFromMessage(message: string): string {
  // Look for "return data: 0x..." pattern (common in Hardhat)
  const returnDataMatch = message.match(/return data: (0x[a-fA-F0-9]+)/i);
  if (returnDataMatch) {
    return returnDataMatch[1];
  }

  // Look for "data: 0x..." pattern
  const dataMatch = message.match(/data:\s*(0x[a-fA-F0-9]+)/i);
  if (dataMatch) {
    return dataMatch[1];
  }

  // Last resort: look for any 8+ character hex string (likely a selector + data)
  const hexMatch = message.match(/(0x[a-fA-F0-9]{8,})/);
  if (hexMatch) {
    return hexMatch[1];
  }

  return "";
}

// Simulate a transaction and return decoded error if it fails
export async function simulateTransaction(
  publicClient: any,
  to: `0x${string}`,
  data: `0x${string}`,
  from: `0x${string}`
): Promise<{ success: boolean; error?: string; rawError?: string }> {
  try {
    await publicClient.call({
      to,
      data,
      account: from,
    });
    return { success: true };
  } catch (error: any) {
    // Extract revert data from error object first
    let revertData = extractRevertDataFromError(error);

    // If still no revert data, try to extract from error message
    if (!revertData && error?.message) {
      revertData = extractRevertDataFromMessage(error.message);
    }

    const decodedError = revertData
      ? decodeRevertReason(revertData)
      : error?.shortMessage || error?.message || "Transaction simulation failed";

    return {
      success: false,
      error: decodedError,
      rawError: revertData || undefined,
    };
  }
}

/**
 * Error display format result
 */
interface ErrorDisplayFormat {
  title: string;
  description: string;
  suggestion?: string;
}

/**
 * Format borrow/supply cap errors
 */
function formatCapError(error: string): ErrorDisplayFormat | null {
  if (error.includes("Borrow cap exceeded")) {
    return {
      title: "Borrow Cap Reached",
      description: "This asset has reached its maximum borrow limit on Aave.",
      suggestion: "Try borrowing a different asset or a smaller amount.",
    };
  }

  if (error.includes("Supply cap exceeded")) {
    return {
      title: "Supply Cap Reached",
      description: "This asset has reached its maximum supply limit on Aave.",
      suggestion: "Try supplying a different asset or a smaller amount.",
    };
  }

  return null;
}

/**
 * Format slippage and swap errors
 */
function formatSlippageError(error: string): ErrorDisplayFormat | null {
  if (error.includes("slippage")) {
    return {
      title: "Slippage Too High",
      description: "The price moved too much during the transaction.",
      suggestion: "Try increasing your slippage tolerance or reducing the amount.",
    };
  }
  return null;
}

/**
 * Format health factor and collateral errors
 */
function formatHealthFactorError(error: string): ErrorDisplayFormat | null {
  if (error.includes("Health factor") || error.includes("liquidation")) {
    return {
      title: "Position At Risk",
      description: "This transaction would put your position at liquidation risk.",
      suggestion: "Try a smaller amount or add more collateral first.",
    };
  }

  if (error.includes("collateral")) {
    return {
      title: "Insufficient Collateral",
      description: "You don't have enough collateral to support this borrow.",
      suggestion: "Add more collateral or borrow a smaller amount.",
    };
  }

  return null;
}

/**
 * Format Venus/Compound market errors
 */
function formatMarketError(error: string): ErrorDisplayFormat | null {
  if (error.includes("Insufficient liquidity") || error.includes("enter the market")) {
    return {
      title: "Market Entry Required",
      description: "Your collateral needs to be enabled before you can borrow against it.",
      suggestion: "The transaction should include an 'Enter Markets' step. Try again or contact support.",
    };
  }
  return null;
}

/**
 * Format asset availability errors
 */
function formatAvailabilityError(error: string): ErrorDisplayFormat | null {
  if (error.includes("frozen") || error.includes("paused")) {
    return {
      title: "Asset Unavailable",
      description: "This asset is temporarily unavailable on the protocol.",
      suggestion: "Try again later or use a different asset.",
    };
  }
  return null;
}

// Format error for user display
export function formatErrorForDisplay(error: string): ErrorDisplayFormat {
  // Try each formatter in order
  const formatters = [
    formatCapError,
    formatSlippageError,
    formatHealthFactorError,
    formatMarketError,
    formatAvailabilityError,
  ];

  for (const formatter of formatters) {
    const result = formatter(error);
    if (result) return result;
  }

  // Default
  return {
    title: "Transaction Failed",
    description: error,
  };
}
