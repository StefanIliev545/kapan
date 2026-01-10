import { Address } from "@starknet-react/chains";
import { useDeployedContractInfo } from "./useDeployedContractInfo";
import { useReadContract } from "@starknet-react/core";
import { BlockNumber } from "starknet";
import { Abi } from "abi-wan-kanabi";
import { formatUnits } from "ethers";
import { useStarkBlockNumber } from "./useBlockNumberContext";
import { ContractName } from "~~/utils/scaffold-stark/contract";

type UseScaffoldTokenBalanceProps = {
  address?: Address | string;
  tokenContractName: ContractName;
  symbol: string;
  decimals?: number;
};

/**
 * Base hook for fetching token balances on Starknet.
 * Used internally by useScaffoldEthBalance and useScaffoldStrkBalance.
 */
export const useScaffoldTokenBalance = ({
  address,
  tokenContractName,
  symbol,
  decimals = 18,
}: UseScaffoldTokenBalanceProps) => {
  const { data: deployedContract } = useDeployedContractInfo(tokenContractName);

  const blockNumber = useStarkBlockNumber();

  const { data, ...props } = useReadContract({
    functionName: "balance_of",
    address: deployedContract?.address,
    abi: deployedContract?.abi as Abi as any[],
    watch: false,
    enabled: true,
    args: address ? [address] : [],
    blockIdentifier: (blockNumber as unknown as BlockNumber) ?? ("latest" as BlockNumber),
  });

  return {
    value: data as unknown as bigint,
    decimals,
    symbol,
    formatted: data ? formatUnits(data as unknown as bigint, decimals) : "0",
    ...props,
  };
};

export default useScaffoldTokenBalance;
