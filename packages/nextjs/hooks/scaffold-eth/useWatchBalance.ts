import { useEffect } from "react";
import { UseBalanceParameters, useBalance } from "wagmi";
import { useBlockNumberContext } from "~~/hooks/scaffold-eth";

/**
 * Wrapper around wagmi's useBalance hook for fetching **native currency** (ETH) balances.
 * Updates data on every block change when watch is true.
 *
 * This hook is part of the scaffold-eth infrastructure and provides block-watching
 * capability for real-time balance updates. For most use cases, consider using
 * the unified balance hooks from `~~/hooks/balance` instead.
 *
 * **When to use this hook:**
 * - For native currency (ETH) balance with block-watching capability
 * - When you need wagmi's built-in balance data structure
 * - In scaffold-eth components that depend on the wagmi return type
 *
 * **When to use unified hooks instead:**
 * - For ERC20 token balances: `useTokenBalance` from `~~/hooks/balance`
 * - For cross-network (EVM + Starknet): `useNativeBalance` from `~~/hooks/balance`
 * - When you need a unified interface across networks
 *
 * @example Basic usage
 * ```tsx
 * const { data: balance, isLoading } = useWatchBalance(
 *   { address: "0x..." },
 *   true // enable block-watching
 * );
 * ```
 *
 * @param useBalanceParameters - Parameters passed to wagmi's useBalance hook
 * @param watch - Whether to refetch on each new block (default: false)
 * @returns The useBalance result (minus refetch function)
 *
 * @see useTokenBalance from ~~/hooks/balance for ERC20 balances
 * @see useNativeBalance from ~~/hooks/balance for unified native balance hook
 */
export const useWatchBalance = (
  useBalanceParameters: UseBalanceParameters,
  watch = false,
) => {
  const blockNumber = useBlockNumberContext();
  const { refetch, ...restUseBalanceReturn } = useBalance(useBalanceParameters);

  useEffect(() => {
    if (watch && blockNumber !== undefined) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, watch]);

  return restUseBalanceReturn;
};
