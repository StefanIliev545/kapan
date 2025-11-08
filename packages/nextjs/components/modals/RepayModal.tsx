/**
 * @deprecated This component is being phased out in favor of the unified modal system.
 * For new code, use `useOpenTransactionModal().openRepayModal()` instead.
 * This component is still used in some legacy components (BorrowPosition)
 * but should be migrated to use the unified modal context.
 * 
 * TODO: Migrate BorrowPosition to use UnifiedTransactionModal
 */
import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { PositionManager } from "~~/utils/position";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  position?: PositionManager;
  chainId?: number;
}

export const RepayModal: FC<RepayModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  position,
  chainId,
}) => {
  const { buildRepayFlowAsync } = useKapanRouterV2();
  const { balance: walletBalance, decimals, preferBatching, setPreferBatching, isPreferenceLoaded, isAnyConfirmed, executeTransaction } = useEVMTransactionModal({
    isOpen,
    chainId,
    tokenAddress: token.address,
    protocolName,
  });

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = walletBalance < bump ? walletBalance : bump;

  useEffect(() => {
    if (isAnyConfirmed && isOpen) {
      onClose();
    }
  }, [isAnyConfirmed, isOpen, onClose]);

  const handleRepay = useCallback(
    async (amount: string, isMax?: boolean) => {
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
    [protocolName, token.address, token.decimals, decimals, buildRepayFlowAsync, executeTransaction]
  );

  return (
    <TokenActionModal
      isOpen={isOpen}
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
      renderExtraContent={() => isPreferenceLoaded ? (
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
      ) : null}
    />
  );
};
