"use client";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import type { ContractName } from "~~/utils/scaffold-stark/contract";
import { Contract, type Abi } from "starknet";
import { useProvider } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { useMemo } from "react";

export const useScaffoldContract = <TContractName extends ContractName>({
  contractName,
}: {
  contractName: TContractName;
}) => {
  const { data: deployedContractData, isLoading: deployedContractLoading } =
    useDeployedContractInfo(contractName);

  const { provider: publicClient } = useProvider();
  const { account } = useAccount();

  const contract = useMemo(() => {
    if (!deployedContractData) {
      return undefined;
    }

    const contractInstance = new Contract({
      abi: deployedContractData.abi as Abi,
      address: deployedContractData.address,
      providerOrAccount: publicClient,
    });

    if (account) {
      contractInstance.connect(account);
    }

    const originalCall = contractInstance.call.bind(contractInstance);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- starknet.js call accepts any[] for dynamic args
    contractInstance.call = async (method: string, ...args: any[]) => {
      try {
        return await originalCall(method, ...args, { parseResponse: false });
      } catch {
        return originalCall(method, ...args);
      }
    };

    return contractInstance;
  }, [deployedContractData, publicClient, account]);

  return {
    data: contract,
    isLoading: deployedContractLoading,
  };
};
