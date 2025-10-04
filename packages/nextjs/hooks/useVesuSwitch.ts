import { useEffect, useMemo, useState } from "react";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { fetchBuildExecuteTransaction, fetchQuotes } from "@avnu/avnu-sdk";
import type { Quote } from "@avnu/avnu-sdk";
import { useLendingAuthorizations, type BaseProtocolInstruction } from "~~/hooks/useLendingAuthorizations";
import { buildVesuContextOption, createVesuContext, type VesuProtocolKey } from "~~/utils/vesu";

const SLIPPAGE = 0.05;
const BUFFER_BPS = 500n; // 5%

const withBuffer = (amount: bigint, bufferBps: bigint = BUFFER_BPS) => {
  if (amount === 0n) return 0n;
  return (amount * (10_000n + bufferBps)) / 10_000n;
};

const toOutputPointer = (
  instructionIndex: number,
  outputIndex = 0,
): { instruction_index: bigint; output_index: bigint } => ({
  instruction_index: BigInt(instructionIndex),
  output_index: BigInt(outputIndex),
});

const toContextOption = (protocolKey: VesuProtocolKey, poolKey: string, counterpartToken: string) =>
  buildVesuContextOption(createVesuContext(protocolKey, poolKey, counterpartToken));

export interface TokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

type SwitchType = "collateral" | "debt";

interface UseVesuSwitchArgs {
  isOpen: boolean;
  type: SwitchType;
  address?: string;
  currentCollateral: TokenInfo;
  currentDebt: TokenInfo;
  targetToken: TokenInfo | null;
  collateralBalance: bigint;
  debtBalance: bigint;
  poolKey: string;
  protocolKey: VesuProtocolKey;
}

export const useVesuSwitch = ({
  isOpen,
  type,
  address,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  poolKey,
  protocolKey,
}: UseVesuSwitchArgs) => {
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [protocolInstructions, setProtocolInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [authInstructions, setAuthInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);

  useEffect(() => {
    setSelectedQuote(null);
    setProtocolInstructions([]);
    setFetchedAuthorizations([]);
    setAuthInstructions([]);
    setError(null);
  }, [isOpen, type, targetToken?.address]);

  // Fetch quote and avnu calldata
  useEffect(() => {
    if (!isOpen || !address || !targetToken) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const repayAmount = debtBalance > 0n ? debtBalance : 1n;
        const withdrawAmount = collateralBalance > 0n ? collateralBalance : 1n;
        const quoteRequest =
          type === "collateral"
            ? {
                sellTokenAddress: currentCollateral.address,
                buyTokenAddress: targetToken.address,
                sellAmount: withdrawAmount,
                takerAddress: address,
              }
            : {
                sellTokenAddress: targetToken.address,
                buyTokenAddress: currentDebt.address,
                buyAmount: repayAmount,
                takerAddress: address,
              };
        const quotes = await fetchQuotes(quoteRequest as any);
        if (quotes.length === 0) throw new Error("Unable to fetch AVNU quote");
        const quote = quotes[0];
        if (!cancelled) setSelectedQuote(quote);

        const tx = await fetchBuildExecuteTransaction(quote.quoteId, address, SLIPPAGE, false);
        const swapCall = tx.calls?.find((call: any) =>
          ["swap_exact_token_to", "multi_route_swap", "swap_exact_in"].includes(call.entrypoint),
        );
        if (!swapCall) throw new Error("Failed to extract AVNU calldata");
        const calldata = (swapCall.calldata as any[]).map(v => BigInt(v.toString()));

        const instructions =
          type === "collateral"
            ? buildCollateralSwitchInstructions({
                address,
                poolKey,
                currentCollateral,
                currentDebt,
                targetToken: targetToken,
                collateralBalance,
                debtBalance,
                quote,
                avnuData: calldata,
                protocolKey,
              })
            : buildDebtSwitchInstructions({
                address,
                poolKey,
                currentCollateral,
                currentDebt,
                targetToken: targetToken,
                collateralBalance,
                debtBalance,
                quote,
                avnuData: calldata,
                protocolKey,
              });
        if (!cancelled) {
          setProtocolInstructions(instructions);

          // Build minimal authorization instruction set
          if (type === "collateral") {
            // Only authorize Withdraw for collateral switch
            const withdrawOnly = new CairoCustomEnum({
              Deposit: undefined,
              Borrow: undefined,
              Repay: undefined,
              Withdraw: {
                basic: {
                  token: currentCollateral.address,
                  amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)),
                  user: address,
                },
                withdraw_all: true,
                context: toContextOption(protocolKey, poolKey, currentDebt.address),
              },
              Redeposit: undefined,
              Reborrow: undefined,
              Swap: undefined,
              SwapExactIn: undefined,
              Reswap: undefined,
              ReswapExactIn: undefined,
            });
            setAuthInstructions([{ protocol_name: protocolKey, instructions: [withdrawOnly] }]);
          } else {
            // Authorize Withdraw + Borrow for debt switch
            const withdrawOnly = new CairoCustomEnum({
              Deposit: undefined,
              Borrow: undefined,
              Repay: undefined,
              Withdraw: {
                basic: {
                  token: currentCollateral.address,
                  amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)),
                  user: address,
                },
                withdraw_all: true,
                context: toContextOption(protocolKey, poolKey, currentDebt.address),
              },
              Redeposit: undefined,
              Reborrow: undefined,
              Swap: undefined,
              SwapExactIn: undefined,
              Reswap: undefined,
              ReswapExactIn: undefined,
            });
            const borrowAmount = withBuffer(quote.sellAmount, BUFFER_BPS);
            const borrowOnly = new CairoCustomEnum({
              Deposit: undefined,
              Borrow: {
                basic: { token: targetToken.address, amount: uint256.bnToUint256(borrowAmount), user: address },
                context: toContextOption(protocolKey, poolKey, currentCollateral.address),
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
            setAuthInstructions([{ protocol_name: protocolKey, instructions: [withdrawOnly, borrowOnly] }]);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to prepare switch instructions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    address,
    type,
    targetToken,
    currentCollateral,
    currentDebt,
    collateralBalance,
    debtBalance,
    poolKey,
    protocolKey,
  ]);

  // Fetch authorizations only for authInstructions
  useEffect(() => {
    if (!isOpen || !isAuthReady || authInstructions.length === 0) {
      setFetchedAuthorizations([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const auths = await getAuthorizations(authInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch {
        if (!cancelled) setFetchedAuthorizations([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, authInstructions]);

  // Build final calls (auths + move_debt)
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
    if (!selectedQuote || !targetToken) return null as
      | null
      | {
          sellToken: TokenInfo;
          buyToken: TokenInfo;
          sellAmount: bigint;
          buyAmount: bigint;
        };
    if (type === "collateral") {
      return {
        sellToken: currentCollateral,
        buyToken: targetToken,
        sellAmount: selectedQuote.sellAmount,
        buyAmount: selectedQuote.buyAmount,
      };
    }
    return {
      sellToken: targetToken,
      buyToken: currentDebt,
      sellAmount: selectedQuote.sellAmount,
      buyAmount: selectedQuote.buyAmount,
    };
  }, [selectedQuote, type, currentCollateral, targetToken, currentDebt]);

  return {
    loading,
    error,
    selectedQuote,
    swapSummary,
    authInstructions,
    protocolInstructions,
    fetchedAuthorizations,
    calls,
  } as const;
};

interface BuildInstructionArgs {
  address: string;
  poolKey: string;
  currentCollateral: TokenInfo;
  currentDebt: TokenInfo;
  targetToken: TokenInfo;
  collateralBalance: bigint;
  debtBalance: bigint;
  quote: Quote;
  avnuData: bigint[];
  protocolKey: VesuProtocolKey;
}

const buildCollateralSwitchInstructions = ({
  address,
  poolKey,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  quote,
  avnuData,
  protocolKey,
}: BuildInstructionArgs): BaseProtocolInstruction[] => {
  const instructions: BaseProtocolInstruction[] = [];
  const vesuFirst: CairoCustomEnum[] = [];
  const vesuSecond: CairoCustomEnum[] = [];

  let currentIndex = 0;
  let repayIndex: number | null = null;
  const reswapIndex: number = debtBalance > 0n ? 2 : 1;

  if (debtBalance > 0n) {
    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: { token: currentDebt.address, amount: uint256.bnToUint256(debtBalance), user: address },
        repay_all: true,
        context: toContextOption(protocolKey, poolKey, currentCollateral.address),
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
      ReswapExactIn: undefined,
    });
    vesuFirst.push(repayInstruction);
    repayIndex = currentIndex;
    currentIndex += 1;
  }

  const withdrawInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: {
      basic: { token: currentCollateral.address, amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)), user: address },
      withdraw_all: true,
      context: toContextOption(protocolKey, poolKey, currentDebt.address),
    },
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuFirst.push(withdrawInstruction);
  const withdrawIndex = currentIndex;
  currentIndex += 1;

  const minOut = quote.buyAmount - (quote.buyAmount * BigInt(Math.floor(SLIPPAGE * 10_000))) / 10_000n;
  const reswapExactIn = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: {
      exact_in: toOutputPointer(withdrawIndex),
      min_out: uint256.bnToUint256(minOut > 0n ? minOut : quote.buyAmount),
      token_out: targetToken.address,
      user: address,
      should_pay_out: false,
      should_pay_in: false,
      context: new CairoOption(CairoOptionVariant.Some, avnuData),
    },
  });
  const avnuInstructions = [reswapExactIn];

  const redepositInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: {
      token: targetToken.address,
      target_output_pointer: toOutputPointer(reswapIndex, 1),
      user: address,
      context: toContextOption(protocolKey, poolKey, currentDebt.address),
    },
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuSecond.push(redepositInstruction);
  currentIndex += 1;

  if (debtBalance > 0n) {
    const approvalAmount = withBuffer(debtBalance, BUFFER_BPS);
    const reborrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: {
        token: currentDebt.address,
        target_output_pointer: toOutputPointer(repayIndex ?? 0),
        approval_amount: uint256.bnToUint256(approvalAmount),
        user: address,
        context: toContextOption(protocolKey, poolKey, targetToken.address),
      },
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
      ReswapExactIn: undefined,
    });
    vesuSecond.push(reborrowInstruction);
  }

  if (vesuFirst.length > 0) instructions.push({ protocol_name: protocolKey, instructions: vesuFirst });
  instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });
  if (vesuSecond.length > 0) instructions.push({ protocol_name: protocolKey, instructions: vesuSecond });

  return instructions;
};

const buildDebtSwitchInstructions = ({
  address,
  poolKey,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  quote,
  avnuData,
  protocolKey,
}: BuildInstructionArgs): BaseProtocolInstruction[] => {
  const instructions: BaseProtocolInstruction[] = [];
  const vesuFirst: CairoCustomEnum[] = [];
  const vesuSecond: CairoCustomEnum[] = [];

  let currentIndex = 0;

  const repayInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: {
      basic: { token: currentDebt.address, amount: uint256.bnToUint256(debtBalance), user: address },
      repay_all: true,
      context: toContextOption(protocolKey, poolKey, currentCollateral.address),
    },
    Withdraw: undefined,
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuFirst.push(repayInstruction);
  const repayIndex = currentIndex;
  currentIndex += 1;

  const withdrawInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: {
      basic: { token: currentCollateral.address, amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)), user: address },
      withdraw_all: true,
      context: toContextOption(protocolKey, poolKey, currentDebt.address),
    },
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuFirst.push(withdrawInstruction);
  const withdrawIndex = currentIndex;
  currentIndex += 1;

  const redepositInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: {
      token: currentCollateral.address,
      target_output_pointer: toOutputPointer(withdrawIndex),
      user: address,
      context: toContextOption(protocolKey, poolKey, targetToken.address),
    },
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuSecond.push(redepositInstruction);
  currentIndex += 1;

  const borrowAmount = withBuffer(quote.sellAmount, BUFFER_BPS);
  const borrowInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: {
      basic: { token: targetToken.address, amount: uint256.bnToUint256(borrowAmount), user: address },
      context: toContextOption(protocolKey, poolKey, currentCollateral.address),
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
  vesuSecond.push(borrowInstruction);
  const borrowIndex = currentIndex;
  currentIndex += 1;

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
      exact_out: toOutputPointer(repayIndex),
      max_in: toOutputPointer(borrowIndex),
      user: address,
      should_pay_out: false,
      should_pay_in: true,
      context: new CairoOption(CairoOptionVariant.Some, avnuData),
    },
    ReswapExactIn: undefined,
  });
  const avnuInstructions = [reswapInstruction];

  instructions.push({ protocol_name: protocolKey, instructions: vesuFirst });
  instructions.push({ protocol_name: protocolKey, instructions: vesuSecond });
  instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });

  return instructions;
};


