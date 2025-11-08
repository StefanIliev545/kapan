"use client";

import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import type { ModalData } from "~~/contexts/ModalContext";
import type { Address } from "viem";

interface DepositPanelProps {
  modal: ModalData;
  onClose: () => void;
}

export const DepositPanel: FC<DepositPanelProps> = ({ modal, onClose }) => {
  const { token, protocolName, chainId, market, position } = modal;
  const { buildDepositFlow } = useKapanRouterV2();
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
    market,
  });

  useEffect(() => {
    if (isAnyConfirmed) {
      onClose();
    }
  }, [isAnyConfirmed, onClose]);

  const handleDeposit = useCallback(
    async (amount: string) => {
      if (!token || !protocolName) return;
      await executeTransaction(
        () => buildDepositFlow(protocolName.toLowerCase(), token.address, amount, token.decimals || decimals || 18, market),
        "Deposit transaction sent"
      );
    },
    [protocolName, token, decimals, market, buildDepositFlow, executeTransaction]
  );

  if (!token || !protocolName) return null;

  if (token.decimals == null && decimals) {
    token.decimals = decimals;
  }

  return (
    <TokenActionModal
      isOpen={true}
      onClose={onClose}
      action="Deposit"
      token={token}
      protocolName={protocolName}
      apyLabel="Supply APY"
      apy={token.currentRate}
      metricLabel="Total supplied"
      before={0}
      balance={balance}
      network="evm"
      position={position}
      onConfirm={handleDeposit}
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

