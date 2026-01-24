/**
 * Transaction Simulation Utilities
 *
 * Consolidates simulation patterns for EVM transactions including:
 * - Single transaction simulation with error decoding
 * - Sequential multi-step simulation for limit orders
 * - Gas estimation utilities
 */

import type { PublicClient, Address, Hex, WalletClient } from "viem";
import { simulateTransaction, formatErrorForDisplay, decodeRevertReason } from "./errorDecoder";

export type SimulationResult = {
  success: boolean;
  error?: string;
  rawError?: string;
};

export type TransactionCall = {
  to: Address | string;
  data: Hex | string;
};

export type SequentialExecutionOptions = {
  /** Callback for progress updates */
  onProgress?: (step: number, total: number, phase: "simulating" | "executing" | "confirmed") => void;
  /** Callback for errors */
  onError?: (step: number, error: string) => void;
  /** Whether to simulate before executing each step */
  simulateFirst?: boolean;
};

/**
 * Extract revert reason from simulation error
 * Handles various error formats from different providers
 */
export function extractRevertReason(error: unknown): string {
  if (!error) return "Unknown error";

  const errorObj = error as { message?: string; shortMessage?: string };
  const errorMsg = errorObj?.message || errorObj?.shortMessage || String(error);

  // Try to extract revert reason from common patterns
  const revertMatch =
    errorMsg.match(/reverted with.*?['"]([^'"]+)['"]/i) ||
    errorMsg.match(/reason:\s*([^\n]+)/i) ||
    errorMsg.match(/error:\s*([^\n]+)/i) ||
    errorMsg.match(/execution reverted:\s*([^\n]+)/i);

  if (revertMatch) {
    return revertMatch[1];
  }

  // Try to extract hex data and decode it
  const hexMatch = errorMsg.match(/(0x[a-fA-F0-9]{8,})/);
  if (hexMatch) {
    const decoded = decodeRevertReason(hexMatch[1]);
    if (decoded && !decoded.includes("Unknown error")) {
      return decoded;
    }
  }

  return errorMsg;
}

/**
 * Simulate a single transaction and return formatted result
 */
export async function simulateSingleTransaction(
  publicClient: PublicClient,
  call: TransactionCall,
  from: Address
): Promise<SimulationResult> {
  // Ensure types are correct for simulateTransaction
  const toAddr = call.to as `0x${string}`;
  const dataHex = call.data as `0x${string}`;
  const fromAddr = from as `0x${string}`;
  return simulateTransaction(publicClient, toAddr, dataHex, fromAddr);
}

/**
 * Simulate a batch of transactions sequentially
 * Returns on first failure with step number and error details
 */
export async function simulateTransactionBatch(
  publicClient: PublicClient,
  calls: TransactionCall[],
  from: Address
): Promise<{ success: boolean; failedStep?: number; error?: string; rawError?: string }> {
  for (let i = 0; i < calls.length; i++) {
    const result = await simulateSingleTransaction(publicClient, calls[i], from);
    if (!result.success) {
      return {
        success: false,
        failedStep: i + 1,
        error: result.error,
        rawError: result.rawError,
      };
    }
  }
  return { success: true };
}

/**
 * Execute transactions sequentially with optional pre-simulation
 * Used for limit order flows where batching isn't supported
 */
export type TransactionReceipt = Awaited<ReturnType<PublicClient["waitForTransactionReceipt"]>>;

export async function executeSequentialTransactions(
  publicClient: PublicClient,
  walletClient: WalletClient,
  calls: TransactionCall[],
  userAddress: Address,
  options: SequentialExecutionOptions = {}
): Promise<{ success: boolean; hashes: Hex[]; receipts: TransactionReceipt[]; failedStep?: number; error?: string }> {
  const { onProgress, onError, simulateFirst = true } = options;
  const hashes: Hex[] = [];
  const receipts: TransactionReceipt[] = [];

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];

    // Simulate first if enabled
    if (simulateFirst) {
      onProgress?.(i + 1, calls.length, "simulating");

      try {
        await publicClient.call({
          account: userAddress,
          to: call.to as `0x${string}`,
          data: call.data as `0x${string}`,
        });
      } catch (simError: unknown) {
        const revertReason = extractRevertReason(simError);
        const errorMessage = `Transaction simulation failed at step ${i + 1}: ${revertReason}`;
        onError?.(i + 1, revertReason);
        return {
          success: false,
          hashes,
          receipts,
          failedStep: i + 1,
          error: errorMessage,
        };
      }
    }

    // Execute the transaction
    onProgress?.(i + 1, calls.length, "executing");

    try {
      // Get the account from walletClient to ensure proper typing
      const account = walletClient.account;
      if (!account) {
        throw new Error("Wallet account not available");
      }

      const hash = await walletClient.sendTransaction({
        to: call.to as Address,
        data: call.data as Hex,
        account,
        chain: walletClient.chain,
      });

      hashes.push(hash);

      // Wait for confirmation and store receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      receipts.push(receipt);
      onProgress?.(i + 1, calls.length, "confirmed");
    } catch (execError: unknown) {
      const errorMessage = extractRevertReason(execError);
      onError?.(i + 1, errorMessage);
      return {
        success: false,
        hashes,
        receipts,
        failedStep: i + 1,
        error: `Transaction execution failed at step ${i + 1}: ${errorMessage}`,
      };
    }
  }

  return { success: true, hashes, receipts };
}

/**
 * Format simulation error for user display
 * Wraps the formatErrorForDisplay from errorDecoder with additional context
 */
export function formatSimulationError(
  error: string,
  stepNumber?: number
): { title: string; description: string; suggestion?: string } {
  const formatted = formatErrorForDisplay(error);

  if (stepNumber !== undefined) {
    formatted.title = `Step ${stepNumber}: ${formatted.title}`;
  }

  return formatted;
}
