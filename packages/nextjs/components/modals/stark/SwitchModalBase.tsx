"use client";

import { FC, useEffect, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { ErrorDisplay } from "~~/components/common/ErrorDisplay";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";
import { formatUsd } from "~~/utils/formatNumber";
import { useVesuSwitch } from "~~/hooks/useVesuSwitch";
import type { VesuProtocolKey } from "~~/utils/vesu";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";

export type BasicToken = { name: string; address: string; decimals: number; icon: string };

export interface SwitchModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  poolKey: string;
  protocolKey: VesuProtocolKey;
  currentCollateral: BasicToken;
  currentDebt: BasicToken;
  targetToken: BasicToken;
  collateralBalance: bigint;
  debtBalance: bigint;
  type: "collateral" | "debt";
}

export const SwitchModalBase: FC<SwitchModalBaseProps> = ({
  isOpen,
  onClose,
  poolKey,
  protocolKey,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  type,
}) => {
  const { address } = useStarkAccount();
  const [submitting, setSubmitting] = useState(false);
  const [preparedOnce, setPreparedOnce] = useState(false);
  const { loading, error, selectedQuote, swapSummary, calls } = useVesuSwitch({
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
  });

  // Mark prepared after first successful build (avoid setState in render)
  useEffect(() => {
    if (!preparedOnce && selectedQuote && calls.length > 0) {
      setPreparedOnce(true);
    }
  }, [preparedOnce, selectedQuote, calls.length]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const typeLabel = type === "collateral" ? "Collateral" : "Debt";

  const onSubmit = async () => {
    try {
      setSubmitting(true);
      await sendAsync();
      notification.success(`${typeLabel} switched`);
      onClose();
    } catch {
      notification.error(`Failed to switch ${typeLabel.toLowerCase()}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Resolve display name/icon with fallbacks (handles tokens like xSTRK)
  const resolveDisplay = (t: BasicToken | undefined | null) => {
    if (!t) return { name: "", icon: "" };
    const raw = t.name || "";
    const name = raw && raw.trim().length > 0 ? raw : getTokenNameFallback(t.address) ?? raw;
    const icon = tokenNameToLogo((name || "").toLowerCase());
    return { name, icon };
  };

  // For collateral: sell currentCollateral -> buy targetCollateral
  // For debt: buy currentDebt (to repay) -> sell targetDebt (borrowed)
  // The display order differs: collateral shows sell->buy, debt shows buy->sell
  const isDebt = type === "debt";
  const leftToken = isDebt
    ? (swapSummary as any)?.buyToken || currentDebt
    : (swapSummary as any)?.sellToken || currentCollateral;
  const rightToken = isDebt
    ? (swapSummary as any)?.sellToken || targetToken
    : (swapSummary as any)?.buyToken || targetToken;
  const leftAmount = isDebt ? swapSummary?.buyAmount || 0n : swapSummary?.sellAmount || 0n;
  const rightAmount = isDebt ? swapSummary?.sellAmount || 0n : swapSummary?.buyAmount || 0n;
  const leftAmountUsd = isDebt ? selectedQuote?.buyAmountInUsd : selectedQuote?.sellAmountInUsd;
  const rightAmountUsd = isDebt ? selectedQuote?.sellAmountInUsd : selectedQuote?.buyAmountInUsd;
  const feeToken = isDebt
    ? (swapSummary as any)?.buyToken || currentDebt
    : (swapSummary as any)?.buyToken || targetToken;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        {error && (
          <ErrorDisplay message={error} size="sm" className="bg-error/10" />
        )}
        {!selectedQuote ? (
          <div className="mt-2 text-xs text-gray-500">Fetching quote...</div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="bg-base-200/40 flex items-center justify-between rounded p-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const d = resolveDisplay(leftToken);
                    return (
                      <Image src={d.icon} alt={d.name} width={24} height={24} className="size-6" />
                    );
                  })()}
                  <div>
                    <div className="text-base font-medium">
                      {formatTokenAmount(leftAmount.toString(), leftToken?.decimals || 18)}{" "}
                      {resolveDisplay(leftToken).name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(leftAmountUsd ?? 0)}</div>
                  </div>
                </div>
                <div className="text-gray-400">→</div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const d = resolveDisplay(rightToken);
                    return (
                      <Image src={d.icon} alt={d.name} width={24} height={24} className="size-6" />
                    );
                  })()}
                  <div className="text-right">
                    <div className="text-base font-medium">
                      {formatTokenAmount(rightAmount.toString(), rightToken?.decimals || 18)}{" "}
                      {resolveDisplay(rightToken).name}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatUsd(rightAmountUsd ?? 0)}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1 border-t border-gray-100 pt-2">
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-600">AVNU fee</span>
                  <span>
                    {formatTokenAmount(
                      selectedQuote.avnuFees.toString(),
                      feeToken?.decimals || 18
                    )}{" "}
                    {resolveDisplay(feeToken).name}
                    <span className="text-gray-500"> · {formatUsd(selectedQuote.avnuFeesInUsd)}</span>
                  </span>
                </div>
                {selectedQuote.integratorFees > 0n && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-600">Integrator fee</span>
                    <span>
                      {formatTokenAmount(
                        selectedQuote.integratorFees.toString(),
                        feeToken?.decimals || 18
                      )}{" "}
                      {resolveDisplay(feeToken).name}
                      <span className="text-gray-500">
                        {" "}
                        · {formatUsd(selectedQuote.integratorFeesInUsd)}
                      </span>
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
          <button
            className="btn btn-ghost btn-sm"
            onClick={onSubmit}
            disabled={submitting || (!preparedOnce && (loading || !selectedQuote || calls.length === 0))}
          >
            {submitting ? (
              "Switching..."
            ) : !preparedOnce && (loading || !selectedQuote || calls.length === 0) ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-xs" /> Preparing…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Switch {typeLabel}</span>
                {(loading || calls.length === 0) && (
                  <span className="loading loading-spinner loading-xs" />
                )}
              </span>
            )}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default SwitchModalBase;
