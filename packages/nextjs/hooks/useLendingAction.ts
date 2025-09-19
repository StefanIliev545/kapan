import type { Network } from "./useTokenBalance";
import { useTokenBalance } from "./useTokenBalance";
import {
  Abi,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CallData,
  Contract,
  num,
  uint256,
  Call,
} from "starknet";
import { parseUnits } from "viem";
import { useAccount as useEvmAccount } from "wagmi";
import { useScaffoldWriteContract as useEvmWrite } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo as useEthDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo as useStarkDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useSmartTransactor } from "~~/hooks/scaffold-stark";
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
  // Call all hooks unconditionally to satisfy React Rules of Hooks
  // Starknet hooks
  const { address: starkAddress, account: starkAccount } = useStarkAccount();
  const sendTxn = useSmartTransactor();
  const { balance: starkWalletBalanceHook = 0n } = useTokenBalance(tokenAddress, "stark");
  const { data: starkRouterGateway } = useStarkDeployedContractInfo("RouterGateway");
  const starkWalletBalance = walletBalanceParam ?? starkWalletBalanceHook;

  // EVM hooks
  const { address: evmAddress } = useEvmAccount();
  const { balance: evmWalletBalanceHook = 0n } = useTokenBalance(tokenAddress, "evm");
  const { writeContractAsync } = useEvmWrite({ contractName: "RouterGateway" });
  const { data: evmRouterGateway } = useEthDeployedContractInfo({ contractName: "RouterGateway" });
  const evmWalletBalance = walletBalanceParam ?? evmWalletBalanceHook;

  // Build Starknet calls
  const buildStarkCalls = async (amount: string, isMax = false): Promise<Call[] | null> => {
    if (!starkAddress || !starkAccount || !decimals || !starkRouterGateway) return null;
    try {
      let parsedAmount = parseUnits(amount, decimals);
      if (isMax) {
        if (action === "Repay") {
          const basis = maxAmount ?? parsedAmount;
          const bumped = (basis * 101n) / 100n;
          parsedAmount = bumped > starkWalletBalance ? starkWalletBalance : bumped;
        } else if (action === "Withdraw") {
          const basis = maxAmount ?? parsedAmount;
          const bumped = (basis * 101n) / 100n;
          parsedAmount = bumped;
        }
      }
      const basic = {
        token: tokenAddress,
        amount: uint256.bnToUint256(parsedAmount),
        user: starkAddress,
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
      const contract = new Contract({
        abi: starkRouterGateway.abi as Abi,
        address: starkRouterGateway.address,
        providerOrAccount: starkAccount,
      });
      const protocolInstructions = await contract.call(
        "get_authorizations_for_instructions",
        authInstruction,
      );
      const authorizations: Call[] = [];
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
        contractAddress: starkRouterGateway.address,
        entrypoint: "process_protocol_instructions",
        calldata: fullInstruction,
      });
      return authorizations;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const executeStark = async (amount: string, isMax = false) => {
    if (!starkAccount) return;
    try {
      const calls = await buildStarkCalls(amount, isMax);
      if (!calls) return;
      await sendTxn(calls);
      notification.success("Instruction sent");
    } catch (e) {
      console.error(e);
      notification.error("Failed to send instruction");
    }
  };

  // EVM tx build/execute
  const fnMap: Record<Action, string> = {
    Borrow: "borrow",
    Deposit: "supply",
    Repay: "repay",
    Withdraw: "withdraw",
  };

  const buildEvmTx = (amount: string, isMax = false) => {
    if (!decimals || !evmAddress || !evmRouterGateway) return undefined;
    let parsed = parseUnits(amount || "0", decimals);
    if (isMax) {
      if (action === "Repay") {
        const bumped = maxAmount !== undefined ? (maxAmount * 101n) / 100n : (parsed * 101n) / 100n;
        parsed = bumped > evmWalletBalance ? evmWalletBalance : bumped;
      } else if (action === "Withdraw" && maxAmount !== undefined) {
        parsed = (maxAmount * 101n) / 100n;
      }
    }
    return {
      address: evmRouterGateway.address as `0x${string}`,
      abi: evmRouterGateway.abi,
      functionName: fnMap[action],
      args: [protocolName.toLowerCase(), tokenAddress, evmAddress, parsed] as const,
    };
  };

  const executeEvm = async (amount: string, isMax = false) => {
    const tx = buildEvmTx(amount, isMax);
    if (!tx) return;
    await writeContractAsync(tx as any);
  };

  // Select by network
  if (network === "stark") {
    return { execute: executeStark, buildTx: undefined, buildCalls: buildStarkCalls };
  }

  return { execute: executeEvm, buildTx: buildEvmTx };
};
