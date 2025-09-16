"use client";

import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { fetchBuildExecuteTransaction, fetchQuotes } from "@avnu/avnu-sdk";
import type { Quote } from "@avnu/avnu-sdk";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useLendingAuthorizations, type BaseProtocolInstruction } from "~~/hooks/useLendingAuthorizations";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";

const SLIPPAGE = 0.05;
const BUFFER_BPS = 500n; // 5%

const withBuffer = (amount: bigint, bufferBps: bigint = BUFFER_BPS) => {
  if (amount === 0n) return 0n;
  return (amount * (10_000n + bufferBps)) / 10_000n;
};

const toOutputPointer = (instructionIndex: number, outputIndex = 0): { instruction_index: bigint; output_index: bigint } => ({
  instruction_index: BigInt(instructionIndex),
  output_index: BigInt(outputIndex),
});

const toOption = (poolId: bigint, counterpartToken: string) =>
  new CairoOption<bigint[]>(CairoOptionVariant.Some, [poolId, BigInt(counterpartToken)]);

export interface TokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

interface SwitchVesuModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "collateral" | "debt";
  currentCollateral: TokenInfo;
  currentDebt: TokenInfo;
  targetToken: TokenInfo | null;
  collateralBalance: bigint;
  debtBalance: bigint;
  poolId: bigint;
}

const formatUsd = (value?: number) => {
  if (value === undefined || value === null) return "-";
  try {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

export const SwitchVesuModalStark: FC<SwitchVesuModalProps> = ({
  isOpen,
  onClose,
  type,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  poolId,
}) => {
  const { address } = useStarkAccount();
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [protocolInstructions, setProtocolInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);

  useEffect(() => {
    setSelectedQuote(null);
    setProtocolInstructions([]);
    setFetchedAuthorizations([]);
    setError(null);
  }, [isOpen, type, targetToken?.address]);

  useEffect(() => {
    if (!isOpen || !address || !targetToken) return;
    let cancelled = false;
    const fetchData = async () => {
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
        if (quotes.length === 0) {
          throw new Error("Unable to fetch AVNU quote");
        }
        const quote = quotes[0];
        if (!cancelled) setSelectedQuote(quote);

        const tx = await fetchBuildExecuteTransaction(quote.quoteId, address, SLIPPAGE, false);
        const swapCall = tx.calls?.find((call: any) =>
          ["swap_exact_token_to", "multi_route_swap", "swap_exact_in"].includes(call.entrypoint),
        );
        if (!swapCall) {
          throw new Error("Failed to extract AVNU calldata");
        }
        const calldata = (swapCall.calldata as any[]).map(value => BigInt(value.toString()));
        if (!cancelled) {
          const instructions =
            type === "collateral"
              ? buildCollateralSwitchInstructions({
                  address,
                  poolId,
                  currentCollateral,
                  currentDebt,
                  targetToken,
                  collateralBalance,
                  debtBalance,
                  quote,
                  avnuData: calldata,
                })
              : buildDebtSwitchInstructions({
                  address,
                  poolId,
                  currentCollateral,
                  currentDebt,
                  targetToken,
                  collateralBalance,
                  debtBalance,
                  quote,
                  avnuData: calldata,
                });
          setProtocolInstructions(instructions);
        }
      } catch (e: any) {
        console.error("Switch modal error", e);
        if (!cancelled) setError(e?.message ?? "Failed to prepare switch instructions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    address,
    type,
    targetToken,
    currentCollateral.address,
    currentDebt.address,
    collateralBalance,
    debtBalance,
    poolId,
    currentCollateral,
    currentDebt,
  ]);

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
      } catch (e) {
        console.error("Authorization error", e);
        if (!cancelled) setFetchedAuthorizations([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, protocolInstructions, getAuthorizations, isAuthReady]);

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

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const handleConfirm = async () => {
    try {
      await sendAsync();
      notification.success("Switch executed");
      onClose();
    } catch (e) {
      console.error(e);
      notification.error("Failed to execute switch");
    }
  };

  const actionTitle = type === "collateral" ? "Switch Collateral" : "Switch Debt";

  const swapSummary = useMemo(() => {
    if (!selectedQuote || !targetToken) return null;
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

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg" boxClassName="p-4">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">{actionTitle}</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        {!selectedQuote && !error && (
          <div className="text-xs text-gray-500">Fetching quote and preparing instructions…</div>
        )}
        {selectedQuote && swapSummary && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image
                  src={swapSummary.sellToken.icon}
                  alt={swapSummary.sellToken.name}
                  width={28}
                  height={28}
                  className="w-7 h-7"
                />
                <div>
                  <div className="text-base font-medium">
                    {formatTokenAmount(swapSummary.sellAmount.toString(), swapSummary.sellToken.decimals)}{" "}
                    {swapSummary.sellToken.name}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {formatUsd(selectedQuote.sellAmountInUsd)}
                  </div>
                </div>
              </div>
              <div className="text-gray-400">→</div>
              <div className="flex items-center gap-2">
                <Image
                  src={swapSummary.buyToken.icon}
                  alt={swapSummary.buyToken.name}
                  width={28}
                  height={28}
                  className="w-7 h-7"
                />
                <div className="text-right">
                  <div className="text-base font-medium">
                    {formatTokenAmount(swapSummary.buyAmount.toString(), swapSummary.buyToken.decimals)}{" "}
                    {swapSummary.buyToken.name}
                  </div>
                  <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.buyAmountInUsd)}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-base-200 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">AVNU fee</span>
                <span>
                  {formatTokenAmount(selectedQuote.avnuFees.toString(), swapSummary.buyToken.decimals)} {swapSummary.buyToken.name}
                  <span className="text-gray-500"> · {formatUsd(selectedQuote.avnuFeesInUsd)}</span>
                </span>
              </div>
              {selectedQuote.integratorFees > 0n && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Integrator fee</span>
                  <span>
                    {formatTokenAmount(selectedQuote.integratorFees.toString(), swapSummary.buyToken.decimals)} {swapSummary.buyToken.name}
                    <span className="text-gray-500"> · {formatUsd(selectedQuote.integratorFeesInUsd)}</span>
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Network fee</span>
                <span className="text-gray-700">{formatUsd(selectedQuote.gasFeesInUsd)}</span>
              </div>
            </div>
            <div className="bg-base-200/60 rounded-lg p-3 text-xs">
              {type === "collateral" ? (
                <p>
                  Withdraw all {currentCollateral.name} collateral, swap it to {targetToken?.name} via AVNU, redeposit and reborrow
                  the existing {currentDebt.name} debt.
                </p>
              ) : (
                <p>
                  Repay the existing {currentDebt.name} debt, borrow {targetToken?.name} against your collateral, and swap it via
                  AVNU to cover the repayment.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleConfirm}
            disabled={loading || !selectedQuote || protocolInstructions.length === 0}
          >
            {loading ? "Preparing…" : actionTitle}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

interface BuildInstructionArgs {
  address: string;
  poolId: bigint;
  currentCollateral: TokenInfo;
  currentDebt: TokenInfo;
  targetToken: TokenInfo;
  collateralBalance: bigint;
  debtBalance: bigint;
  quote: Quote;
  avnuData: bigint[];
}

const buildCollateralSwitchInstructions = ({
  address,
  poolId,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  quote,
  avnuData,
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
        basic: {
          token: currentDebt.address,
          amount: uint256.bnToUint256(debtBalance),
          user: address,
        },
        repay_all: true,
        context: toOption(poolId, currentCollateral.address),
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
      basic: {
        token: currentCollateral.address,
        amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)),
        user: address,
      },
      withdraw_all: true,
      context: toOption(poolId, currentDebt.address),
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
      context: toOption(poolId, currentDebt.address),
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
        context: toOption(poolId, targetToken.address),
      },
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
      ReswapExactIn: undefined,
    });
    vesuSecond.push(reborrowInstruction);
  }

  if (vesuFirst.length > 0) {
    instructions.push({ protocol_name: "vesu", instructions: vesuFirst });
  }
  instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });
  if (vesuSecond.length > 0) {
    instructions.push({ protocol_name: "vesu", instructions: vesuSecond });
  }

  return instructions;
};

const buildDebtSwitchInstructions = ({
  address,
  poolId,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  quote,
  avnuData,
}: BuildInstructionArgs): BaseProtocolInstruction[] => {
  const instructions: BaseProtocolInstruction[] = [];
  const vesuFirst: CairoCustomEnum[] = [];
  const vesuSecond: CairoCustomEnum[] = [];

  let currentIndex = 0;

  const repayInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: {
      basic: {
        token: currentDebt.address,
        amount: uint256.bnToUint256(debtBalance),
        user: address,
      },
      repay_all: true,
      context: toOption(poolId, currentCollateral.address),
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
      basic: {
        token: currentCollateral.address,
        amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)),
        user: address,
      },
      withdraw_all: true,
      context: toOption(poolId, currentDebt.address),
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
      context: toOption(poolId, targetToken.address),
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
      basic: {
        token: targetToken.address,
        amount: uint256.bnToUint256(borrowAmount),
        user: address,
      },
      context: toOption(poolId, currentCollateral.address),
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
      should_pay_in: false,
      context: new CairoOption(CairoOptionVariant.Some, avnuData),
    },
    ReswapExactIn: undefined,
  });
  const avnuInstructions = [reswapInstruction];

  instructions.push({ protocol_name: "vesu", instructions: vesuFirst });
  instructions.push({ protocol_name: "vesu", instructions: vesuSecond });
  instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });

  return instructions;
};

export default SwitchVesuModalStark;
