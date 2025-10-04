"use client";

import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import {
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CallData,
  uint256,
} from "starknet";
import { fetchBuildExecuteTransaction, fetchQuotes } from "@avnu/avnu-sdk";
import type { Quote } from "@avnu/avnu-sdk";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useLendingAuthorizations } from "~~/hooks/useLendingAuthorizations";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";

interface TokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

interface ClosePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collateral: TokenInfo;
  debt: TokenInfo;
  collateralBalance: bigint;
  debtBalance: bigint;
  poolKey: string;
  protocolKey: "vesu" | "vesu_v2";
}

const toFelt = (value: string | bigint) => (typeof value === "bigint" ? value : BigInt(value));

const toPoolContext = (poolKey: string, tokenAddress: string) =>
  new CairoOption(CairoOptionVariant.Some, [toFelt(poolKey), toFelt(tokenAddress)]);

export const ClosePositionModalStark: FC<ClosePositionModalProps> = ({
  isOpen,
  onClose,
  collateral,
  debt,
  collateralBalance,
  debtBalance,
  poolKey,
  protocolKey,
}) => {
  const { address } = useStarkAccount();
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [avnuCalldata, setAvnuCalldata] = useState<bigint[]>([]);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  useEffect(() => {
    if (!isOpen || !address) return;
    let cancelled = false;
    const fetchCalldata = async () => {
      try {
        const quoteReq = {
          sellTokenAddress: collateral.address,
          buyTokenAddress: debt.address,
          buyAmount: debtBalance > 0n ? debtBalance : 1n,
          takerAddress: address,
        } as const;
        const quotes = await fetchQuotes(quoteReq);
        if (quotes.length === 0) {
          throw new Error("no avnu quote");
        }
        if (!cancelled) setSelectedQuote(quotes[0]);
        const tx = await fetchBuildExecuteTransaction(
          quotes[0].quoteId,
          address,
          0.05,
          false,
        );
        const calldata = (tx.calls?.find((c: any) => c.entrypoint === "swap_exact_token_to")?.calldata as any[]) || [];
        if (!cancelled)
          setAvnuCalldata(calldata.map((c: any) => BigInt(c.toString())));
      } catch (e) {
        console.error("failed to fetch avnu calldata", e);
        if (!cancelled) {
          setAvnuCalldata([]);
          setSelectedQuote(null);
        }
      }
    };
    fetchCalldata();
    return () => {
      cancelled = true;
    };
  }, [isOpen, address, collateral.address, debt.address, debtBalance]);

  const protocolInstructions = useMemo(() => {
    if (!address || avnuCalldata.length === 0) return [];

    const repayContext = toPoolContext(poolKey, collateral.address);
    const withdrawContext = toPoolContext(poolKey, debt.address);

    const repayAmount = debtBalance > 0n ? debtBalance : 1n;

    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: { token: debt.address, amount: uint256.bnToUint256(repayAmount), user: address },
        repay_all: true,
        context: repayContext,
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
    });

    const withdrawInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: {
        basic: { 
          token: collateral.address, 
          amount: uint256.bnToUint256(collateralBalance + (collateralBalance / 100n)), // add 1% on top
          user: address 
        },
        withdraw_all: true,
        context: withdrawContext,
      },
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
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
        exact_out: { instruction_index: 0, output_index: 0 },
        max_in: { instruction_index: 1, output_index: 0 },
        user: address,
        should_pay_out: false,
        should_pay_in: true,
        context: new CairoOption(
          CairoOptionVariant.Some,
          avnuCalldata,
        ),
      },
    });

    return [
      { protocol_name: protocolKey, instructions: [repayInstruction, withdrawInstruction] },
      { protocol_name: "avnu", instructions: [reswapInstruction] },
    ];
  }, [
    address,
    collateral.address,
    debt.address,
    poolKey,
    collateralBalance,
    debtBalance,
    avnuCalldata,
    protocolKey,
  ]);

  // Build a minimal instruction set that includes only the Withdraw step for authorization requests
  const withdrawAuthInstructions = useMemo(() => {
    if (!address) return [] as any[];

    const withdrawContext = toPoolContext(poolKey, debt.address);
    const withdrawInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: {
        basic: {
          token: collateral.address,
          amount: uint256.bnToUint256(collateralBalance + (collateralBalance / 100n)),
          user: address,
        },
        withdraw_all: true,
        context: withdrawContext,
      },
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
    });

    return [{ protocol_name: protocolKey, instructions: [withdrawInstruction] }];
  }, [address, poolKey, debt.address, collateral.address, collateralBalance, protocolKey]);

  useEffect(() => {
    let cancelled = false;
    const fetchAuths = async () => {
      if (!isOpen || !isAuthReady) {
        setFetchedAuthorizations([]);
        return;
      }
      try {
        const auths = await getAuthorizations(withdrawAuthInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch {
        if (!cancelled) setFetchedAuthorizations([]);
      }
    };
    fetchAuths();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, withdrawAuthInstructions]);

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
  }, [fetchedAuthorizations, protocolInstructions]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const handleClosePosition = async () => {
    try {
      await sendAsync();
      notification.success("Position closed");
      onClose();
    } catch (e) {
      console.error(e);
      notification.error("Failed to close position");
    }
  };

  // const formattedCollateral = formatTokenAmount(collateralBalance.toString(), collateral.decimals);
  // const formattedDebt = formatTokenAmount(debtBalance.toString(), debt.decimals);

  const formatUsd = (value?: number) => {
    if (value === undefined || value === null) return "-";
    try {
      return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    } catch {
      return `$${value.toFixed(2)}`;
    }
  };

  const remainderInfo = useMemo(() => {
    if (!selectedQuote) return null;
    const used = selectedQuote.sellAmount;
    const remainder = collateralBalance > used ? collateralBalance - used : 0n;
    const remainderFormatted = formatTokenAmount(remainder.toString(), collateral.decimals);
    const sellUnits = parseFloat(formatTokenAmount(selectedQuote.sellAmount.toString(), collateral.decimals));
    const remainderUnits = parseFloat(remainderFormatted);
    let remainderUsd: number | undefined = undefined;
    if (sellUnits > 0) {
      remainderUsd = (selectedQuote.sellAmountInUsd || 0) * (remainderUnits / sellUnits);
    } else if (selectedQuote.sellTokenPriceInUsd !== undefined) {
      remainderUsd = remainderUnits * (selectedQuote.sellTokenPriceInUsd as number);
    }
    return { remainder, remainderFormatted, remainderUsd };
  }, [selectedQuote, collateralBalance, collateral.decimals]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        <h3 className="text-xl font-semibold mb-2">Close position with collateral</h3>
        {selectedQuote ? (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image src={collateral.icon} alt={collateral.name} width={24} height={24} className="w-6 h-6" />
                  <div>
                    <div className="text-base font-medium">
                      {formatTokenAmount(selectedQuote.sellAmount.toString(), collateral.decimals)} {collateral.name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.sellAmountInUsd)}</div>
                  </div>
                </div>
                <div className="text-gray-400">→</div>
                <div className="flex items-center gap-2">
                  <Image src={debt.icon} alt={debt.name} width={24} height={24} className="w-6 h-6" />
                  <div className="text-right">
                    <div className="text-base font-medium">
                      {formatTokenAmount(selectedQuote.buyAmount.toString(), debt.decimals)} {debt.name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.buyAmountInUsd)}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">AVNU fee</span>
                  <span>
                    {formatTokenAmount(selectedQuote.avnuFees.toString(), debt.decimals)} {debt.name}
                    <span className="text-gray-500"> · {formatUsd(selectedQuote.avnuFeesInUsd)}</span>
                  </span>
                </div>
                {selectedQuote.integratorFees > 0n && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-600">Integrator fee</span>
                    <span>
                      {formatTokenAmount(selectedQuote.integratorFees.toString(), debt.decimals)} {debt.name}
                      <span className="text-gray-500"> · {formatUsd(selectedQuote.integratorFeesInUsd)}</span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">Network fee</span>
                  <span className="text-gray-700">{formatUsd(selectedQuote.gasFeesInUsd)}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">Total fees (USD)</span>
                  <span className="text-gray-700">
                    {formatUsd(
                      (selectedQuote.avnuFeesInUsd || 0) +
                        (selectedQuote.integratorFeesInUsd || 0) +
                        (selectedQuote.gasFeesInUsd || 0),
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">Fees in {debt.name}</span>
                  <span className="text-gray-700">
                    {formatTokenAmount(
                      (selectedQuote.buyAmountWithoutFees - selectedQuote.buyAmount).toString(),
                      debt.decimals,
                    )} {debt.name}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <div className="text-[12px] text-gray-600 mb-1">Withdraw</div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Image src={collateral.icon} alt={collateral.name} width={20} height={20} className="w-5 h-5" />
                  <div>
                    <div className="text-base font-medium">{remainderInfo?.remainderFormatted} {collateral.name}</div>
                    <div className="text-[11px] text-gray-500">{formatUsd(remainderInfo?.remainderUsd)}</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={handleClosePosition}>Close Position</button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-2 text-xs text-gray-500">Fetching quote...</div>
        )}
        
      </div>
    </BaseModal>
  );
};

