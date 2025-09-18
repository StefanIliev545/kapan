"use client";

import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import {
  useNostraClosePosition,
  type CloseCollateralInfo,
  type CloseTokenInfo,
} from "~~/hooks/useNostraClosePosition";
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
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);

  const { collaterals } = useCollateral({
    protocolName: "Nostra",
    userAddress: address || "0x0",
    isOpen,
  });

  const availableCollaterals = useMemo(
    () => collaterals.filter(collateral => collateral.rawBalance > 0n),
    [collaterals],
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedAddresses([]);
      return;
    }

    setSelectedAddresses(prev =>
      prev.filter(address => availableCollaterals.some(collateral => collateral.address === address)),
    );
  }, [isOpen, availableCollaterals]);

  const selectedCollaterals = useMemo(
    () => availableCollaterals.filter(collateral => selectedAddresses.includes(collateral.address)),
    [availableCollaterals, selectedAddresses],
  );

  const selectedCollateralInfos: CloseCollateralInfo[] = useMemo(
    () =>
      selectedCollaterals.map(collateral => ({
        name: collateral.symbol,
        address: collateral.address,
        decimals: collateral.decimals,
        icon: tokenNameToLogo(collateral.symbol.toLowerCase()),
        rawBalance: collateral.rawBalance,
      })),
    [selectedCollaterals],
  );

  const { loading, error, swapSummaries, calls } = useNostraClosePosition({
    isOpen,
    address,
    debt,
    collaterals: selectedCollateralInfos,
    debtBalance,
  });

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });
  const [submitting, setSubmitting] = useState(false);

  const disabled =
    submitting ||
    loading ||
    !debt ||
    selectedCollateralInfos.length === 0 ||
    swapSummaries.length === 0 ||
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

  const aggregatedFees = useMemo(() => {
    if (swapSummaries.length === 0) {
      return { avnu: 0, integrator: 0, gas: 0 };
    }
    return swapSummaries.reduce(
      (totals, summary) => ({
        avnu: totals.avnu + Number(summary.quote.avnuFeesInUsd ?? 0),
        integrator: totals.integrator + Number(summary.quote.integratorFeesInUsd ?? 0),
        gas: totals.gas + Number(summary.quote.gasFeesInUsd ?? 0),
      }),
      { avnu: 0, integrator: 0, gas: 0 },
    );
  }, [swapSummaries]);

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
                <div className="text-xs uppercase tracking-wide text-base-content/60 mb-2">Select collaterals</div>
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {availableCollaterals.length === 0 ? (
                    <div className="text-sm text-base-content/60">No collateral balances found.</div>
                  ) : (
                    availableCollaterals.map(collateral => {
                      const isSelected = selectedAddresses.includes(collateral.address);
                      return (
                        <button
                          key={collateral.address}
                          type="button"
                          className={`w-full rounded-md border p-3 text-left transition-colors ${
                            isSelected ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary"
                          }`}
                          onClick={() =>
                            setSelectedAddresses(prev => {
                              if (prev.includes(collateral.address)) {
                                return prev.filter(address => address !== collateral.address);
                              }
                              return [...prev, collateral.address];
                            })
                          }
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
                            {isSelected ? (
                              <span className="badge badge-primary badge-sm">Selected</span>
                            ) : (
                              <span className="badge badge-ghost badge-sm">Tap to select</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {swapSummaries.length > 0 && (
                <div className="rounded-md bg-base-200/60 p-3 space-y-3 text-sm">
                  {swapSummaries.map(summary => (
                    <div key={`${summary.collateral.address}-${summary.buyAmount.toString()}`} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Swap</span>
                        <span className="font-medium flex items-center gap-2">
                          <Image
                            src={summary.sellToken.icon}
                            alt={summary.sellToken.name}
                            width={20}
                            height={20}
                            className="rounded-full"
                          />
                          {formatTokenAmount(summary.sellAmount.toString(), summary.sellToken.decimals)} {summary.sellToken.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Receive</span>
                        <span className="font-medium flex items-center gap-2">
                          <Image
                            src={debt?.icon ?? summary.buyToken.icon}
                            alt={summary.buyToken.name}
                            width={20}
                            height={20}
                            className="rounded-full"
                          />
                          {formatTokenAmount(summary.buyAmount.toString(), summary.buyToken.decimals)} {summary.buyToken.name}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="pt-2 border-t border-base-300 space-y-1 text-xs text-base-content/70">
                    <div className="flex justify-between">
                      <span>Total AVNU fees</span>
                      <span>{formatUsd(aggregatedFees.avnu)}</span>
                    </div>
                    {aggregatedFees.integrator > 0 && (
                      <div className="flex justify-between">
                        <span>Total integrator fees</span>
                        <span>{formatUsd(aggregatedFees.integrator)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Total network fees</span>
                      <span>{formatUsd(aggregatedFees.gas)}</span>
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

