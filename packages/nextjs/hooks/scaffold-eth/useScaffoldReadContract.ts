import { useEffect } from "react";
import { QueryObserverResult, RefetchOptions } from "@tanstack/react-query";
import type { ExtractAbiFunctionNames } from "abitype";
import { ReadContractErrorType } from "viem";
import { useReadContract } from "wagmi";
import { useBlockNumberContext, useDeployedContractInfo, useSelectedNetwork } from "~~/hooks/scaffold-eth";
import { AllowedChainIds } from "~~/utils/scaffold-eth";
import { replacer } from "~~/utils/scaffold-eth/common";
import {
  AbiFunctionReturnType,
  ContractAbi,
  ContractName,
  UseScaffoldReadConfig,
} from "~~/utils/scaffold-eth/contract";

/**
 * Wrapper around wagmi's useContractRead hook which automatically loads (by name) the contract ABI and address from
 * the contracts present in deployedContracts.ts & externalContracts.ts corresponding to targetNetworks configured in scaffold.config.ts
 * @param config - The config settings, including extra wagmi configuration
 * @param config.contractName - deployed contract name
 * @param config.functionName - name of the function to be called
 * @param config.args - args to be passed to the function call
 * @param config.chainId - optional chainId that is configured with the scaffold project to make use for multi-chain interactions.
 */
export const useScaffoldReadContract = <
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNames<ContractAbi<TContractName>, "pure" | "view">,
>({
  contractName,
  functionName,
  args,
  chainId,
  ...readConfig
}: UseScaffoldReadConfig<TContractName, TFunctionName>) => {
  const selectedNetwork = useSelectedNetwork(chainId);
  const { data: deployedContract } = useDeployedContractInfo({
    contractName,
    chainId: selectedNetwork.id as AllowedChainIds,
  });

  const {
    query: queryOptions,
    watch,
    blockNumber: blockNumberConfig,
    blockTag,
    ...restConfig
  } = readConfig as Record<string, unknown>;
  const defaultWatch = watch ?? false;

  const sanitizedBlockNumber =
    typeof blockNumberConfig === "bigint" ? Number(blockNumberConfig) : blockNumberConfig;
  const sanitizedBlockTag =
    typeof blockTag === "bigint" ? blockTag.toString() : blockTag;

  const serializedArgs = args ? JSON.parse(JSON.stringify(args, replacer)) : undefined;

  const readContractHookRes = useReadContract({
    chainId: selectedNetwork.id,
    functionName,
    address: deployedContract?.address,
    abi: deployedContract?.abi,
    args: serializedArgs as typeof args,
    blockNumber: sanitizedBlockNumber,
    blockTag: sanitizedBlockTag,
    ...restConfig,
    query: {
      enabled: !Array.isArray(args) || !args.some(arg => arg === undefined),
      ...(queryOptions as any),
    },
  } as any) as Omit<ReturnType<typeof useReadContract>, "data" | "refetch"> & {
    data: AbiFunctionReturnType<ContractAbi, TFunctionName> | undefined;
    refetch: (
      options?: RefetchOptions | undefined,
    ) => Promise<QueryObserverResult<AbiFunctionReturnType<ContractAbi, TFunctionName>, ReadContractErrorType>>;
  };

  const blockNumber = useBlockNumberContext();

  useEffect(() => {
    if (defaultWatch && blockNumber !== undefined) {
      readContractHookRes.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, defaultWatch]);

  return readContractHookRes;
};
