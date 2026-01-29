/**
 * useNetworkAdapter Hook
 *
 * Main entry point for the network adapter pattern.
 * Returns a unified adapter interface based on the specified network type.
 *
 * @example
 * ```tsx
 * // In a component that needs to work with both networks
 * const { adapter, isReady, networkType } = useNetworkAdapter("evm");
 *
 * // Check connection
 * if (adapter?.account.isConnected) {
 *   // Execute a transaction
 *   const result = await adapter.writeContract({
 *     address: contractAddress,
 *     abi: contractAbi,
 *     functionName: "transfer",
 *     args: [recipient, amount],
 *   });
 *
 *   // Wait for confirmation
 *   const receipt = await result.wait();
 * }
 * ```
 */

import { useMemo } from "react";
import { useEvmAdapter } from "./adapters/evmAdapter";
import { useStarknetAdapter } from "./adapters/starknetAdapter";
import type {
  NetworkType,
  NetworkAdapter,
  UseNetworkAdapterResult,
} from "./types";

/**
 * Hook to get the appropriate network adapter based on network type.
 *
 * @param networkType - The type of network ("evm" or "starknet")
 * @param chainId - Optional chain ID for EVM networks
 * @returns Adapter result with the network adapter and status
 */
export function useNetworkAdapter(
  networkType: NetworkType,
  chainId?: number
): UseNetworkAdapterResult {
  // Always call both hooks to satisfy React's rules of hooks
  const evmAdapter = useEvmAdapter(chainId);
  const starknetAdapter = useStarknetAdapter();

  // Select the appropriate adapter based on network type
  const adapter: NetworkAdapter | null = useMemo(() => {
    if (networkType === "evm") {
      return evmAdapter;
    }
    return starknetAdapter;
  }, [networkType, evmAdapter, starknetAdapter]);

  // Determine if the adapter is ready
  const isReady = useMemo(() => {
    if (!adapter) return false;
    return adapter.account.isConnected;
  }, [adapter]);

  // For now, we don't track errors at the adapter level
  // Individual operations throw their own errors
  const error: Error | null = null;

  return {
    adapter,
    isReady,
    error,
    networkType,
  };
}

/**
 * Hook that automatically detects the current network type based on
 * which wallet is connected. Useful for components that can work with
 * either network type.
 *
 * @returns The detected network type and adapter
 */
export function useAutoNetworkAdapter(): UseNetworkAdapterResult & {
  detectedNetworkType: NetworkType | null;
} {
  // Get both adapters
  const evmAdapter = useEvmAdapter();
  const starknetAdapter = useStarknetAdapter();

  // Detect which network is currently active
  const { detectedNetworkType, adapter } = useMemo(() => {
    // Prefer EVM if connected
    if (evmAdapter?.account.isConnected) {
      return { detectedNetworkType: "evm" as NetworkType, adapter: evmAdapter };
    }
    // Fall back to Starknet if connected
    if (starknetAdapter?.account.isConnected) {
      return { detectedNetworkType: "starknet" as NetworkType, adapter: starknetAdapter };
    }
    // No wallet connected
    return { detectedNetworkType: null, adapter: null };
  }, [evmAdapter, starknetAdapter]);

  const isReady = adapter?.account.isConnected ?? false;

  return {
    adapter,
    isReady,
    error: null,
    networkType: detectedNetworkType ?? "evm",
    detectedNetworkType,
  };
}

export default useNetworkAdapter;
