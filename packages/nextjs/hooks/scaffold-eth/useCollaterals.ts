import { useScaffoldReadContract } from "./useScaffoldReadContract";
import { formatUnits } from "viem";

interface CollateralToken {
  symbol: string;
  balance: number; // Human readable format
  rawBalance: bigint; // Full precision balance
  address: string;
  decimals: number;
}

export const useCollaterals = (tokenAddress: string, protocolName: string, userAddress: string, enabled: boolean) => {
  const { data, isLoading } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getPossibleCollaterals",
    args: [tokenAddress, protocolName.toLowerCase(), userAddress],
    query: {
      enabled,
    },
  });

  if (!data) return { collaterals: [], isLoading };

  const [addresses, balances, symbols, decimals] = data;
  
  const collaterals = addresses.map((address: string, index: number) => {
    const rawBalance = BigInt(balances[index]); // Convert to bigint
    return {
      symbol: symbols[index],
      rawBalance, // Store the full precision balance
      balance: Number(formatUnits(rawBalance, decimals[index])), // Human readable format
      address,
      decimals: Number(decimals[index]),
    };
  });

  return { collaterals, isLoading };
}; 