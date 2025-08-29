import { parseUnits } from "viem";
import { useAccount as useEvmAccount } from "wagmi";
import { useScaffoldWriteContract as useEvmWrite } from "~~/hooks/scaffold-eth";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useScaffoldWriteContract as useStarkWrite } from "~~/hooks/scaffold-stark/useScaffoldWriteContract";
import { notification } from "~~/utils/scaffold-stark";
import type { Network } from "./useTokenBalance";

export type Action = "Borrow" | "Deposit" | "Withdraw" | "Repay";

export const useLendingAction = (
  network: Network,
  action: Action,
  tokenAddress: string,
  protocolName: string,
  decimals?: number,
) => {
  if (network === "stark") {
    const { address } = useStarkAccount();
    const { sendAsync } = useStarkWrite({
      contractName: "VesuGateway",
      functionName: "process_instructions",
      args: [[]],
    });
    const execute = async (_amount: string) => {
      try {
        await sendAsync();
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
      functionName: fnMap[action],
      args: [protocolName.toLowerCase(), tokenAddress, address, parseUnits(amount, decimals)],
    });
  };
  return { execute };
};

