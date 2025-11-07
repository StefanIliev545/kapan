import { useScaffoldReadContract } from "./useScaffoldReadContract";
import { formatUnits } from "viem";

interface CollateralToken {
  symbol: string;
  balance: number; // Human readable format
  rawBalance: bigint; // Full precision balance
  address: string;
  decimals: number;
}

// Map protocol names to gateway view contract names
const PROTOCOL_TO_GATEWAY_MAP: Record<string, "AaveGatewayView" | "CompoundGatewayView" | "VenusGatewayView"> = {
  aave: "AaveGatewayView",
  compound: "CompoundGatewayView",
  venus: "VenusGatewayView",
};

export const useCollaterals = (tokenAddress: string, protocolName: string, userAddress: string, enabled: boolean) => {
  // Normalize protocol name and get gateway contract name
  const normalizedProtocol = protocolName.toLowerCase().replace(/\s+v\d+$/i, "").replace(/\s+/g, "");
  const gatewayContractName = PROTOCOL_TO_GATEWAY_MAP[normalizedProtocol] || "AaveGatewayView";

  const { data, isLoading } = useScaffoldReadContract({
    contractName: gatewayContractName,
    functionName: "getPossibleCollaterals",
    args: [tokenAddress, userAddress],
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