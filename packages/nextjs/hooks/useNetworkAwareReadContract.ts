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

export const useNetworkAwareReadContract = <
  T extends NetworkType,
  TContractName extends ContractName | ContractNameStark,
  TFunctionName extends string
>({
  networkType,
  contractName,
  functionName,
  args,
  enabled = true,
  ...readConfig
}: ReadContractConfig<T, TContractName, TFunctionName> & { enabled?: boolean }): Omit<ReturnType<typeof useReadContract>, "data"> & {
  data: T extends "evm" 
    ? AbiFunctionReturnType<ContractAbiEth, TFunctionName> | undefined
    : AbiFunctionOutputs<ContractAbiStark, TFunctionName> | undefined;
} => {
  // Call EVM hook only when network type is EVM
  const evmResult = useScaffoldReadContractEth({
    contractName: contractName as ContractName,
    functionName: functionName as any,
    args: args as any,
    ...readConfig,
    query: {
      ...readConfig.query,
      enabled: networkType === "evm" && enabled,
    },
  });

  // Call Starknet hook only when network type is Starknet
  const starkResult = useScaffoldReadContractStark({
    contractName: contractName as ContractNameStark,
    functionName: functionName as any,
    args: args as any,
    ...readConfig,
    enabled: networkType === "starknet" && enabled,
  });

  // Return the appropriate result based on network type
  return (networkType === "evm" ? evmResult : starkResult) as Omit<ReturnType<typeof useReadContract>, "data"> & {
    data: T extends "evm" 
      ? AbiFunctionReturnType<ContractAbiEth, TFunctionName> | undefined
      : AbiFunctionOutputs<ContractAbiStark, TFunctionName> | undefined;
  };
}; 