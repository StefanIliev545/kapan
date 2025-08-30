import type { Network } from "./useTokenBalance";
import { useTokenBalance } from "./useTokenBalance";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, Contract, num, uint256 } from "starknet";
import { parseUnits } from "viem";
import { useAccount as useEvmAccount } from "wagmi";
import { useScaffoldWriteContract as useEvmWrite } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo as useEthDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo as useStarkDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { feltToString } from "~~/utils/protocols";
import { notification } from "~~/utils/scaffold-stark";

export type Action = "Borrow" | "Deposit" | "Withdraw" | "Repay";

export interface VesuContext {
  poolId: bigint;
  counterpartToken: string;
}

export const useLendingAction = (
  network: Network,
  action: Action,
  tokenAddress: string,
  protocolName: string,
  decimals?: number,
  vesuContext?: VesuContext,
  maxAmount?: bigint,
  walletBalanceParam?: bigint,
) => {
  if (network === "stark") {
    const { address, account } = useStarkAccount();
    const { balance: walletBalanceHook = 0n } = useTokenBalance(tokenAddress, "stark");
    const walletBalance = walletBalanceParam ?? walletBalanceHook;
    const { data: routerGateway } = useStarkDeployedContractInfo("RouterGateway");
    const execute = async (amount: string, isMax = false) => {
      if (!address || !account || !decimals || !routerGateway) return;
      try {
        let parsedAmount = parseUnits(amount, decimals);
        if (isMax) {
          if (action === "Repay") {
            const basis = maxAmount ?? parsedAmount;
            const bumped = (basis * 101n) / 100n;
            parsedAmount = bumped > walletBalance ? walletBalance : bumped;
          } else if (action === "Withdraw") {
            const basis = maxAmount ?? parsedAmount;
            const bumped = (basis * 101n) / 100n;
            parsedAmount = bumped;
          }
        }
        const basic = {
          token: tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: address,
        };
        let context = new CairoOption(CairoOptionVariant.None);
        if (vesuContext) {
          context = new CairoOption(CairoOptionVariant.Some, [vesuContext.poolId, vesuContext.counterpartToken]);
        }
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
              Withdraw: { basic, withdraw_all: isMax, context },
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
              Repay: { basic, repay_all: isMax, context },
              Withdraw: undefined,
            });
            break;
        }
        const baseInstruction = {
          protocol_name: protocolName.toLowerCase(),
          instructions: [lendingInstruction],
        };
        const fullInstruction = CallData.compile({ instructions: [baseInstruction] });
        const authInstruction = CallData.compile({ instructions: [baseInstruction], rawSelectors: false });
        const contract = new Contract(routerGateway.abi, routerGateway.address, account);
        const protocolInstructions = await contract.call("get_authorizations_for_instructions", authInstruction);
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
          calldata: fullInstruction,
        });
        await account.execute(authorizations);
        notification.success("Instruction sent");
      } catch (e) {
        console.error(e);
        notification.error("Failed to send instruction");
      }
    };
    return { execute, buildTx: undefined };
  }

  const { address } = useEvmAccount();
  const { balance: walletBalanceHook = 0n } = useTokenBalance(tokenAddress, "evm");
  const walletBalance = walletBalanceParam ?? walletBalanceHook;
  const { writeContractAsync } = useEvmWrite({ contractName: "RouterGateway" });
  const { data: routerGateway } = useEthDeployedContractInfo({ contractName: "RouterGateway" });
  const fnMap: Record<Action, string> = {
    Borrow: "borrow",
    Deposit: "supply",
    Repay: "repay",
    Withdraw: "withdraw",
  };
  const buildTx = (amount: string, isMax = false) => {
    if (!decimals || !address || !routerGateway) return undefined;
    let parsed = parseUnits(amount || "0", decimals);
    if (isMax) {
      if (action === "Repay") {
        const bumped = maxAmount !== undefined ? (maxAmount * 101n) / 100n : (parsed * 101n) / 100n;
        parsed = bumped > walletBalance ? walletBalance : bumped;
      } else if (action === "Withdraw" && maxAmount !== undefined) {
        parsed = (maxAmount * 101n) / 100n;
      }
    }
    return {
      address: routerGateway.address as `0x${string}`,
      abi: routerGateway.abi,
      functionName: fnMap[action],
      args: [protocolName.toLowerCase(), tokenAddress, address, parsed] as const,
    };
  };

  const execute = async (amount: string, isMax = false) => {
    const tx = buildTx(amount, isMax);
    if (!tx) return;
    await writeContractAsync(tx as any);
  };
  return { execute, buildTx };
};
