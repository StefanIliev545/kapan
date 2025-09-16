"use client";

import { FC, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";
import { useVesuSwitch } from "~~/hooks/useVesuSwitch";

type BasicToken = { name: string; address: string; decimals: number; icon: string };

interface SwitchDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: bigint;
  collateral: BasicToken; // unchanged collateral
  currentDebt: BasicToken; // old debt to repay
  targetDebt: BasicToken; // new debt to borrow
  debtBalance: bigint; // amount to repay
  collateralBalance: bigint; // to withdraw/redeposit fully
}

export const SwitchDebtModalStark: FC<SwitchDebtModalProps> = ({ isOpen, onClose, poolId, collateral, currentDebt, targetDebt, debtBalance, collateralBalance }) => {
  const { address } = useStarkAccount();
  const [submitting, setSubmitting] = useState(false);
  const { loading, error, selectedQuote, swapSummary, calls } = useVesuSwitch({
    isOpen,
    type: "debt",
    address,
    currentCollateral: collateral,
    currentDebt,
    targetToken: targetDebt,
    collateralBalance,
    debtBalance,
    poolId,
  });

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const onSubmit = async () => {
    try {
      setSubmitting(true);
      await sendAsync();
      notification.success("Debt switched");
      onClose();
    } catch {
      notification.error("Failed to switch debt");
    } finally {
      setSubmitting(false);
    }
  };

  const formatUsd = (value?: number) => (value == null ? "-" : (() => { try { return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }); } catch { return `$${value.toFixed(2)}`; } })());

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        {!selectedQuote ? (
          <div className="mt-2 text-xs text-gray-500">Fetching quote...</div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-base-200/40 p-2 rounded">
                <div className="flex items-center gap-2">
                  <Image src={swapSummary?.sellToken.icon || targetDebt.icon} alt={swapSummary?.sellToken.name || targetDebt.name} width={24} height={24} className="w-6 h-6" />
                  <div>
                    <div className="text-base font-medium">
                      {formatTokenAmount((swapSummary?.sellAmount || 0n).toString(), (swapSummary?.sellToken.decimals || targetDebt.decimals))} {swapSummary?.sellToken.name || targetDebt.name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.sellAmountInUsd)}</div>
                  </div>
                </div>
                <div className="text-gray-400">→</div>
                <div className="flex items-center gap-2">
                  <Image src={swapSummary?.buyToken.icon || currentDebt.icon} alt={swapSummary?.buyToken.name || currentDebt.name} width={24} height={24} className="w-6 h-6" />
                  <div className="text-right">
                    <div className="text-base font-medium">
                      {formatTokenAmount((swapSummary?.buyAmount || 0n).toString(), (swapSummary?.buyToken.decimals || currentDebt.decimals))} {swapSummary?.buyToken.name || currentDebt.name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.buyAmountInUsd)}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">AVNU fee</span>
                  <span>
                    {formatTokenAmount(selectedQuote.avnuFees.toString(), (swapSummary?.buyToken.decimals || currentDebt.decimals))} {swapSummary?.buyToken.name || currentDebt.name}
                    <span className="text-gray-500"> · {formatUsd(selectedQuote.avnuFeesInUsd)}</span>
                  </span>
                </div>
                {selectedQuote.integratorFees > 0n && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-600">Integrator fee</span>
                    <span>
                      {formatTokenAmount(selectedQuote.integratorFees.toString(), (swapSummary?.buyToken.decimals || currentDebt.decimals))} {swapSummary?.buyToken.name || currentDebt.name}
                      <span className="text-gray-500"> · {formatUsd(selectedQuote.integratorFeesInUsd)}</span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">Network fee</span>
                  <span className="text-gray-700">{formatUsd(selectedQuote.gasFeesInUsd)}</span>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onSubmit} disabled={submitting || loading || !selectedQuote || calls.length === 0}>{submitting ? "Switching..." : "Switch Debt"}</button>
        </div>
      </div>
    </BaseModal>
  );
};

export default SwitchDebtModalStark;


