import { useEffect, useMemo, useState } from "react";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { fetchBuildExecuteTransaction, fetchQuotes, type Quote } from "@avnu/avnu-sdk";
import { useLendingAuthorizations, type BaseProtocolInstruction } from "~~/hooks/useLendingAuthorizations";

const SLIPPAGE = 0.05;
const BUFFER_BPS = 300n; // 3% buffer when borrowing new debt

const withBuffer = (amount: bigint, bufferBps: bigint = BUFFER_BPS) => {
  if (amount === 0n) return 0n;
  return (amount * (10_000n + bufferBps)) / 10_000n;
};

const toOutputPointer = (instructionIndex: number, outputIndex = 0) => ({
  instruction_index: BigInt(instructionIndex),
  output_index: BigInt(outputIndex),
});

export interface SwitchTokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

interface UseNostraDebtSwitchArgs {
  isOpen: boolean;
  address?: string;
  currentDebt: SwitchTokenInfo | null;
  targetDebt: SwitchTokenInfo | null;
  debtBalance: bigint;
}

export const useNostraDebtSwitch = ({
  isOpen,
  address,
  currentDebt,
  targetDebt,
  debtBalance,
}: UseNostraDebtSwitchArgs) => {
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [protocolInstructions, setProtocolInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);
  const [avnuCalldata, setAvnuCalldata] = useState<bigint[]>([]);

  useEffect(() => {
    setSelectedQuote(null);
    setProtocolInstructions([]);
    setFetchedAuthorizations([]);
    setAvnuCalldata([]);
    setError(null);
  }, [isOpen, currentDebt?.address, targetDebt?.address]);

  useEffect(() => {
    if (!isOpen || !address || !currentDebt || !targetDebt || debtBalance === 0n) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const repayAmount = debtBalance > 0n ? debtBalance : 1n;
        const quoteRequest = {
          sellTokenAddress: targetDebt.address,
          buyTokenAddress: currentDebt.address,
          buyAmount: repayAmount,
          takerAddress: address,
        } as const;

        const quotes = await fetchQuotes(quoteRequest as any);
        if (quotes.length === 0) throw new Error("Unable to fetch AVNU quote");

        const quote = quotes[0];
        if (!cancelled) setSelectedQuote(quote);

        const tx = await fetchBuildExecuteTransaction(quote.quoteId, address, SLIPPAGE, false);
        const swapCall = tx.calls?.find((call: any) =>
          ["swap_exact_token_to", "multi_route_swap", "swap_exact_in"].includes(call.entrypoint),
        );
        if (!swapCall) throw new Error("Failed to extract AVNU calldata");
        const calldata = (swapCall.calldata as any[]).map(value => BigInt(value.toString()));
        if (!cancelled) setAvnuCalldata(calldata);

        const repayInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: {
            basic: { token: currentDebt.address, amount: uint256.bnToUint256(repayAmount), user: address },
            repay_all: true,
            context: new CairoOption<bigint[]>(CairoOptionVariant.None),
          },
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
          Swap: undefined,
          SwapExactIn: undefined,
          Reswap: undefined,
          ReswapExactIn: undefined,
        });

        const borrowAmount = withBuffer(quote.sellAmount);
        const borrowInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: {
            basic: { token: targetDebt.address, amount: uint256.bnToUint256(borrowAmount), user: address },
            context: new CairoOption<bigint[]>(CairoOptionVariant.None),
          },
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
          Swap: undefined,
          SwapExactIn: undefined,
          Reswap: undefined,
          ReswapExactIn: undefined,
        });

        const reswapInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
          Swap: undefined,
          SwapExactIn: undefined,
          Reswap: {
            exact_out: toOutputPointer(0),
            max_in: toOutputPointer(1),
            user: address,
            should_pay_out: false,
            should_pay_in: true,
            context: new CairoOption(CairoOptionVariant.Some, calldata),
          },
          ReswapExactIn: undefined,
        });

        const instructions: BaseProtocolInstruction[] = [
          { protocol_name: "nostra", instructions: [repayInstruction, borrowInstruction] },
          { protocol_name: "avnu", instructions: [reswapInstruction] },
        ];

        if (!cancelled) setProtocolInstructions(instructions);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to prepare switch instructions");
          setProtocolInstructions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isOpen, address, currentDebt?.address, targetDebt?.address, debtBalance]);

  useEffect(() => {
    if (!isOpen || !isAuthReady || protocolInstructions.length === 0) {
      setFetchedAuthorizations([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const auths = await getAuthorizations(protocolInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch {
        if (!cancelled) setFetchedAuthorizations([]);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, protocolInstructions]);

  const calls = useMemo(() => {
    if (protocolInstructions.length === 0) return [];

    return [
      ...(fetchedAuthorizations as any),
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: CallData.compile({ instructions: protocolInstructions }),
      },
    ];
  }, [protocolInstructions, fetchedAuthorizations]);

  const swapSummary = useMemo(() => {
    if (!selectedQuote || !currentDebt || !targetDebt) return null;

    return {
      sellToken: targetDebt,
      buyToken: currentDebt,
      sellAmount: selectedQuote.sellAmount,
      buyAmount: selectedQuote.buyAmount,
    };
  }, [selectedQuote, currentDebt, targetDebt]);

  return {
    loading,
    error,
    selectedQuote,
    swapSummary,
    calls,
  };
};

export type UseNostraDebtSwitchResult = ReturnType<typeof useNostraDebtSwitch>;

