import { useEffect, useState } from "react";
import { ContractClassHashCache } from "./ContractClassHashCache";
import { useTargetNetwork } from "./useTargetNetwork";
import { useProvider } from "@starknet-react/core";
import { BlockIdentifier } from "starknet";
import { useIsMounted } from "usehooks-ts";
import { Contract, ContractCodeStatus, ContractName, contracts } from "~~/utils/scaffold-stark/contract";

export const useDeployedContractInfo = <TContractName extends ContractName>(contractName: TContractName) => {
  const isMounted = useIsMounted();
  const { targetNetwork } = useTargetNetwork();
  const deployedContract = contracts?.[targetNetwork.network]?.[
    contractName as ContractName
  ] as Contract<TContractName>;
  const [status, setStatus] = useState<ContractCodeStatus>(ContractCodeStatus.LOADING);
  const { provider: publicClient } = useProvider();

  useEffect(() => {
    const checkContractDeployment = async () => {
      if (!deployedContract) {
        setStatus(ContractCodeStatus.NOT_FOUND);
        return;
      }

      const classHashCache = ContractClassHashCache.getInstance();
      const contractClassHash = await classHashCache.getClassHash(
        publicClient,
        deployedContract.address,
        "pending" as BlockIdentifier,
      );

      if (!isMounted()) {
        return;
      }
      // If contract code is `0x` => no contract deployed on that address
      if (contractClassHash == undefined) {
        setStatus(ContractCodeStatus.NOT_FOUND);
        return;
      }
      setStatus(ContractCodeStatus.DEPLOYED);
    };

    checkContractDeployment();
  }, [isMounted, contractName, deployedContract, publicClient]);

  return {
    data: status === ContractCodeStatus.DEPLOYED ? deployedContract : undefined,
    isLoading: status === ContractCodeStatus.LOADING,
    raw: deployedContract,
    status,
  };
};
