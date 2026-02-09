import { Address } from "@starknet-react/chains";
import { useDeployedContractInfo } from "./useDeployedContractInfo";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { ContractName } from "~~/utils/scaffold-stark/contract";

type UseScaffoldTokenBalanceProps = {
  /** Wallet address to check balance for. Defaults to connected wallet. */
  address?: Address | string;
  /** Scaffold-stark contract name (e.g., "Eth", "Strk") */
  tokenContractName: ContractName;
  /** Token symbol for display */
  symbol: string;
  /** Token decimals (default: 18) */
  decimals?: number;
};

/**
 * Hook for fetching token balances on Starknet using scaffold contract names.
 *
 * This hook is part of the scaffold-stark infrastructure. It resolves contract names
 * (like "Eth", "Strk") to addresses via scaffold-stark's deployed contract registry,
 * then delegates to the unified useTokenBalance hook.
 *
 * **When to use this hook:**
 * - When you have a scaffold-stark contract name instead of an address
 * - In scaffold-stark components that use the contract naming convention
 *
 * **When to use useTokenBalance instead:**
 * - When you have the token address directly
 * - For non-scaffold contract tokens
 * - For cross-network compatibility
 *
 * @example Basic usage
 * ```tsx
 * const { value, formatted, isLoading } = useScaffoldTokenBalance({
 *   address: "0x...",           // Optional: defaults to connected wallet
 *   tokenContractName: "Eth",   // Scaffold contract name
 *   symbol: "ETH",
 *   decimals: 18,
 * });
 *
 * return <span>{formatted} {symbol}</span>;
 * ```
 *
 * @see useTokenBalance from ~~/hooks/balance for direct address-based fetching
 * @see useScaffoldEthBalance for convenient ETH balance wrapper
 * @see useScaffoldStrkBalance for convenient STRK balance wrapper
 */
export const useScaffoldTokenBalance = ({
  address,
  tokenContractName,
  symbol,
  decimals = 18,
}: UseScaffoldTokenBalanceProps) => {
  const { data: deployedContract, isLoading: isContractLoading } = useDeployedContractInfo(tokenContractName);

  // Use the unified token balance hook with the resolved contract address
  const result = useTokenBalance({
    tokenAddress: deployedContract?.address ?? "",
    network: "stark",
    decimalsHint: decimals,
    symbol,
    ownerAddress: address,
  });

  // Don't fetch balance until we have the contract address
  const isLoading = isContractLoading || (!deployedContract?.address && !result.isLoading);

  return {
    value: result.balance,
    decimals,
    symbol,
    formatted: result.formatted,
    isLoading: isLoading || result.isLoading,
    isError: result.isError,
    refetch: result.refetch,
  };
};

export default useScaffoldTokenBalance;
