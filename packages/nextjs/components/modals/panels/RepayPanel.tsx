"use client";

import { FC, useCallback, useEffect } from "react";
import { TokenActionModal } from "../TokenActionModal";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { formatUnits } from "viem";
import type { ModalData } from "~~/contexts/ModalContext";

interface RepayPanelProps {
  modal: ModalData;
  onClose: () => void;
}

export const RepayPanel: FC<RepayPanelProps> = ({ modal, onClose }) => {
  const { token, protocolName, chainId, debtBalance, position } = modal;
  const { buildRepayFlowAsync } = useKapanRouterV2();
  const {
    balance: walletBalance,
    decimals,
    preferBatching,
    setPreferBatching,
    isPreferenceLoaded,
    isAnyConfirmed,
    executeTransaction,
  } = useEVMTransactionModal({
    isOpen: !!modal.token && !!modal.protocolName && !!modal.debtBalance,
    chainId,
    tokenAddress: token?.address || "",
    protocolName: protocolName || "",
  });

  useEffect(() => {
    if (isAnyConfirmed) {
      onClose();
    }
  }, [isAnyConfirmed, onClose]);

  const handleRepay = useCallback(
    async (amount: string, isMax?: boolean) => {
      if (!token || !protocolName || !debtBalance) return;
      await executeTransaction(
        async () =>
          await buildRepayFlowAsync(
            protocolName.toLowerCase(),
            token.address,
            amount,
            token.decimals || decimals || 18,
            isMax || false
          ),
        "Repay transaction sent"
      );
    },
    [protocolName, token, decimals, debtBalance, buildRepayFlowAsync, executeTransaction]
  );

  if (!token || !protocolName || !debtBalance) return null;

  if (token.decimals == null && decimals) {
    token.decimals = decimals;
  }

  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = walletBalance < bump ? walletBalance : bump;

  return (
    <TokenActionModal
      isOpen={true}
      onClose={onClose}
      action="Repay"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={before}
      balance={walletBalance}
      percentBase={debtBalance}
      max={maxInput}
      network="evm"
      position={position}
      onConfirm={handleRepay}
      renderExtraContent={() =>
        isPreferenceLoaded ? (
          <div className="pt-2 pb-1">
            <label className="label cursor-pointer gap-2 justify-start">
              <input
                type="checkbox"
                checked={preferBatching}
                onChange={(e) => setPreferBatching(e.target.checked)}
                className="checkbox checkbox-sm"
              />
              <span className="label-text text-xs">Batch Transactions with Smart Account</span>
            </label>
          </div>
        ) : null
      }
    />
  );
};

