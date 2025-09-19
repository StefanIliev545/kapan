import { CallData, Contract, num } from "starknet";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useDeployedContractInfo as useStarkDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { feltToString } from "~~/utils/protocols";
import { useCallback } from "react";

export interface BaseProtocolInstruction {
  protocol_name: string;
  instructions: any[];
}

export interface LendingAuthorization {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

export const useLendingAuthorizations = () => {
  const { account } = useStarkAccount();
  const { data: routerGateway } = useStarkDeployedContractInfo("RouterGateway");

  const getAuthorizations = useCallback(async (
    baseInstructions: BaseProtocolInstruction[],
  ): Promise<LendingAuthorization[]> => {
    if (!account || !routerGateway) return [];

    const authInstruction = CallData.compile({
      instructions: baseInstructions,
      rawSelectors: false,
    });

    const contract = new Contract({
      abi: routerGateway.abi,
      address: routerGateway.address,
      providerOrAccount: account,
    });
    const protocolInstructions = await contract.call(
      "get_authorizations_for_instructions",
      authInstruction,
    );

    const authorizations: LendingAuthorization[] = [];
    if (Array.isArray(protocolInstructions)) {
      for (const instruction of protocolInstructions as any[]) {
        const contractAddressHex = num.toHexString(instruction[0]);
        const entrypointName = feltToString(instruction[1]);
        authorizations.push({
          contractAddress: contractAddressHex,
          entrypoint: entrypointName,
          calldata: (instruction[2] as bigint[]).map(value => num.toHexString(value)),
        });
      }
    }

    return authorizations;
  }, [account, routerGateway]);

  return { getAuthorizations, isReady: !!account && !!routerGateway } as const;
}; 