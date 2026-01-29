/**
 * useNativeBalance Hook
 *
 * Fetches native currency balance (ETH on EVM, ETH on Starknet).
 * Provides a unified interface across networks with optional block-watching.
 *
 * @example
 * ```tsx
 * // EVM - ETH balance with block watching
 * const { balance, formatted, isLoading } = useNativeBalance({
 *   network: "evm",
 *   watch: true,
 * });
 *
 * // Starknet - ETH balance
 * const { balance, formatted } = useNativeBalance({
 *   network: "starknet",
 * });
 *
 * // Specific address (not connected wallet)
 * const { balance } = useNativeBalance({
 *   network: "evm",
 *   ownerAddress: "0x1234...",
 * });
 * ```
 */

import { useEffect } from "react";
import { formatEther } from "viem";
import { useBalance } from "wagmi";
import { useAccount as useEvmAccount } from "wagmi";
import { useBlockNumberContext } from "~~/hooks/scaffold-eth";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import type { UseNativeBalanceOptions, TokenBalanceResult } from "./types";

// Starknet ETH token address
const STARKNET_ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

/**
 * Hook for fetching native currency balance across networks.
 *
 * On EVM: Fetches ETH balance using wagmi's useBalance
 * On Starknet: Fetches ETH token balance using the token balance hook
 *
 * @param options - Configuration options
 * @returns Balance result with unified interface
 */
export function useNativeBalance(
  options: UseNativeBalanceOptions = {}
): TokenBalanceResult {
  const {
    network = "evm",
    chainId,
    ownerAddress,
    watch = false,
  } = options;

  // EVM native balance
  const evmResult = useEvmNativeBalance({
    chainId,
    ownerAddress,
    watch,
    enabled: network === "evm",
  });

  // Starknet native balance (ETH token)
  const starkResult = useTokenBalance({
    tokenAddress: STARKNET_ETH_ADDRESS,
    network: "starknet",
    decimalsHint: 18,
    symbol: "ETH",
    ownerAddress,
  });

  // Return the appropriate result based on network
  if (network === "starknet") {
    return starkResult;
  }

  return evmResult;
}

/**
 * Internal hook for EVM native balance with block-watching
 */
function useEvmNativeBalance({
  chainId,
  ownerAddress,
  watch,
  enabled,
}: {
  chainId?: number;
  ownerAddress?: string;
  watch: boolean;
  enabled: boolean;
}): TokenBalanceResult {
  const { address: connectedAddress } = useEvmAccount();
  const blockNumber = useBlockNumberContext();

  const targetAddress = (ownerAddress ?? connectedAddress) as `0x${string}` | undefined;

  const {
    data: balance,
    isLoading,
    isError,
    error,
    refetch,
  } = useBalance({
    address: targetAddress,
    chainId,
    query: {
      enabled: enabled && !!targetAddress,
    },
  });

  // Block-watching: refetch on new blocks
  useEffect(() => {
    if (watch && blockNumber !== undefined && enabled) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, watch, enabled]);

  const rawBalance = balance?.value ?? 0n;
  const formatted = balance ? formatEther(balance.value) : "0";

  return {
    balance: rawBalance,
    value: rawBalance,
    decimals: 18,
    symbol: balance?.symbol ?? "ETH",
    formatted,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

export default useNativeBalance;
