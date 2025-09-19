import { Abi, useReadContract } from "@starknet-react/core";
import { BlockNumber, BlockTag } from "starknet";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useStarkBlockNumber } from "./useBlockNumberContext";
import { replacer } from "~~/utils/scaffold-stark/common";
import { getStorybookMock, invokeStorybookMock } from "~~/utils/storybook";
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
  const storybookHandler = getStorybookMock<
    {
      contractName: ContractName;
      functionName: string;
      args: typeof args;
      readConfig: UseScaffoldReadConfig<TAbi, TContractName, TFunctionName>;
      network: "stark";
      originalResult: Omit<ReturnType<typeof useReadContract>, "data"> & {
        data: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined;
      };
    },
    Omit<ReturnType<typeof useReadContract>, "data"> & {
      data: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined;
    }
  >("useScaffoldReadContract");

  const shouldMock = Boolean(storybookHandler);

  const { data: deployedContract } = useDeployedContractInfo(contractName);
  const blockNumber = useStarkBlockNumber();

  const { watch: watchConfig, query: queryOptions, enabled: readEnabled, ...restConfig } = readConfig as any;

  const serializedArgs = args ? JSON.parse(JSON.stringify(args, replacer)) : [];

  const blockIdentifier: BlockNumber =
    watchConfig && blockNumber !== undefined
      ? (Number(blockNumber) as BlockNumber)
      : (BlockTag.LATEST);

  const { enabled: queryEnabled, ...restQueryOptions } = queryOptions || {};

  const argsDefined = !Array.isArray(args) || !args?.some(arg => arg === undefined);

  const result = useReadContract({
    functionName,
    address: deployedContract?.address,
    abi: deployedContract?.abi,
    watch: false,
    args: serializedArgs as typeof args,
    enabled: !shouldMock && argsDefined && (readEnabled ?? true),
    blockIdentifier,
    ...restConfig,
    query: {
      keepPreviousData: true,
      ...restQueryOptions,
      enabled: (queryEnabled ?? true) && !shouldMock,
    },
  }) as Omit<ReturnType<typeof useReadContract>, "data"> & {
    data: AbiFunctionOutputs<ContractAbi, TFunctionName> | undefined;
  };

  if (storybookHandler) {
    const override = invokeStorybookMock(
      "useScaffoldReadContract",
      storybookHandler,
      {
        contractName,
        functionName,
        args,
        readConfig: readConfig as UseScaffoldReadConfig<TAbi, TContractName, TFunctionName>,
        network: "stark",
        originalResult: result,
      },
    );

    if (override) {
      return override;
    }
  }

  return result;
};
