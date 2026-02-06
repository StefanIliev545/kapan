import type { Address } from "@starknet-react/chains";
import { useScaffoldTokenBalance } from "./useScaffoldTokenBalance";

type UseScaffoldStrkBalanceProps = {
  /** Wallet address to check balance for. Defaults to connected wallet. */
  address?: Address | string;
};

/**
 * Hook to fetch STRK balance on Starknet using scaffold contract configuration.
 *
 * This is a convenience wrapper around useScaffoldTokenBalance for the STRK token.
 * It resolves the STRK token address from scaffold-stark's deployed contracts.
 *
 * **When to use this hook:**
 * - For fetching STRK balance on Starknet in scaffold-stark components
 * - When you need to use scaffold contract names instead of addresses
 *
 * **When to use useTokenBalance instead:**
 * - For arbitrary token addresses (not scaffold contracts)
 * - For cross-network balance fetching
 *
 * @example
 * ```tsx
 * const { value, formatted, isLoading } = useScaffoldStrkBalance({
 *   address: "0x...", // Optional: defaults to connected wallet
 * });
 *
 * return <span>{formatted} STRK</span>;
 * ```
 *
 * @see useTokenBalance for direct address-based token balance fetching
 */
const useScaffoldStrkBalance = ({ address }: UseScaffoldStrkBalanceProps) => {
  return useScaffoldTokenBalance({
    address,
    tokenContractName: "Strk",
    symbol: "STRK",
    decimals: 18,
  });
};

export default useScaffoldStrkBalance;
