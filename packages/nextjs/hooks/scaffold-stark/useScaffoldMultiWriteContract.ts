import { useTargetNetwork } from "./useTargetNetwork";
import { useSmartTransactor } from "./useSmartTransactor";
import type { Abi } from "@starknet-react/core";
import { useNetwork, useSendTransaction } from "@starknet-react/core";
import type { Call, InvocationsDetails } from "starknet";
import { Contract as StarknetJsContract } from "starknet";
import type {
  Contract,
  ContractAbi,
  ContractName,
  ExtractAbiFunctionNamesScaffold,
  UseScaffoldArgsParam,
  UseScaffoldWriteConfig,
} from "~~/utils/scaffold-stark/contract";
import { contracts } from "~~/utils/scaffold-stark/contract";

function isRawCall(value: Call | unknown): value is Call {
  return typeof value === "object" && value !== null && "entrypoint" in value;
}

export const useScaffoldMultiWriteContract = <
  TAbi extends Abi,
  TContractName extends ContractName,
  TFunctionName extends ExtractAbiFunctionNamesScaffold<ContractAbi<TContractName>, "external">,
>({
  calls,
  options: _options,
}: {
  calls: Array<UseScaffoldWriteConfig<TAbi, TContractName, TFunctionName> | Call>;
  options?: InvocationsDetails;
}) => {
  void _options; // TODO: add custom options support
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

    // We just parse calldata here so that it will only parse on demand.
    // Use IIFE pattern
    const parsedCalls = (() => {
      if (calls) {
        console.log("calls", calls);
        return calls.map(call => {
          if (isRawCall(call)) {
            return call;
          }
          const functionName = call.functionName;
          const contractName = call.contractName;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const unParsedArgs = call.args as any[];
          const contract = contracts?.[targetNetwork.network]?.[
            contractName as ContractName
          ] as Contract<TContractName>;
          // We convert to starknetjs contract instance here since deployed data may be undefined if contract is not deployed
          const contractInstance = new StarknetJsContract({
            abi: contract.abi,
            address: contract.address,
          });

          console.log("unparsed args", unParsedArgs);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return contractInstance.populate(functionName, unParsedArgs as any[]);
        });
      } else {
        return [];
      }
    })();

    return await sendTxnWrapper(parsedCalls as Call[]);
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
