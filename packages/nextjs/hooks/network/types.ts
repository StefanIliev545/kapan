/**
 * Core types for the network adapter pattern.
 * These types unify EVM and Starknet operations behind a common interface.
 */

import type { Hash } from "viem";
import type { InvokeFunctionResponse } from "starknet";

/**
 * Network type discriminator
 */
export type NetworkType = "evm" | "starknet";

/**
 * Connection status for both networks
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

/**
 * Unified account state across networks
 */
export interface NetworkAccount {
  /** The connected wallet address (if any) */
  address: string | undefined;
  /** Whether the wallet is connected and ready */
  isConnected: boolean;
  /** Current connection status */
  status: ConnectionStatus;
  /** Chain ID (EVM number or Starknet bigint) */
  chainId: number | bigint | undefined;
}

/**
 * Unified transaction result
 */
export interface TransactionResult {
  /** Transaction hash */
  hash: string;
  /** Wait for confirmation (returns receipt) */
  wait: () => Promise<TransactionReceipt>;
}

/**
 * Simplified transaction receipt
 */
export interface TransactionReceipt {
  /** Transaction hash */
  hash: string;
  /** Block number the transaction was included in */
  blockNumber: bigint;
  /** Whether the transaction succeeded */
  success: boolean;
}

/**
 * Parameters for reading from a contract
 */
export interface ReadContractParams {
  /** Contract address */
  address: string;
  /** ABI of the contract (EVM ABI or Starknet ABI) */
  abi: unknown;
  /** Function/entry point name */
  functionName: string;
  /** Arguments to pass to the function */
  args?: unknown[];
}

/**
 * Parameters for writing to a contract (single call)
 */
export interface WriteContractParams {
  /** Contract address */
  address: string;
  /** ABI of the contract */
  abi: unknown;
  /** Function/entry point name */
  functionName: string;
  /** Arguments to pass to the function */
  args?: unknown[];
  /** Value to send (ETH/STRK) - optional */
  value?: bigint;
}

/**
 * A multicall batch item
 */
export interface MultiCallItem {
  /** Contract address */
  address: string;
  /** ABI of the contract */
  abi: unknown;
  /** Function/entry point name */
  functionName: string;
  /** Arguments to pass to the function */
  args?: unknown[];
  /** Value to send (ETH/STRK) - optional */
  value?: bigint;
}

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /** Number of block confirmations to wait for */
  blockConfirmations?: number;
  /** Callback when block is confirmed */
  onBlockConfirmation?: (receipt: TransactionReceipt) => void;
}

/**
 * Token balance information
 */
export interface TokenBalance {
  /** Raw balance in smallest units (wei, etc.) */
  raw: bigint;
  /** Formatted balance as string */
  formatted: string;
  /** Token decimals */
  decimals: number;
}

/**
 * The main network adapter interface.
 * Implementations for EVM and Starknet provide these capabilities.
 */
export interface NetworkAdapter {
  /** Network type identifier */
  networkType: NetworkType;

  /** Unified account state */
  account: NetworkAccount;

  /**
   * Execute a single contract write operation.
   * Handles wallet interaction and transaction submission.
   */
  writeContract: (
    params: WriteContractParams,
    options?: TransactionOptions
  ) => Promise<TransactionResult>;

  /**
   * Execute multiple contract calls in a batch.
   * EVM: Uses multicall or sequential transactions
   * Starknet: Uses native multicall via account.execute()
   */
  multiCall: (
    calls: MultiCallItem[],
    options?: TransactionOptions
  ) => Promise<TransactionResult>;

  /**
   * Read data from a contract (view/pure function).
   */
  readContract: <T = unknown>(params: ReadContractParams) => Promise<T>;

  /**
   * Get native token balance (ETH for EVM, STRK/ETH for Starknet).
   */
  getNativeBalance: (address?: string) => Promise<TokenBalance>;

  /**
   * Get ERC20/token balance.
   */
  getTokenBalance: (
    tokenAddress: string,
    ownerAddress?: string
  ) => Promise<TokenBalance>;

  /**
   * Switch to a different chain (EVM only - no-op on Starknet).
   */
  switchChain?: (chainId: number) => Promise<void>;

  /**
   * Get block explorer URL for a transaction.
   */
  getExplorerTxUrl: (txHash: string) => string;
}

/**
 * Result type for the useNetworkAdapter hook
 */
export interface UseNetworkAdapterResult {
  /** The network adapter instance */
  adapter: NetworkAdapter | null;
  /** Whether the adapter is ready (wallet connected, etc.) */
  isReady: boolean;
  /** Any error that occurred during initialization */
  error: Error | null;
  /** Network type for the current adapter */
  networkType: NetworkType;
}

/**
 * Native transaction hash types from each network
 */
export type EvmTransactionHash = Hash;
export type StarknetTransactionHash = InvokeFunctionResponse["transaction_hash"];
