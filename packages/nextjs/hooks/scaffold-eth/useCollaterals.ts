import { useScaffoldReadContract } from "./useScaffoldReadContract";
import { formatUnits } from "viem";
import { ContractName } from "~~/utils/scaffold-eth/contract";
import { getGatewayContractName, normalizeProtocolName, UNSUPPORTED_GATEWAY_PROTOCOLS } from "./gatewayContracts";

export const useCollaterals = (tokenAddress: string, protocolName: string, userAddress: string, enabled: boolean, chainId?: number) => {
  // Check if protocol is supported for generic collateral fetching
  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isUnsupportedProtocol = UNSUPPORTED_GATEWAY_PROTOCOLS.has(normalizedProtocol);

  // Get gateway contract name using shared utility
  const gatewayContractName = getGatewayContractName(protocolName);

  const { data, isLoading } = useScaffoldReadContract({
    contractName: gatewayContractName as ContractName,
    functionName: "getPossibleCollaterals",
    args: [tokenAddress, userAddress],
    chainId: chainId as any,
    query: {
      // Don't query for protocols that don't support the generic interface
      enabled: enabled && !isUnsupportedProtocol,
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