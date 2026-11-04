import { useEffect, useRef } from "react";
import type { Abi } from "@starknet-react/core";
import { useNetwork, useReadContract } from "@starknet-react/core";
import type { PlaceholderDataFunction, UseQueryOptions } from "@tanstack/react-query";
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

type ReadQueryOptions = Pick<
  UseQueryOptions,
  | "placeholderData"
  | "staleTime"
  | "gcTime"
  | "refetchOnWindowFocus"
  | "refetchOnReconnect"
  | "refetchOnMount"
  | "refetchInterval"
  | "retry"
  | "retryDelay"
  | "meta"
> & { enabled?: boolean };

const hasUndefinedArgument = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(hasUndefinedArgument);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasUndefinedArgument);
  }
  return false;
};

export const useScaffoldReadContract = <
  TAbi extends Abi,
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNamesScaffold<ContractAbi<TContractName>, "view">,
>({
  contractName,
  functionName,
  args,
  watch: watchConfig,
  query: queryOptions,
  ...readConfig
}: Omit<UseScaffoldReadConfig<TAbi, TContractName, TFunctionName>, "enabled" | "contractName"> &
  ReadQueryOptions & {
    contractName: TContractName;
    query?: ReadQueryOptions;
  }) => {
  const { data: deployedContract } = useDeployedContractInfo<TContractName>(contractName);
  const { chain } = useNetwork();
  const blockNumber = useStarkBlockNumber();

  const serializedArgs = JSON.parse(JSON.stringify(args ?? [], replacer));
  const ready =
    Boolean(deployedContract?.address && deployedContract.abi && functionName) &&
    !hasUndefinedArgument(args ?? []);
  const options = {
    placeholderData: (previousData: unknown) => previousData,
    staleTime: 30_000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    ...readConfig,
    ...queryOptions,
  };
  const enabled = ready && (options.enabled ?? true);
  // Block changes may reuse data, but account arguments, pool/contract, function,
  // and chain changes must start with data belonging to their own query.
  const scope = JSON.stringify([chain.id, deployedContract?.address, functionName, serializedArgs], replacer);
  const placeholderData: PlaceholderDataFunction = (previousData, previousQuery) => {
    if (!enabled || previousQuery?.meta?.scaffoldReadScope !== scope) {
      return undefined;
    }
    if (typeof options.placeholderData === "function") {
      return (options.placeholderData as PlaceholderDataFunction)(previousData, previousQuery);
    }
    return options.placeholderData;
  };

  const blockIdentifier: BlockNumber = readConfig.blockIdentifier ?? BlockTag.LATEST;

  const readOptions = {
    ...options,
    functionName,
    address: deployedContract?.address,
    abi: deployedContract?.abi,
    watch: false,
    args: serializedArgs as typeof args,
    enabled,
    blockIdentifier,
    placeholderData,
    meta: { ...options.meta, scaffoldReadScope: scope },
  };
  // Starknet forwards the additional TanStack options at runtime, although its
  // public type only lists a subset of them.
  const result = useReadContract(readOptions as Parameters<typeof useReadContract>[0]);
  const previousBlock = useRef(blockNumber);
  useEffect(() => {
    const blockChanged = previousBlock.current !== blockNumber;
    previousBlock.current = blockNumber;
    if (watchConfig && enabled && blockNumber !== undefined && blockChanged) {
      // Keep one query per identity so a failed refresh preserves successful data.
      // The shared block observer supplies updates; avoid a second polling loop.
      void result.refetch({ cancelRefetch: false });
    }
  }, [blockNumber, enabled, watchConfig, result.refetch]);

  return result as Omit<
    ReturnType<typeof useReadContract>,
    "data"
  > & {
    data: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined;
  };
};
