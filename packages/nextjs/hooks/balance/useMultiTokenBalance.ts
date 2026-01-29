/**
 * useMultiTokenBalance Hook
 *
 * Fetches balances for multiple tokens in a single hook call.
 * Uses multicall on EVM for efficiency, parallel calls on Starknet.
 *
 * This is a re-export of the existing useWalletTokenBalances with
 * a cleaner name and typing that fits the consolidated pattern.
 *
 * @example
 * ```tsx
 * const { balances, isLoading, refetch } = useMultiTokenBalance({
 *   tokens: [
 *     { address: "0xUSDC...", decimals: 6 },
 *     { address: "0xWETH...", decimals: 18 },
 *   ],
 *   network: "evm",
 *   chainId: 42161, // Arbitrum
 * });
 *
 * // Access individual balances
 * const usdcBalance = balances["0xusdc..."]?.balance ?? 0n;
 * ```
 */

import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import type { UseMultiTokenBalanceOptions, MultiTokenBalanceResult } from "./types";

/**
 * Hook for fetching multiple token balances efficiently.
 *
 * Uses multicall on EVM networks to batch balance and decimals queries.
 * On Starknet, executes parallel RPC calls.
 *
 * @param options - Configuration including tokens array and network
 * @returns Object with balances map, loading state, and refetch function
 */
export function useMultiTokenBalance(
  options: UseMultiTokenBalanceOptions
): MultiTokenBalanceResult {
  const { tokens, network, chainId, ownerAddress } = options;

  // Normalize network name for internal hook
  const normalizedNetwork = network === "starknet" ? "starknet" : "evm";

  const result = useWalletTokenBalances({
    tokens: tokens.map(t => ({
      address: t.address,
      decimals: t.decimals,
    })),
    network: normalizedNetwork,
    chainId,
    ownerAddress,
  });

  return {
    balances: result.balances,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}

export default useMultiTokenBalance;
