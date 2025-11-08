import { Abi, useReadContract, useNetwork } from "@starknet-react/core";
import { BlockNumber, BlockTag } from "starknet";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useStarkBlockNumber } from "./useBlockNumberContext";
import { replacer } from "~~/utils/scaffold-stark/common";
import { useNetworkContext } from "~~/contexts/NetworkContext";
import {
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
  const { chain } = useNetwork(); // Get Starknet chain info
  const { selectedChainId, networkType } = useNetworkContext();

  // Create network key for query invalidation (used by NetworkContext to invalidate queries)
  // Note: useReadContract generates its own query keys internally, but this networkKey
  // ensures we're network-aware and helps with invalidation via NetworkContext
  const starknetChainId = chain?.id; // string id from starknet-react (e.g. 'SN_MAIN' / 'SN_SEPOLIA')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const networkKey = networkType === "stark" ? `stark:${starknetChainId ?? selectedChainId ?? "unknown"}` : `evm:${selectedChainId ?? "unknown"}`;

  const { watch: watchConfig, query: queryOptions, ...restConfig } = readConfig as any;

  const serializedArgs = args ? JSON.parse(JSON.stringify(args, replacer)) : [];
  const argsReady = !Array.isArray(args) || !args.some(arg => arg === undefined);
  const contractReady = deployedContract?.address && deployedContract?.abi;
  
  // Only enable for Starknet network and when contract is ready
  const enabled = contractReady && argsReady && networkType === "stark" && (queryOptions?.enabled ?? true);
  
  const mergedQueryOptions = {
    placeholderData: (
      previousData: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined,
    ) => previousData,
    staleTime: 0, // Set to 0 to ensure fresh fetch on network change
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    ...queryOptions,
    enabled,
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
    enabled: enabled && contractReady && args && (!Array.isArray(args) || !args.some(arg => arg === undefined)),
    blockIdentifier,
    ...restConfig,
    query: {
      ...mergedQueryOptions,
      // Note: useReadContract generates its own query keys internally
      // The networkKey is used for invalidation via NetworkContext
      // The provider remounting (fix #1) ensures fresh queries on network change
    },
  }) as Omit<ReturnType<typeof useReadContract>, "data"> & {
    data: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined;
  };
};
