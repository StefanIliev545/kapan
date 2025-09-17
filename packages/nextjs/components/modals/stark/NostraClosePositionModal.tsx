"use client";

import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import { useNostraClosePosition, type CloseTokenInfo } from "~~/hooks/useNostraClosePosition";
import type { CollateralToken } from "~~/components/specific/collateral/CollateralSelector";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

const formatUsd = (value?: number) => {
  if (value == null) return "-";
  try {
    return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

interface NostraClosePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: CloseTokenInfo | null;
  debtBalance: bigint;
}

export const NostraClosePositionModal: FC<NostraClosePositionModalProps> = ({ isOpen, onClose, debt, debtBalance }) => {
  const { address } = useStarkAccount();
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralToken | null>(null);

  const { collaterals } = useCollateral({
    protocolName: "Nostra",
    userAddress: address || "0x0",
    isOpen,
  });

  const collateralInfo: CloseTokenInfo | null = useMemo(() => {
    if (!selectedCollateral) return null;
    return {
      name: selectedCollateral.symbol,
      address: selectedCollateral.address,
      decimals: selectedCollateral.decimals,
      icon: tokenNameToLogo(selectedCollateral.symbol.toLowerCase()),
    };
  }, [selectedCollateral]);

  const { loading, error, selectedQuote, swapSummary, calls } = useNostraClosePosition({
    isOpen,
    address,
    debt,
    collateral: collateralInfo,
    debtBalance,
    collateralBalance: selectedCollateral?.rawBalance ?? 0n,
  });

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });
  const [submitting, setSubmitting] = useState(false);

  const disabled =
    submitting ||
    loading ||
    !debt ||
    !collateralInfo ||
    !selectedQuote ||
    !swapSummary ||
    calls.length === 0;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      setSubmitting(true);
      await sendAsync();
      notification.success("Position closed");
      onClose();
    } catch (e) {
      console.error(e);
      notification.error("Failed to close position");
    } finally {
      setSubmitting(false);
    }
  };

  const sellToken = swapSummary?.sellToken ?? collateralInfo;
  const buyToken = swapSummary?.buyToken ?? debt;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="p-4 rounded-none">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Close position with collateral</h2>
          {loading && <span className="loading loading-spinner loading-sm" />}
        </div>

        {!debt ? (
          <div className="rounded-md bg-base-200/50 p-3 text-sm text-base-content/70">No debt position selected.</div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="rounded-md border border-base-300 p-3">
                <div className="text-xs uppercase tracking-wide text-base-content/60 mb-2">Debt token</div>
                <div className="flex items-center gap-2">
                  <Image src={debt.icon} alt={debt.name} width={28} height={28} className="rounded-full" />
                  <div>
                    <div className="font-medium">{debt.name}</div>
                    <div className="text-xs text-base-content/60">{formatTokenAmount(debtBalance.toString(), debt.decimals)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-base-300 p-3">
                <div className="text-xs uppercase tracking-wide text-base-content/60 mb-2">Select collateral</div>
                <div className="space-y-2">
                  {collaterals.length === 0 ? (
                    <div className="text-sm text-base-content/60">No collateral balances found.</div>
                  ) : (
                    collaterals.map(collateral => {
                      const isSelected = selectedCollateral?.address === collateral.address;
                      return (
                        <button
                          key={collateral.address}
                          type="button"
                          className={`w-full rounded-md border p-3 text-left transition-colors ${
                            isSelected ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary"
                          }`}
                          onClick={() => setSelectedCollateral(collateral)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Image
                                src={tokenNameToLogo(collateral.symbol.toLowerCase())}
                                alt={collateral.symbol}
                                width={24}
                                height={24}
                                className="rounded-full"
                              />
                              <div>
                                <div className="font-medium">{collateral.symbol}</div>
                                <div className="text-xs text-base-content/60">
                                  Balance: {collateral.balance.toFixed(4)}
                                </div>
                              </div>
                            </div>
                            {isSelected && <span className="badge badge-primary badge-sm">Selected</span>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {swapSummary && selectedQuote && sellToken && buyToken && (
                <div className="rounded-md bg-base-200/60 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Swap</span>
                    <span className="font-medium flex items-center gap-2">
                      <Image src={sellToken.icon} alt={sellToken.name} width={20} height={20} className="rounded-full" />
                      {formatTokenAmount(swapSummary.sellAmount.toString(), sellToken.decimals)} {sellToken.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Receive</span>
                    <span className="font-medium flex items-center gap-2">
                      <Image src={buyToken.icon} alt={buyToken.name} width={20} height={20} className="rounded-full" />
                      {formatTokenAmount(swapSummary.buyAmount.toString(), buyToken.decimals)} {buyToken.name}
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
          </>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={disabled}>
            {submitting ? "Closing..." : "Close position"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default NostraClosePositionModal;

