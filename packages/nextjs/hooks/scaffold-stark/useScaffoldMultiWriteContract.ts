import { useTargetNetwork } from "./useTargetNetwork";
import { useSmartTransactor } from "./useSmartTransactor";
import { Abi, useNetwork, useSendTransaction } from "@starknet-react/core";
import { Call, InvocationsDetails, Contract as StarknetJsContract } from "starknet";
import { notification } from "~~/utils/scaffold-stark";
import {
  Contract,
  ContractAbi,
  ContractName,
  ExtractAbiFunctionNamesScaffold,
  UseScaffoldArgsParam,
  UseScaffoldWriteConfig,
  contracts,
} from "~~/utils/scaffold-stark/contract";

function isRawCall(value: Call | any): value is Call {
  return "entrypoint" in value;
}

export const useScaffoldMultiWriteContract = <
  TAbi extends Abi,
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNamesScaffold<ContractAbi<TContractName>, "external">,
>({
  calls,
  options,
}: {
  calls: Array<UseScaffoldWriteConfig<TAbi, TContractName, TFunctionName> | Call>;
  options?: InvocationsDetails;
}) => {
  const { targetNetwork } = useTargetNetwork();
  const { chain } = useNetwork();
  const sendTxnWrapper = useSmartTransactor();

  // TODO add custom options

  const sendTransactionInstance = useSendTransaction({});

  const sendContractWriteTx = async () => {
    if (!chain?.id) {
      console.error("Please connect your wallet");
      return;
    }
    if (chain?.id !== targetNetwork.id) {
      console.error("You are on the wrong network");
      return;
    }

    try {
      // we just parse calldata here so that it will only parse on demand.
      // use IIFE pattern
      const parsedCalls = (() => {
        if (calls) {
          console.log("calls", calls);
          return calls.map(call => {
            if (isRawCall(call)) {
              return call;
            }
            const functionName = call.functionName;
            const contractName = call.contractName;
            const unParsedArgs = call.args as any[];
            const contract = contracts?.[targetNetwork.network]?.[
              contractName as ContractName
            ] as Contract<TContractName>;
            // we convert to starknetjs contract instance here since deployed data may be undefined if contract is not deployed
            const contractInstance = new StarknetJsContract({
              abi: contract.abi,
              address: contract.address,
            });

            console.log("unparsed args", unParsedArgs);
            return contractInstance.populate(functionName, unParsedArgs as any[]);
          });
        } else {
          return [];
        }
      })();

      // setIsMining(true);
      return await sendTxnWrapper(parsedCalls as any);
    } catch (e: any) {
      throw e;
    } finally {
      // setIsMining(false);
    }
  };

  return {
    ...sendTransactionInstance,
    sendAsync: sendContractWriteTx,
  };
};

export function createContractCall<
  TAbi extends Abi,
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNamesScaffold<ContractAbi<TContractName>, "external">,
>(
  contractName: TContractName,
  functionName: TFunctionName,
  args: UseScaffoldArgsParam<TAbi, TContractName, TFunctionName>["args"],
) {
  return { contractName, functionName, args };
}
