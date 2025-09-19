import { useCallback } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { Abi, useNetwork } from "@starknet-react/core";
import { Contract as StarknetJsContract } from "starknet";
import { useDeployedContractInfo, useSmartTransactor } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import {
  ContractAbi,
  ContractName,
  ExtractAbiFunctionNamesScaffold,
  UseScaffoldWriteConfig,
} from "~~/utils/scaffold-stark/contract";

export const useScaffoldWriteContract = <
  TAbi extends Abi,
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNamesScaffold<ContractAbi<TContractName>, "external">,
>({
  contractName,
  functionName,
  args,
}: UseScaffoldWriteConfig<TAbi, TContractName, TFunctionName>) => {
  const { data: deployedContractData } = useDeployedContractInfo(contractName);
  const { chain } = useNetwork();
  const sendTxnWrapper = useSmartTransactor();
  const { targetNetwork } = useTargetNetwork();

  const sendContractWriteTx = useCallback(
    async (params?: { args?: UseScaffoldWriteConfig<TAbi, TContractName, TFunctionName>["args"] }) => {
      // if no args supplied, use the one supplied from hook
      let newArgs = params?.args;
      if (Object.keys(newArgs || {}).length <= 0) {
        newArgs = args;
      }

      if (!deployedContractData) {
        console.error("Target Contract is not deployed, did you forget to run `yarn deploy`?");
        return;
      }
      if (!chain?.id) {
        console.error("Please connect your wallet");
        return;
      }
      if (chain?.id !== targetNetwork.id) {
        console.error("You are on the wrong network");
        return;
      }

      // we convert to starknetjs contract instance here since deployed data may be undefined if contract is not deployed
      const contractInstance = new StarknetJsContract({
        abi: deployedContractData.abi as Abi,
        address: deployedContractData.address,
      });

      const newCalls = deployedContractData ? [contractInstance.populate(functionName, newArgs as any[])] : [];

      try {
        // setIsMining(true);
        // Route directly through smart/paymaster transactor with the prepared calls
        return await sendTxnWrapper(newCalls as any[]);
      } catch (e: any) {
        throw e;
      } finally {
        // setIsMining(false);
      }
    },
    [args, chain?.id, deployedContractData, functionName, sendTxnWrapper, targetNetwork.id],
  );

  return {
    sendAsync: sendContractWriteTx,
  };
};
