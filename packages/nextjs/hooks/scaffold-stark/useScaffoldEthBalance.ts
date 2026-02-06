import type { Address } from "@starknet-react/chains";
import { useScaffoldTokenBalance } from "./useScaffoldTokenBalance";

type UseScaffoldEthBalanceProps = {
  /** Wallet address to check balance for. Defaults to connected wallet. */
  address?: Address | string;
};

/**
 * Hook to fetch ETH balance on Starknet using scaffold contract configuration.
 *
 * This is a convenience wrapper around useScaffoldTokenBalance for the ETH token.
 * It resolves the ETH token address from scaffold-stark's deployed contracts.
 *
 * **When to use this hook:**
 * - For fetching ETH balance on Starknet in scaffold-stark components
 * - When you need to use scaffold contract names instead of addresses
 *
 * **When to use other hooks instead:**
 * - `useNativeBalance({ network: "starknet" })` - For unified native balance
 * - `useTokenBalance` - For arbitrary token addresses
 *
 * @example
 * ```tsx
 * const { value, formatted, isLoading } = useScaffoldEthBalance({
 *   address: "0x...", // Optional: defaults to connected wallet
 * });
 *
 * return <span>{formatted} ETH</span>;
 * ```
 *
 * @see useNativeBalance from ~~/hooks/balance for unified native balance
 * @see useTokenBalance for direct address-based token balance fetching
 */
const useScaffoldEthBalance = ({ address }: UseScaffoldEthBalanceProps) => {
  return useScaffoldTokenBalance({
    address,
    tokenContractName: "Eth",
    symbol: "ETH",
    decimals: 18,
  });
};

export default useScaffoldEthBalance;
