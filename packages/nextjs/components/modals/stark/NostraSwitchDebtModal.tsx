"use client";

import { FC, useMemo } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { NostraTokenCard } from "./NostraTokenCard";
import { useNostraModalSubmit } from "./useNostraModalSubmit";
import { SwapFeeSummary, type SwapFees } from "../common/SwapQuoteSummary";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { formatTokenAmount } from "~~/utils/protocols";
import { useNostraDebtSwitch, type SwitchTokenInfo } from "~~/hooks/useNostraDebtSwitch";

interface NostraSwitchDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDebt: SwitchTokenInfo | null;
  targetDebt: SwitchTokenInfo | null;
  debtBalance: bigint;
}

export const NostraSwitchDebtModal: FC<NostraSwitchDebtModalProps> = ({
  isOpen,
  onClose,
  currentDebt,
  targetDebt,
  debtBalance,
}) => {
  const { address } = useStarkAccount();

  const { loading, error, selectedQuote, swapSummary, calls } = useNostraDebtSwitch({
    isOpen,
    address,
    currentDebt,
    targetDebt,
    debtBalance,
  });

  const { submitting, handleSubmit } = useNostraModalSubmit({
    calls,
    successMessage: "Debt switched",
    errorMessage: "Failed to switch debt",
    onSuccess: onClose,
  });

  const disabled =
    submitting ||
    loading ||
    !currentDebt ||
    !targetDebt ||
    !selectedQuote ||
    !swapSummary ||
    calls.length === 0;

  const sellToken = swapSummary?.sellToken;
  const buyToken = swapSummary?.buyToken;

  // Convert swap summary to format expected by SwapQuoteSummary
  // For debt switch: we borrow targetDebt (sell) to repay currentDebt (buy)
  const swapQuoteItem = useMemo(() => {
    if (!swapSummary || !targetDebt || !currentDebt) return null;
    return {
      sellToken: {
        name: sellToken?.name ?? targetDebt.name,
        icon: sellToken?.icon ?? targetDebt.icon,
        decimals: sellToken?.decimals ?? targetDebt.decimals,
      },
      buyToken: {
        name: buyToken?.name ?? currentDebt.name,
        icon: buyToken?.icon ?? currentDebt.icon,
        decimals: buyToken?.decimals ?? currentDebt.decimals,
      },
      sellAmount: swapSummary.sellAmount,
      buyAmount: swapSummary.buyAmount,
    };
  }, [swapSummary, sellToken, buyToken, targetDebt, currentDebt]);

  const swapFees: SwapFees | null = useMemo(() => {
    if (!selectedQuote) return null;
    return {
      avnuFeesInUsd: selectedQuote.avnuFeesInUsd,
      integratorFeesInUsd: selectedQuote.integratorFeesInUsd,
      gasFeesInUsd: selectedQuote.gasFeesInUsd,
    };
  }, [selectedQuote]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="p-4 rounded-none">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Switch debt token</h2>
          {loading && <span className="loading loading-spinner loading-sm" />}
        </div>

        {!currentDebt || !targetDebt ? (
          <div className="bg-base-200/50 text-base-content/70 rounded-md p-3 text-sm">
            Select a target debt asset to continue.
          </div>
        ) : (
          <div className="space-y-3">
            <NostraTokenCard
              label="Current debt"
              name={currentDebt.name}
              icon={currentDebt.icon}
              decimals={currentDebt.decimals}
              balance={debtBalance}
            />

            <NostraTokenCard
              label="Target debt"
              name={targetDebt.name}
              icon={targetDebt.icon}
              decimals={targetDebt.decimals}
              subtitle="APR adjustments handled automatically"
            />

            {swapQuoteItem && swapFees && (
              <div className="bg-base-200/60 space-y-2 rounded-md p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>You will borrow</span>
                  <span className="flex items-center gap-2 font-medium">
                    <Image
                      src={swapQuoteItem.sellToken.icon}
                      alt={swapQuoteItem.sellToken.name}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                    {formatTokenAmount(swapQuoteItem.sellAmount.toString(), swapQuoteItem.sellToken.decimals)}{" "}
                    {swapQuoteItem.sellToken.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>To repay</span>
                  <span className="flex items-center gap-2 font-medium">
                    <Image
                      src={swapQuoteItem.buyToken.icon}
                      alt={swapQuoteItem.buyToken.name}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                    {formatTokenAmount(swapQuoteItem.buyAmount.toString(), swapQuoteItem.buyToken.decimals)}{" "}
                    {swapQuoteItem.buyToken.name}
                  </span>
                </div>
                <SwapFeeSummary fees={swapFees} />
              </div>
            )}

            {error && <div className="bg-error/10 border-error/40 text-error rounded-md border p-2 text-xs">{error}</div>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={disabled}>
            {submitting ? "Switching..." : "Switch debt"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default NostraSwitchDebtModal;
