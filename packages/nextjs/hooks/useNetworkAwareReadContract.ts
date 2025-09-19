import { Abi, useReadContract } from "@starknet-react/core";
import { useScaffoldReadContract as useScaffoldReadContractEth } from "./scaffold-eth/useScaffoldReadContract";
import { useScaffoldReadContract as useScaffoldReadContractStark } from "./scaffold-stark/useScaffoldReadContract";
import { ContractName } from "~~/utils/scaffold-eth/contract";
import { ContractName as ContractNameStark } from "~~/utils/scaffold-stark/contract";
import { AbiFunctionReturnType, ContractAbi as ContractAbiEth } from "~~/utils/scaffold-eth/contract";
import { AbiFunctionOutputs, ContractAbi as ContractAbiStark, ExtractAbiFunctionNamesScaffold } from "~~/utils/scaffold-stark/contract";
import { ExtractAbiFunctionNames } from "abitype";

type NetworkType = "evm" | "starknet";

type ReadContractConfig<T extends NetworkType, TContractName extends ContractName | ContractNameStark, TFunctionName extends string> = {
  networkType: T;
  contractName: TContractName;
  functionName: TFunctionName;
  args?: any[];
  [key: string]: any;
};

const resolveStorybookMock = <T extends NetworkType, TResult>(
  params: ReadContractConfig<T, ContractName | ContractNameStark, string>,
): TResult | undefined => {
  if (typeof window === "undefined") return undefined;
  const mocks = (window as unknown as { __STORYBOOK_MOCKS?: Record<string, unknown> }).__STORYBOOK_MOCKS;
  const handler = mocks?.useNetworkAwareReadContract;
  if (typeof handler !== "function") return undefined;
  try {
    return handler(params) as TResult;
  } catch (error) {
    console.warn("Storybook mock for useNetworkAwareReadContract threw", error);
    return undefined;
  }
};

export const useNetworkAwareReadContract = <
  T extends NetworkType,
  TContractName extends ContractName | ContractNameStark,
  TFunctionName extends string
>({
  networkType,
  contractName,
  functionName,
  args,
  ...readConfig
}: ReadContractConfig<T, TContractName, TFunctionName>): Omit<ReturnType<typeof useReadContract>, "data"> & {
  data: T extends "evm" 
    ? AbiFunctionReturnType<ContractAbiEth, TFunctionName> | undefined
    : AbiFunctionOutputs<ContractAbiStark, TFunctionName> | undefined;
} => {
  const mock = resolveStorybookMock<
    T,
    Omit<ReturnType<typeof useReadContract>, "data"> & {
      data: T extends "evm"
        ? AbiFunctionReturnType<ContractAbiEth, TFunctionName> | undefined
        : AbiFunctionOutputs<ContractAbiStark, TFunctionName> | undefined;
    }
  >({
    networkType,
    contractName,
    functionName,
    args,
    ...readConfig,
  });

  if (mock) {
    return mock;
  }

  // Call EVM hook only when network type is EVM
  const evmResult = useScaffoldReadContractEth({
    contractName: contractName as ContractName,
    functionName: functionName as any,
    args: args as any,
    ...readConfig,
    query: {
      ...readConfig.query,
      enabled: networkType === "evm",
    },
  });

  // Call Starknet hook only when network type is Starknet
  const starkResult = useScaffoldReadContractStark({
    contractName: contractName as ContractNameStark,
    functionName: functionName as any,
    args: args as any,
    ...readConfig,
    enabled: networkType === "starknet",
  });

  // Return the appropriate result based on network type
  return (networkType === "evm" ? evmResult : starkResult) as Omit<ReturnType<typeof useReadContract>, "data"> & {
    data: T extends "evm" 
      ? AbiFunctionReturnType<ContractAbiEth, TFunctionName> | undefined
      : AbiFunctionOutputs<ContractAbiStark, TFunctionName> | undefined;
  };
};
