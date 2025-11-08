"use client";

import { FC, useCallback, useEffect } from "react";
import { TokenActionModal } from "../TokenActionModal";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import type { ModalData } from "~~/contexts/ModalContext";

interface BorrowPanelProps {
  modal: ModalData;
  onClose: () => void;
}

export const BorrowPanel: FC<BorrowPanelProps> = ({ modal, onClose }) => {
  const { token, protocolName, chainId, currentDebt, position } = modal;
  const { buildBorrowFlow } = useKapanRouterV2();
  const {
    balance,
    decimals,
    preferBatching,
    setPreferBatching,
    isPreferenceLoaded,
    isAnyConfirmed,
    executeTransaction,
  } = useEVMTransactionModal({
    isOpen: !!modal.token && !!modal.protocolName,
    chainId,
    tokenAddress: token?.address || "",
    protocolName: protocolName || "",
  });

  useEffect(() => {
    if (isAnyConfirmed) {
      onClose();
    }
  }, [isAnyConfirmed, onClose]);

  const handleBorrow = useCallback(
    async (amount: string) => {
      if (!token || !protocolName) return;
      await executeTransaction(
        () => buildBorrowFlow(protocolName.toLowerCase(), token.address, amount, token.decimals || decimals || 18),
        "Borrow transaction sent"
      );
    },
    [protocolName, token, decimals, buildBorrowFlow, executeTransaction]
  );

  if (!token || !protocolName) return null;

  if (token.decimals == null && decimals) {
    token.decimals = decimals;
  }

  return (
    <TokenActionModal
      isOpen={true}
      onClose={onClose}
      action="Borrow"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={currentDebt || 0}
      balance={balance}
      network="evm"
      position={position}
      onConfirm={handleBorrow}
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

