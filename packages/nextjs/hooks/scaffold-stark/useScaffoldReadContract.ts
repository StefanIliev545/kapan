import type { Abi } from "@starknet-react/core";
import { useReadContract } from "@starknet-react/core";
import type { BlockNumber } from "starknet";
import { BlockTag } from "starknet";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useStarkBlockNumber } from "./useBlockNumberContext";
import { replacer } from "~~/utils/scaffold-stark/common";
import type {
  AbiFunctionOutputs,
  ContractAbi,
  ContractName,
  ExtractAbiFunctionNamesScaffold,
  UseScaffoldReadConfig,
} from "~~/utils/scaffold-stark/contract";

export const useScaffoldReadContract = <
  TAbi extends Abi,
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNamesScaffold<ContractAbi<TContractName>, "view">,
>({
  contractName,
  functionName,
  args,
  ...readConfig
}: UseScaffoldReadConfig<TAbi, TContractName, TFunctionName>) => {
  const { data: deployedContract } = useDeployedContractInfo(contractName);
  const blockNumber = useStarkBlockNumber();

  const { watch: watchConfig, query: queryOptions, ...restConfig } = readConfig as any;

  const serializedArgs = args ? JSON.parse(JSON.stringify(args, replacer)) : [];
  const argsReady = !Array.isArray(args) || !args.some(arg => arg === undefined);
  const mergedQueryOptions = {
    placeholderData: (
      previousData: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined,
    ) => previousData,
    staleTime: 30_000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    ...queryOptions,
    enabled: argsReady && (queryOptions?.enabled ?? true),
  };


  const blockIdentifier: BlockNumber =
    watchConfig && blockNumber !== undefined
      ? (Number(blockNumber) as BlockNumber)
      : (BlockTag.LATEST);

  return useReadContract({
    functionName,
    address: deployedContract?.address,
    abi: deployedContract?.abi,
    watch: false,
    args: serializedArgs as typeof args,
    enabled: args && (!Array.isArray(args) || !args.some(arg => arg === undefined)),
    blockIdentifier,
    ...restConfig,
    query: mergedQueryOptions,
  }) as Omit<ReturnType<typeof useReadContract>, "data"> & {
    data: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined;
  };
};
