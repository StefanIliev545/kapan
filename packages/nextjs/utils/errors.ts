/**
 * Consolidated Error Handling Utilities
 *
 * This module provides a unified API for error handling across the application.
 * It consolidates patterns from:
 * - errorDecoder.ts: DeFi-specific error decoding
 * - scaffold-eth/getParsedError.ts: Viem/wagmi error parsing
 * - scaffold-stark/transactorUtils.tsx: User rejection detection
 *
 * Usage:
 * ```ts
 * import { isUserRejection, getErrorMessage, formatErrorForUser } from "~~/utils/errors";
 *
 * try {
 *   await sendTransaction();
 * } catch (error) {
 *   if (isUserRejection(error)) {
 *     // Handle user rejection quietly
 *     return;
 *   }
 *   const message = getErrorMessage(error);
 *   notification.error(message);
 * }
 * ```
 */

import { BaseError as BaseViemError, ContractFunctionRevertedError } from "viem";
import { decodeRevertReason, formatErrorForDisplay } from "./errorDecoder";

// ============================================================================
// User Rejection Detection
// ============================================================================

/**
 * Error codes that indicate user rejection across different wallet providers
 */
const USER_REJECTION_CODES = new Set([
  4001,              // MetaMask user rejection (EIP-1193)
  "ACTION_REJECTED", // Ethers.js
  "USER_REJECTED",   // Generic
]);

/**
 * Patterns in error messages that indicate user rejection
 */
const USER_REJECTION_PATTERNS = [
  "user rejected",
  "user denied",
  "user cancelled",
  "rejected",
  "denied",
  "cancelled",
  "rejection",
] as const;

/**
 * Checks if an error is a user rejection (wallet prompt was declined).
 * Works with MetaMask, WalletConnect, and other wallet providers.
 *
 * @param error - The error to check
 * @returns true if the error indicates user rejection
 *
 * @example
 * ```ts
 * try {
 *   await walletClient.sendTransaction(tx);
 * } catch (error) {
 *   if (isUserRejection(error)) {
 *     console.log("User declined transaction");
 *     return;
 *   }
 *   throw error;
 * }
 * ```
 */
export function isUserRejection(error: unknown): boolean {
  if (!error) return false;

  const errorObj = error as {
    message?: string;
    shortMessage?: string;
    details?: string;
    code?: number | string;
  };

  // Check error codes first (most reliable)
  if (errorObj.code !== undefined && USER_REJECTION_CODES.has(errorObj.code)) {
    return true;
  }

  // Check error message patterns
  const errorMessage = (
    errorObj.message ||
    errorObj.shortMessage ||
    errorObj.details ||
    ""
  ).toLowerCase();

  return USER_REJECTION_PATTERNS.some(pattern =>
    errorMessage.includes(pattern)
  );
}

// ============================================================================
// Error Message Extraction
// ============================================================================

/**
 * Options for error message extraction
 */
export interface GetErrorMessageOptions {
  /** Message to show for user rejections (default: "User rejected the request") */
  rejectionMessage?: string;
  /** Fallback message for unknown errors (default: "An unknown error occurred") */
  fallbackMessage?: string;
  /** Whether to attempt DeFi-specific error decoding (default: true) */
  decodeDeFiErrors?: boolean;
}

/**
 * Extracts revert data from various error structures
 */
function extractRevertData(error: unknown): string {
  if (!error) return "";

  const errorObj = error as {
    data?: unknown;
    cause?: { data?: unknown };
    message?: string;
    walk?: (fn: (e: unknown) => unknown) => unknown;
  };

  // Helper to extract hex from data
  const extractHex = (data: unknown): string => {
    if (!data) return "";
    if (typeof data === "string" && data.startsWith("0x")) return data;
    if (typeof data === "object" && data !== null && "data" in data) {
      const nested = (data as Record<string, unknown>).data;
      if (typeof nested === "string") return nested;
    }
    const str = String(data);
    const match = str.match(/(0x[a-fA-F0-9]{8,})/);
    return match ? match[1] : "";
  };

  // Try direct data properties
  let revertData = extractHex(errorObj.cause?.data) || extractHex(errorObj.data);

  // Try viem's walk method
  if (!revertData && errorObj.walk) {
    try {
      const walkResult = errorObj.walk((e: unknown) =>
        (e as { data?: unknown })?.data
      );
      revertData = extractHex((walkResult as { data?: unknown })?.data);
    } catch {
      // walk failed, continue
    }
  }

  // Extract from error message
  if (!revertData && errorObj.message) {
    const patterns = [
      /return data: (0x[a-fA-F0-9]+)/i,
      /data:\s*(0x[a-fA-F0-9]+)/i,
      /(0x[a-fA-F0-9]{8,})/,
    ];
    for (const pattern of patterns) {
      const match = errorObj.message.match(pattern);
      if (match) {
        revertData = match[1];
        break;
      }
    }
  }

  return revertData;
}

/**
 * Extracts a user-friendly error message from any error type.
 * Handles viem errors, wallet errors, and DeFi-specific errors.
 *
 * @param error - The error to extract message from
 * @param options - Options for message extraction
 * @returns A user-friendly error message
 *
 * @example
 * ```ts
 * const message = getErrorMessage(error);
 * notification.error(message);
 * ```
 */
export function getErrorMessage(
  error: unknown,
  options: GetErrorMessageOptions = {}
): string {
  const {
    rejectionMessage = "User rejected the request",
    fallbackMessage = "An unknown error occurred",
    decodeDeFiErrors = true,
  } = options;

  // Handle user rejections
  if (isUserRejection(error)) {
    return rejectionMessage;
  }

  // Try to decode DeFi-specific errors first
  if (decodeDeFiErrors) {
    const revertData = extractRevertData(error);
    if (revertData && revertData.length >= 10) {
      const decoded = decodeRevertReason(revertData);
      if (decoded && !decoded.includes("Unknown error")) {
        return decoded;
      }
    }
  }

  // Handle viem errors
  const errorObj = error as {
    walk?: () => unknown;
    details?: string;
    shortMessage?: string;
    message?: string;
    data?: { errorName?: string; args?: unknown[] };
  };

  const parsedError = errorObj.walk ? errorObj.walk() : error;

  if (parsedError instanceof BaseViemError) {
    if (parsedError.details) {
      return parsedError.details;
    }

    if (parsedError.shortMessage) {
      if (
        parsedError instanceof ContractFunctionRevertedError &&
        parsedError.data &&
        parsedError.data.errorName !== "Error"
      ) {
        const customErrorArgs = parsedError.data.args?.toString() ?? "";
        return `${parsedError.shortMessage.replace(/reverted\.$/, "reverted with the following reason:")}\n${parsedError.data.errorName}(${customErrorArgs})`;
      }
      return parsedError.shortMessage;
    }

    return parsedError.message ?? parsedError.name ?? fallbackMessage;
  }

  // Handle generic errors
  if (errorObj.shortMessage) return errorObj.shortMessage;
  if (errorObj.message) return errorObj.message;

  return fallbackMessage;
}

// ============================================================================
// Formatted Error Display
// ============================================================================

/**
 * Result of formatting an error for display
 */
export interface FormattedError {
  /** Short error title */
  title: string;
  /** Detailed error description */
  description: string;
  /** Optional suggestion for the user */
  suggestion?: string;
  /** Whether this was a user rejection */
  isRejection: boolean;
}

/**
 * Formats an error for user display with title, description, and suggestion.
 * Useful for modals and detailed error displays.
 *
 * @param error - The error to format
 * @returns Formatted error object
 *
 * @example
 * ```ts
 * const formatted = formatErrorForUser(error);
 * console.log(formatted.title); // "Borrow Cap Reached"
 * console.log(formatted.description); // "This asset has reached its maximum..."
 * console.log(formatted.suggestion); // "Try borrowing a different asset..."
 * ```
 */
export function formatErrorForUser(error: unknown): FormattedError {
  if (isUserRejection(error)) {
    return {
      title: "Request Cancelled",
      description: "The transaction was cancelled by the user.",
      isRejection: true,
    };
  }

  const message = getErrorMessage(error, { decodeDeFiErrors: true });
  const formatted = formatErrorForDisplay(message);

  return {
    ...formatted,
    isRejection: false,
  };
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Checks if a value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safely converts any value to an error message string
 */
export function toErrorString(error: unknown): string {
  if (error === null || error === undefined) {
    return "Unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export DeFi-specific utilities
export { decodeRevertReason, formatErrorForDisplay } from "./errorDecoder";

// Export type for error decoding result
export type { SimulationResult } from "./transactionSimulation";
