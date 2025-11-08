"use client";

import { FC, useCallback, useEffect } from "react";
import { TokenActionModal } from "../TokenActionModal";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { formatUnits } from "viem";
import type { ModalData } from "~~/contexts/ModalContext";
import type { Address } from "viem";

interface WithdrawPanelProps {
  modal: ModalData;
  onClose: () => void;
}

export const WithdrawPanel: FC<WithdrawPanelProps> = ({ modal, onClose }) => {
  if (!modal.token || !modal.protocolName || !modal.supplyBalance) return null;

  const { token, protocolName, chainId, market, supplyBalance, position } = modal;
  const { buildWithdrawFlow } = useKapanRouterV2();
  const {
    decimals,
    preferBatching,
    setPreferBatching,
    isPreferenceLoaded,
    isAnyConfirmed,
    executeTransaction,
  } = useEVMTransactionModal({
    isOpen: true,
    chainId,
    tokenAddress: token.address,
    protocolName,
    market,
  });

  if (token.decimals == null && decimals) {
    token.decimals = decimals;
  }

  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;

  useEffect(() => {
    if (isAnyConfirmed) {
      onClose();
    }
  }, [isAnyConfirmed, onClose]);

  const handleWithdraw = useCallback(
    async (amount: string, isMax?: boolean) => {
      await executeTransaction(
        () =>
          buildWithdrawFlow(
            protocolName.toLowerCase(),
            token.address,
            amount,
            token.decimals || decimals || 18,
            isMax || false,
            market
          ),
        "Withdraw transaction sent"
      );
    },
    [protocolName, token.address, token.decimals, decimals, market, buildWithdrawFlow, executeTransaction]
  );

  return (
    <TokenActionModal
      isOpen={true}
      onClose={onClose}
      action="Withdraw"
      token={token}
      protocolName={protocolName}
      apyLabel="Supply APY"
      apy={token.currentRate}
      metricLabel="Total supplied"
      before={before}
      balance={supplyBalance}
      percentBase={supplyBalance}
      max={maxInput}
      network="evm"
      position={position}
      onConfirm={handleWithdraw}
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

