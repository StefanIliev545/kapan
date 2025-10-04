"use client";

import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";
import { useNostraDebtSwitch, type SwitchTokenInfo } from "~~/hooks/useNostraDebtSwitch";

const formatUsd = (value?: number) => {
  if (value == null) return "-";
  try {
    return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

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
  const [submitting, setSubmitting] = useState(false);

  const { loading, error, selectedQuote, swapSummary, calls } = useNostraDebtSwitch({
    isOpen,
    address,
    currentDebt,
    targetDebt,
    debtBalance,
  });

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const disabled =
    submitting ||
    loading ||
    !currentDebt ||
    !targetDebt ||
    !selectedQuote ||
    !swapSummary ||
    calls.length === 0;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      setSubmitting(true);
      await sendAsync();
      notification.success("Debt switched");
      onClose();
    } catch (e) {
      console.error(e);
      notification.error("Failed to switch debt");
    } finally {
      setSubmitting(false);
    }
  };

  const sellToken = swapSummary?.sellToken;
  const buyToken = swapSummary?.buyToken;

  const sellAmountFormatted = useMemo(
    () =>
      swapSummary
        ? formatTokenAmount(swapSummary.sellAmount.toString(), sellToken?.decimals ?? targetDebt?.decimals ?? 18)
        : "0",
    [swapSummary, sellToken?.decimals, targetDebt?.decimals],
  );

  const buyAmountFormatted = useMemo(
    () =>
      swapSummary
        ? formatTokenAmount(swapSummary.buyAmount.toString(), buyToken?.decimals ?? currentDebt?.decimals ?? 18)
        : "0",
    [swapSummary, buyToken?.decimals, currentDebt?.decimals],
  );

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="p-4 rounded-none">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Switch debt token</h2>
          {loading && <span className="loading loading-spinner loading-sm" />}
        </div>

        {!currentDebt || !targetDebt ? (
          <div className="rounded-md bg-base-200/50 p-3 text-sm text-base-content/70">
            Select a target debt asset to continue.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-base-300 p-3">
              <div className="text-xs uppercase tracking-wide text-base-content/60 mb-2">Current debt</div>
              <div className="flex items-center gap-2">
                <Image src={currentDebt.icon} alt={currentDebt.name} width={28} height={28} className="rounded-full" />
                <div>
                  <div className="font-medium">{currentDebt.name}</div>
                  <div className="text-xs text-base-content/60">{formatTokenAmount(debtBalance.toString(), currentDebt.decimals)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-base-300 p-3">
              <div className="text-xs uppercase tracking-wide text-base-content/60 mb-2">Target debt</div>
              <div className="flex items-center gap-2">
                <Image src={targetDebt.icon} alt={targetDebt.name} width={28} height={28} className="rounded-full" />
                <div>
                  <div className="font-medium">{targetDebt.name}</div>
                  <div className="text-xs text-base-content/60">APR adjustments handled automatically</div>
                </div>
              </div>
            </div>

            {swapSummary && selectedQuote && (
              <div className="rounded-md bg-base-200/60 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>You will borrow</span>
                  <span className="font-medium flex items-center gap-2">
                    <Image src={sellToken?.icon ?? targetDebt.icon} alt={sellToken?.name ?? targetDebt.name} width={20} height={20} className="rounded-full" />
                    {sellAmountFormatted} {sellToken?.name ?? targetDebt.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>To repay</span>
                  <span className="font-medium flex items-center gap-2">
                    <Image src={buyToken?.icon ?? currentDebt.icon} alt={buyToken?.name ?? currentDebt.name} width={20} height={20} className="rounded-full" />
                    {buyAmountFormatted} {buyToken?.name ?? currentDebt.name}
                  </span>
                </div>
                <div className="pt-2 border-t border-base-300 space-y-1 text-xs text-base-content/70">
                  <div className="flex justify-between">
                    <span>AVNU fee</span>
                    <span>{formatUsd(selectedQuote.avnuFeesInUsd)}</span>
                  </div>
                  {selectedQuote.integratorFees > 0n && (
                    <div className="flex justify-between">
                      <span>Integrator fee</span>
                      <span>{formatUsd(selectedQuote.integratorFeesInUsd)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Network fee</span>
                    <span>{formatUsd(selectedQuote.gasFeesInUsd)}</span>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="rounded-md bg-error/10 border border-error/40 p-2 text-xs text-error">{error}</div>}
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

