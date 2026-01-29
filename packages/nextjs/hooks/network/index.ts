/**
 * Network Adapter Pattern
 *
 * This module provides a unified interface for interacting with both EVM and Starknet
 * blockchains. It abstracts away the differences between wagmi/viem (EVM) and
 * starknet-react/starknet.js (Starknet) into a common API.
 *
 * ## Usage
 *
 * ### Basic Usage
 * ```tsx
 * import { useNetworkAdapter } from "~~/hooks/network";
 *
 * function MyComponent({ networkType }: { networkType: "evm" | "starknet" }) {
 *   const { adapter, isReady } = useNetworkAdapter(networkType);
 *
 *   if (!isReady) {
 *     return <div>Connect wallet to continue</div>;
 *   }
 *
 *   const handleTransfer = async () => {
 *     const result = await adapter.writeContract({
 *       address: tokenAddress,
 *       abi: tokenAbi,
 *       functionName: "transfer",
 *       args: [recipient, amount],
 *     });
 *     await result.wait();
 *   };
 *
 *   return <button onClick={handleTransfer}>Transfer</button>;
 * }
 * ```
 *
 * ### Auto-Detection
 * ```tsx
 * import { useAutoNetworkAdapter } from "~~/hooks/network";
 *
 * function MyComponent() {
 *   const { adapter, detectedNetworkType, isReady } = useAutoNetworkAdapter();
 *
 *   if (!detectedNetworkType) {
 *     return <div>No wallet connected</div>;
 *   }
 *
 *   return <div>Connected to {detectedNetworkType}</div>;
 * }
 * ```
 *
 * ### Multicall (Native on Starknet)
 * ```tsx
 * const { adapter } = useNetworkAdapter("starknet");
 *
 * // Execute multiple calls in a single transaction
 * const result = await adapter.multiCall([
 *   { address: token1, abi, functionName: "approve", args: [spender, amount1] },
 *   { address: token2, abi, functionName: "approve", args: [spender, amount2] },
 *   { address: router, abi, functionName: "swap", args: [params] },
 * ]);
 * ```
 *
 * ## Architecture
 *
 * The adapter pattern consists of:
 * - `types.ts` - Shared type definitions for the unified interface
 * - `adapters/evmAdapter.ts` - EVM implementation using wagmi/viem
 * - `adapters/starknetAdapter.ts` - Starknet implementation using starknet-react
 * - `useNetworkAdapter.ts` - Main hook that selects the appropriate adapter
 *
 * ## Migration Guide
 *
 * To migrate existing code from direct hook usage:
 *
 * Before:
 * ```tsx
 * if (networkType === "evm") {
 *   const { address } = useAccount();
 *   // EVM logic
 * } else {
 *   const { address } = useStarkAccount();
 *   // Starknet logic
 * }
 * ```
 *
 * After:
 * ```tsx
 * const { adapter } = useNetworkAdapter(networkType);
 * const { address } = adapter.account;
 * // Unified logic
 * ```
 */

// Main hooks
export { useNetworkAdapter, useAutoNetworkAdapter } from "./useNetworkAdapter";
export { useNetworkAccount, useDualNetworkAccounts } from "./useNetworkAccount";

// Adapter implementations (for advanced use cases)
export { useEvmAdapter } from "./adapters/evmAdapter";
export { useStarknetAdapter } from "./adapters/starknetAdapter";

// Types
export type {
  NetworkType,
  ConnectionStatus,
  NetworkAccount,
  TransactionResult,
  TransactionReceipt,
  ReadContractParams,
  WriteContractParams,
  MultiCallItem,
  TransactionOptions,
  TokenBalance,
  NetworkAdapter,
  UseNetworkAdapterResult,
} from "./types";
