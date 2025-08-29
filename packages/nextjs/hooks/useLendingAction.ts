import type { Network } from "./useTokenBalance";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, Contract, num, uint256 } from "starknet";
import { parseUnits } from "viem";
import { useAccount as useEvmAccount } from "wagmi";
import { useScaffoldWriteContract as useEvmWrite } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { feltToString } from "~~/utils/protocols";
import { notification } from "~~/utils/scaffold-stark";

export type Action = "Borrow" | "Deposit" | "Withdraw" | "Repay";

export const useLendingAction = (
  network: Network,
  action: Action,
  tokenAddress: string,
  protocolName: string,
  decimals?: number,
) => {
  if (network === "stark") {
    const { address, account } = useStarkAccount();
    const { data: routerGateway } = useDeployedContractInfo("RouterGateway");
    const execute = async (amount: string) => {
      if (!address || !account || !decimals || !routerGateway) return;
      try {
        const parsedAmount = parseUnits(amount, decimals);
        const basic = {
          token: tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: address,
        };
        const context = new CairoOption(CairoOptionVariant.None);
        let lendingInstruction;
        switch (action) {
          case "Deposit":
            lendingInstruction = new CairoCustomEnum({
              Deposit: { basic, context },
              Borrow: undefined,
              Repay: undefined,
              Withdraw: undefined,
            });
            break;
          case "Withdraw":
            lendingInstruction = new CairoCustomEnum({
              Deposit: undefined,
              Borrow: undefined,
              Repay: undefined,
              Withdraw: { basic, context },
            });
            break;
          case "Borrow":
            lendingInstruction = new CairoCustomEnum({
              Deposit: undefined,
              Borrow: { basic, context },
              Repay: undefined,
              Withdraw: undefined,
            });
            break;
          case "Repay":
            lendingInstruction = new CairoCustomEnum({
              Deposit: undefined,
              Borrow: undefined,
              Repay: { basic, context },
              Withdraw: undefined,
            });
            break;
        }
        const instruction = CallData.compile({
          instructions: [
            {
              protocol_name: protocolName.toLowerCase(),
              instructions: [lendingInstruction],
            },
          ],
        });
        const contract = new Contract(routerGateway.abi, routerGateway.address, account);
        const protocolInstructions = await contract.call("get_authorizations_for_instructions", [instruction]);
        const authorizations: any[] = [];
        if (Array.isArray(protocolInstructions)) {
          for (const inst of protocolInstructions as any[]) {
            const addr = num.toHexString(inst[0]);
            const entry = feltToString(inst[1]);
            authorizations.push({
              contractAddress: addr,
              entrypoint: entry,
              calldata: (inst[2] as bigint[]).map(f => num.toHexString(f)),
            });
          }
        }
        authorizations.push({
          contractAddress: routerGateway.address,
          entrypoint: "process_protocol_instructions",
          calldata: instruction,
        });
        await account.execute(authorizations);
        notification.success("Instruction sent");
      } catch (e) {
        console.error(e);
        notification.error("Failed to send instruction");
      }
    };
    return { execute };
  }

  const { address } = useEvmAccount();
  const { writeContractAsync } = useEvmWrite({ contractName: "RouterGateway" });
  const fnMap: Record<Action, string> = {
    Borrow: "borrow",
    Deposit: "supply",
    Repay: "repay",
    Withdraw: "withdraw",
  };
  const execute = async (amount: string) => {
    if (!decimals || !address) return;
    await writeContractAsync({
      functionName: fnMap[action] as any,
      args: [protocolName.toLowerCase(), tokenAddress, address, parseUnits(amount, decimals)] as any,
    });
  };
  return { execute };
};
