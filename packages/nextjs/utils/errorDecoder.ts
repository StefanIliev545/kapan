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
  
  // Unknown errors we've seen (will be improved with more logging)
  "0x00b284f2": "Withdrawal failed - check Aave pool status and your collateral balance",
  "0xf0dbeea5": "Transaction failed - check protocol status and try again",
};

// Decode error from revert data
export function decodeRevertReason(data: string | Uint8Array | unknown): string {
  // Convert to string if needed
  let dataStr: string;
  if (!data) {
    return "Transaction reverted without a reason";
  }
  if (typeof data === "string") {
    dataStr = data;
  } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
    dataStr = "0x" + Array.from(data as Uint8Array).map(b => b.toString(16).padStart(2, "0")).join("");
  } else if (typeof data === "object" && data !== null && "toString" in data) {
    dataStr = String(data);
  } else {
    return "Transaction reverted with unknown data type";
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

  // Try to decode Panic(uint256)
  if (selector === "0x4e487b71") {
    try {
      const panicCode = parseInt(dataStr.slice(10), 16);
      const panicMessages: Record<number, string> = {
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
      return panicMessages[panicCode] || `Panic code: ${panicCode}`;
    } catch {
      return "Transaction panicked";
    }
  }

  return `Unknown error (${selector})`;
}

// Helper to extract hex string from various data formats
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
    // Extract revert data from error
    let revertData = "";
    
    // Check various places where revert data might be stored
    revertData = extractHexData(error?.cause?.data) || 
                 extractHexData(error?.data) ||
                 "";
    
    // Try viem's walk method if available
    if (!revertData && error?.walk) {
      try {
        const walkError = error.walk((e: any) => e?.data);
        revertData = extractHexData(walkError?.data);
      } catch {
        // walk failed, continue
      }
    }
    
    // If still no revert data, try to extract from error message
    if (!revertData && error?.message) {
      // Look for "return data: 0x..." pattern (common in Hardhat)
      const returnDataMatch = error.message.match(/return data: (0x[a-fA-F0-9]+)/i);
      if (returnDataMatch) {
        revertData = returnDataMatch[1];
      } else {
        // Look for "data: 0x..." pattern
        const dataMatch = error.message.match(/data:\s*(0x[a-fA-F0-9]+)/i);
        if (dataMatch) {
          revertData = dataMatch[1];
        } else {
          // Last resort: look for any 8+ character hex string (likely a selector + data)
          const hexMatch = error.message.match(/(0x[a-fA-F0-9]{8,})/);
          if (hexMatch) {
            revertData = hexMatch[1];
          }
        }
      }
    }

    const decodedError = revertData ? decodeRevertReason(revertData) : error?.shortMessage || error?.message || "Transaction simulation failed";
    
    return {
      success: false,
      error: decodedError,
      rawError: revertData || undefined,
    };
  }
}

// Format error for user display
export function formatErrorForDisplay(error: string): { title: string; description: string; suggestion?: string } {
  // Borrow cap
  if (error.includes("Borrow cap exceeded")) {
    return {
      title: "Borrow Cap Reached",
      description: "This asset has reached its maximum borrow limit on Aave.",
      suggestion: "Try borrowing a different asset or a smaller amount.",
    };
  }

  // Slippage
  if (error.includes("slippage")) {
    return {
      title: "Slippage Too High",
      description: "The price moved too much during the transaction.",
      suggestion: "Try increasing your slippage tolerance or reducing the amount.",
    };
  }

  // Health factor
  if (error.includes("Health factor") || error.includes("liquidation")) {
    return {
      title: "Position At Risk",
      description: "This transaction would put your position at liquidation risk.",
      suggestion: "Try a smaller amount or add more collateral first.",
    };
  }

  // Insufficient collateral
  if (error.includes("collateral")) {
    return {
      title: "Insufficient Collateral",
      description: "You don't have enough collateral to support this borrow.",
      suggestion: "Add more collateral or borrow a smaller amount.",
    };
  }

  // Frozen/Paused
  if (error.includes("frozen") || error.includes("paused")) {
    return {
      title: "Asset Unavailable",
      description: "This asset is temporarily unavailable on the protocol.",
      suggestion: "Try again later or use a different asset.",
    };
  }

  // Default
  return {
    title: "Transaction Failed",
    description: error,
  };
}

