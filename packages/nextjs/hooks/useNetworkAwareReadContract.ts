import { useReadContract } from "@starknet-react/core";
import { useScaffoldReadContract as useScaffoldReadContractEth } from "./scaffold-eth/useScaffoldReadContract";
import { useScaffoldReadContract as useScaffoldReadContractStark } from "./scaffold-stark/useScaffoldReadContract";
import { ContractName } from "~~/utils/scaffold-eth/contract";
import { ContractName as ContractNameStark } from "~~/utils/scaffold-stark/contract";
import { AbiFunctionReturnType, ContractAbi as ContractAbiEth } from "~~/utils/scaffold-eth/contract";
import { AbiFunctionOutputs, ContractAbi as ContractAbiStark } from "~~/utils/scaffold-stark/contract";

type NetworkType = "evm" | "starknet";

type ReadContractConfig<T extends NetworkType, TContractName extends ContractName | ContractNameStark, TFunctionName extends string> = {
  networkType: T;
  contractName: TContractName;
  functionName: TFunctionName;
  args?: unknown[];
  query?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Network-aware contract read hook that bridges EVM (scaffold-eth) and
 * Starknet (scaffold-stark) type systems.
 *
 * The two scaffold frameworks have incompatible function name unions, so this
 * bridge uses Parameters<> extraction to stay type-safe at the boundary while
 * still allowing callers to use generic string function names.
 */
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
  // Build config objects for each scaffold hook.
  // The function name union types are incompatible across scaffolds, so we
  // construct typed config objects using Parameters<> to let TS infer correctly.
  type EthConfig = Parameters<typeof useScaffoldReadContractEth>[0];
  type StarkConfig = Parameters<typeof useScaffoldReadContractStark>[0];

  const evmConfig = {
    contractName: contractName as ContractName,
    functionName,
    args,
    ...readConfig,
    query: {
      staleTime: 10_000, // 10 seconds
      ...readConfig.query,
      enabled: networkType === "evm",
    },
  } as EthConfig;

  const starkConfig = {
    contractName: contractName as ContractNameStark,
    functionName,
    args,
    ...readConfig,
    enabled: networkType === "starknet",
  } as StarkConfig;

  const evmResult = useScaffoldReadContractEth(evmConfig);
  const starkResult = useScaffoldReadContractStark(starkConfig);

  return (networkType === "evm" ? evmResult : starkResult) as Omit<ReturnType<typeof useReadContract>, "data"> & {
    data: T extends "evm"
      ? AbiFunctionReturnType<ContractAbiEth, TFunctionName> | undefined
      : AbiFunctionOutputs<ContractAbiStark, TFunctionName> | undefined;
  };
};
