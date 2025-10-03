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

interface SwitchCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: bigint;
  currentCollateral: BasicToken; // withdraw this
  targetCollateral: BasicToken; // deposit this
  debtToken: BasicToken; // debt context remains the same
  collateralBalance: bigint;
  debtBalance: bigint;
}

export const SwitchCollateralModalStark: FC<SwitchCollateralModalProps> = ({ isOpen, onClose, poolId, currentCollateral, targetCollateral, debtToken, collateralBalance, debtBalance }) => {
  const { address } = useStarkAccount();
  const [submitting, setSubmitting] = useState(false);
  const { loading, error, selectedQuote, swapSummary, calls } = useVesuSwitch({
    isOpen,
    type: "collateral",
    address,
    currentCollateral,
    currentDebt: debtToken,
    targetToken: targetCollateral,
    collateralBalance,
    debtBalance,
    poolId,
  });

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const onSubmit = async () => {
    try {
      setSubmitting(true);
      await sendAsync();
      notification.success("Collateral switched");
      onClose();
    } catch {
      notification.error("Failed to switch collateral");
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
                  <Image src={swapSummary?.sellToken.icon || currentCollateral.icon} alt={swapSummary?.sellToken.name || currentCollateral.name} width={24} height={24} className="w-6 h-6" />
                  <div>
                    <div className="text-base font-medium">
                      {formatTokenAmount((swapSummary?.sellAmount || 0n).toString(), (swapSummary?.sellToken.decimals || currentCollateral.decimals))} {swapSummary?.sellToken.name || currentCollateral.name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.sellAmountInUsd)}</div>
                  </div>
                </div>
                <div className="text-gray-400">→</div>
                <div className="flex items-center gap-2">
                  <Image src={swapSummary?.buyToken.icon || targetCollateral.icon} alt={swapSummary?.buyToken.name || targetCollateral.name} width={24} height={24} className="w-6 h-6" />
                  <div className="text-right">
                    <div className="text-base font-medium">
                      {formatTokenAmount((swapSummary?.buyAmount || 0n).toString(), (swapSummary?.buyToken.decimals || targetCollateral.decimals))} {swapSummary?.buyToken.name || targetCollateral.name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(selectedQuote.buyAmountInUsd)}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">AVNU fee</span>
                  <span>
                    {formatTokenAmount(selectedQuote.avnuFees.toString(), (swapSummary?.buyToken.decimals || targetCollateral.decimals))} {swapSummary?.buyToken.name || targetCollateral.name}
                    <span className="text-gray-500"> · {formatUsd(selectedQuote.avnuFeesInUsd)}</span>
                  </span>
                </div>
                {selectedQuote.integratorFees > 0n && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-600">Integrator fee</span>
                    <span>
                      {formatTokenAmount(selectedQuote.integratorFees.toString(), (swapSummary?.buyToken.decimals || targetCollateral.decimals))} {swapSummary?.buyToken.name || targetCollateral.name}
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
        <div className="mt-4 flex justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onSubmit} disabled={submitting || loading || !selectedQuote || calls.length === 0}>{submitting ? "Switching..." : "Switch Collateral"}</button>
        </div>
      </div>
    </BaseModal>
  );
};

export default SwitchCollateralModalStark;


