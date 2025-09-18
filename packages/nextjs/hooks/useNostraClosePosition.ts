import { useEffect, useMemo, useState } from "react";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { fetchBuildExecuteTransaction, fetchQuotes, type Quote } from "@avnu/avnu-sdk";
import { useLendingAuthorizations, type BaseProtocolInstruction } from "~~/hooks/useLendingAuthorizations";

const SLIPPAGE = 0.05;
const BUFFER_BPS = 300n;

const withBuffer = (amount: bigint, bufferBps: bigint = BUFFER_BPS) => {
  if (amount === 0n) return 0n;
  return (amount * (10_000n + bufferBps)) / 10_000n;
};

const toOutputPointer = (instructionIndex: number, outputIndex = 0) => ({
  instruction_index: BigInt(instructionIndex),
  output_index: BigInt(outputIndex),
});

export interface CloseTokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

export interface CloseCollateralInfo extends CloseTokenInfo {
  rawBalance: bigint;
}

interface UseNostraClosePositionArgs {
  isOpen: boolean;
  address?: string;
  debt: CloseTokenInfo | null;
  collaterals: CloseCollateralInfo[];
  debtBalance: bigint;
}

type SwapPlan = {
  collateral: CloseCollateralInfo;
  repayAmount: bigint;
  quote: Quote;
  calldata: bigint[];
};

export const useNostraClosePosition = ({
  isOpen,
  address,
  debt,
  collaterals,
  debtBalance,
}: UseNostraClosePositionArgs) => {
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapPlans, setSwapPlans] = useState<SwapPlan[]>([]);
  const [protocolInstructions, setProtocolInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);
  const collateralKey = useMemo(
    () => collaterals.map(collateral => `${collateral.address}-${collateral.rawBalance}`).join("|"),
    [collaterals],
  );

  useEffect(() => {
    setSwapPlans([]);
    setProtocolInstructions([]);
    setFetchedAuthorizations([]);
    setError(null);
  }, [isOpen, debt?.address, collateralKey]);

  useEffect(() => {
    if (!isOpen || !address || !debt || debtBalance === 0n || collaterals.length === 0) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const activeCollaterals = collaterals.filter(collateral => collateral.rawBalance > 0n);
        if (activeCollaterals.length === 0) throw new Error("Selected collateral has no balance");

        const totalCollateral = activeCollaterals.reduce((sum, item) => sum + item.rawBalance, 0n);
        if (totalCollateral === 0n) throw new Error("Selected collateral has no balance");

        const plannedRepays: { collateral: CloseCollateralInfo; repayAmount: bigint }[] = [];
        let assigned = 0n;
        activeCollaterals.forEach((collateral, index) => {
          let repayAmount: bigint;
          if (index === activeCollaterals.length - 1) {
            repayAmount = debtBalance - assigned;
          } else {
            repayAmount = (debtBalance * collateral.rawBalance) / totalCollateral;
            assigned += repayAmount;
          }
          if (repayAmount < 0n) repayAmount = 0n;
          if (index === activeCollaterals.length - 1) {
            assigned += repayAmount;
          }
          plannedRepays.push({ collateral, repayAmount });
        });

        const meaningfulRepays = plannedRepays.filter(plan => plan.repayAmount > 0n);
        if (meaningfulRepays.length === 0) throw new Error("Debt amount is too small for the selected collateral");

        const planResults: SwapPlan[] = [];
        for (const [index, plan] of meaningfulRepays.entries()) {
          const repayAmount = plan.repayAmount;
          const quoteRequest = {
            sellTokenAddress: plan.collateral.address,
            buyTokenAddress: debt.address,
            buyAmount: repayAmount,
            takerAddress: address,
          } as const;

          const quotes = await fetchQuotes(quoteRequest as any);
          if (quotes.length === 0) throw new Error(`Unable to fetch AVNU quote for ${plan.collateral.name}`);
          const quote = quotes[0];

          const tx = await fetchBuildExecuteTransaction(quote.quoteId, address, SLIPPAGE, false);
          const swapCall = tx.calls?.find((call: any) =>
            ["swap_exact_token_to", "multi_route_swap", "swap_exact_in"].includes(call.entrypoint),
          );
          if (!swapCall) throw new Error("Failed to extract AVNU calldata");
          const calldata = (swapCall.calldata as any[]).map(value => BigInt(value.toString()));

          planResults.push({ collateral: plan.collateral, repayAmount, quote, calldata });
        }

        const nostraInstructions: CairoCustomEnum[] = [];
        const avnuInstructions: CairoCustomEnum[] = [];

        planResults.forEach((plan, index) => {
          const repayInstructionIndex = nostraInstructions.length;
          const repayInstruction = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: {
              basic: { token: debt.address, amount: uint256.bnToUint256(plan.repayAmount), user: address },
              repay_all: index === planResults.length - 1,
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
          nostraInstructions.push(repayInstruction);

          const withdrawInstructionIndex = nostraInstructions.length;
          const withdrawAmount = withBuffer(plan.collateral.rawBalance, 200n);
          const withdrawInstruction = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: {
              basic: {
                token: plan.collateral.address,
                amount: uint256.bnToUint256(withdrawAmount),
                user: address,
              },
              withdraw_all: true,
              context: new CairoOption<bigint[]>(CairoOptionVariant.None),
            },
            Redeposit: undefined,
            Reborrow: undefined,
            Swap: undefined,
            SwapExactIn: undefined,
            Reswap: undefined,
            ReswapExactIn: undefined,
          });
          nostraInstructions.push(withdrawInstruction);

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
              exact_out: toOutputPointer(repayInstructionIndex),
              max_in: toOutputPointer(withdrawInstructionIndex),
              user: address,
              should_pay_out: false,
              should_pay_in: true,
              context: new CairoOption(CairoOptionVariant.Some, plan.calldata),
            },
            ReswapExactIn: undefined,
          });
          avnuInstructions.push(reswapInstruction);
        });

        const instructions: BaseProtocolInstruction[] = [];
        if (nostraInstructions.length > 0) {
          instructions.push({ protocol_name: "nostra", instructions: nostraInstructions });
        }
        if (avnuInstructions.length > 0) {
          instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });
        }

        if (!cancelled) {
          setSwapPlans(planResults);
          setProtocolInstructions(instructions);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to prepare close instructions");
          setProtocolInstructions([]);
          setSwapPlans([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isOpen, address, debt?.address, collateralKey, debtBalance]);

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

  const swapSummaries = useMemo(() => {
    if (!debt || swapPlans.length === 0) return [];
    return swapPlans.map(plan => ({
      collateral: plan.collateral,
      sellToken: plan.collateral,
      buyToken: debt,
      sellAmount: plan.quote.sellAmount,
      buyAmount: plan.quote.buyAmount,
      quote: plan.quote,
    }));
  }, [swapPlans, debt]);

  return {
    loading,
    error,
    swapSummaries,
    swapPlans,
    calls,
  };
};

export type UseNostraClosePositionResult = ReturnType<typeof useNostraClosePosition>;

