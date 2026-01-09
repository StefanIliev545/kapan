"use client";

import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { NostraTokenCard } from "./NostraTokenCard";
import { useNostraModalSubmit } from "./useNostraModalSubmit";
import { SwapQuoteSummary, type AggregatedFees } from "../common/SwapQuoteSummary";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import {
  useNostraClosePosition,
  type CloseCollateralInfo,
  type CloseTokenInfo,
} from "~~/hooks/useNostraClosePosition";
import type { CollateralToken } from "~~/components/specific/collateral/CollateralSelector";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

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

  const { submitting, handleSubmit } = useNostraModalSubmit({
    calls,
    successMessage: "Position closed",
    errorMessage: "Failed to close position",
    onSuccess: onClose,
  });

  const disabled =
    submitting ||
    loading ||
    !debt ||
    selectedCollateralInfos.length === 0 ||
    swapSummaries.length === 0 ||
    calls.length === 0;

  const aggregatedFees: AggregatedFees = useMemo(() => {
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

  // Convert swap summaries to SwapQuoteItem format
  const swapQuoteItems = useMemo(
    () =>
      swapSummaries.map(summary => ({
        sellToken: {
          name: summary.sellToken.name,
          icon: summary.sellToken.icon,
          decimals: summary.sellToken.decimals,
        },
        buyToken: {
          name: summary.buyToken.name,
          icon: debt?.icon ?? summary.buyToken.icon,
          decimals: summary.buyToken.decimals,
        },
        sellAmount: summary.sellAmount,
        buyAmount: summary.buyAmount,
      })),
    [swapSummaries, debt?.icon],
  );

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="p-4 rounded-none">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Close position with collateral</h2>
          {loading && <span className="loading loading-spinner loading-sm" />}
        </div>

        {!debt ? (
          <div className="bg-base-200/50 text-base-content/70 rounded-md p-3 text-sm">No debt position selected.</div>
        ) : (
          <>
            <div className="space-y-3">
              <NostraTokenCard
                label="Debt token"
                name={debt.name}
                icon={debt.icon}
                decimals={debt.decimals}
                balance={debtBalance}
              />

              <div className="border-base-300 rounded-md border p-3">
                <div className="text-base-content/60 mb-2 text-xs uppercase tracking-wide">Select collaterals</div>
                <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {availableCollaterals.length === 0 ? (
                    <div className="text-base-content/60 text-sm">No collateral balances found.</div>
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
                                <div className="text-base-content/60 text-xs">
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

              {swapQuoteItems.length > 0 && (
                <SwapQuoteSummary swaps={swapQuoteItems} fees={aggregatedFees} />
              )}

              {error && <div className="bg-error/10 border-error/40 text-error rounded-md border p-2 text-xs">{error}</div>}
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
