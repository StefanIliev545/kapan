"use client";

import { FC, useEffect, useMemo, useState } from "react";
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
import { useLendingAuthorizations, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";
import { buildVesuContextOption, createVesuContext, type VesuProtocolKey } from "~~/utils/vesu";
import {
  ClosePositionSummary,
  useClosePositionQuote,
  type ClosePositionToken,
  type SwapFeeBreakdown,
} from "../common";

interface ClosePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collateral: ClosePositionToken;
  debt: ClosePositionToken;
  collateralBalance: bigint;
  debtBalance: bigint;
  poolKey: string;
  protocolKey: VesuProtocolKey;
}

const toPoolContext = (protocolKey: VesuProtocolKey, poolKey: string, tokenAddress: string) =>
  buildVesuContextOption(createVesuContext(protocolKey, poolKey, tokenAddress));

/**
 * Adapt AVNU Quote to the shared ClosePositionQuote interface
 */
function adaptAvnuQuote(quote: Quote) {
  return {
    sellAmount: quote.sellAmount,
    buyAmount: quote.buyAmount,
    sellAmountInUsd: quote.sellAmountInUsd,
    buyAmountInUsd: quote.buyAmountInUsd,
    sellTokenPriceInUsd: quote.sellTokenPriceInUsd as number | undefined,
  };
}

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
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<LendingAuthorization[]>([]);
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

    const repayContext = toPoolContext(protocolKey, poolKey, collateral.address);
    const withdrawContext = toPoolContext(protocolKey, poolKey, debt.address);

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

    const withdrawContext = toPoolContext(protocolKey, poolKey, debt.address);
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
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(fetchedAuthorizations);
    return [
      ...(fetchedAuthorizations as any),
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: CallData.compile({ instructions: protocolInstructions }),
      },
      ...(revokeAuthorizations as any),
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

  // Use the shared hook for remainder calculation
  const adaptedQuote = selectedQuote ? adaptAvnuQuote(selectedQuote) : null;
  const { remainderInfo } = useClosePositionQuote({
    quote: adaptedQuote,
    collateralBalance,
    collateralDecimals: collateral.decimals,
  });

  // Build fee breakdown for the shared component
  const feeBreakdown: SwapFeeBreakdown | null = selectedQuote ? {
    aggregatorFee: selectedQuote.avnuFees,
    aggregatorFeeUsd: selectedQuote.avnuFeesInUsd,
    integratorFee: selectedQuote.integratorFees,
    integratorFeeUsd: selectedQuote.integratorFeesInUsd,
    gasFeeUsd: selectedQuote.gasFeesInUsd,
    feeToken: {
      decimals: debt.decimals,
      name: debt.name,
    },
  } : null;

  // Calculate fees in debt token for additional display
  const feesInDebtToken = selectedQuote
    ? formatTokenAmount(
        (selectedQuote.buyAmountWithoutFees - selectedQuote.buyAmount).toString(),
        debt.decimals,
      )
    : null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        <h3 className="mb-2 text-xl font-semibold">Close position with collateral</h3>
        {selectedQuote && feeBreakdown ? (
          <ClosePositionSummary
            collateral={collateral}
            debt={debt}
            sellAmount={selectedQuote.sellAmount}
            buyAmount={selectedQuote.buyAmount}
            sellAmountUsd={selectedQuote.sellAmountInUsd}
            buyAmountUsd={selectedQuote.buyAmountInUsd}
            fees={feeBreakdown}
            remainderInfo={remainderInfo}
            withdrawAction={
              <button className="btn btn-ghost btn-sm" onClick={handleClosePosition}>
                Close Position
              </button>
            }
            additionalContent={
              feesInDebtToken && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">Fees in {debt.name}</span>
                  <span className="text-gray-700">{feesInDebtToken} {debt.name}</span>
                </div>
              )
            }
          />
        ) : (
          <div className="mt-2 text-xs text-gray-500">Fetching quote...</div>
        )}
      </div>
    </BaseModal>
  );
};
