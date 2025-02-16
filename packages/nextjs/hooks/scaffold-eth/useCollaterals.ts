import { useScaffoldReadContract } from "./useScaffoldReadContract";
import { formatUnits } from "viem";

export const useCollaterals = (tokenAddress: string, protocolName: string, userAddress: string) => {
  const { data, isLoading } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getPossibleCollaterals",
    args: [tokenAddress, protocolName.toLowerCase(), userAddress],
  });

  if (!data) return { collaterals: [], isLoading };

  const [addresses, balances, symbols, decimals] = data;
  const collaterals = addresses.map((address: string, index: number) => ({
    symbol: symbols[index],
    balance: Number(formatUnits(balances[index], decimals[index])),
    address,
    decimals: Number(decimals[index]),
  }));

  return { collaterals, isLoading };
}; 