/**
 * @deprecated This component is being phased out in favor of the unified modal system.
 * For new code, use `useOpenTransactionModal().openBorrowModal()` instead.
 * This component is still used in some legacy components (BorrowPosition, TokenSelectModal)
 * but should be migrated to use the unified modal context.
 * 
 * TODO: Migrate BorrowPosition and TokenSelectModal to use UnifiedTransactionModal
 */
import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { PositionManager } from "~~/utils/position";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  currentDebt: number;
  position?: PositionManager;
  chainId?: number;
}

export const BorrowModal: FC<BorrowModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  currentDebt,
  position,
  chainId,
}) => {
  const { buildBorrowFlow } = useKapanRouterV2();
  const { balance, decimals, preferBatching, setPreferBatching, isPreferenceLoaded, isAnyConfirmed, executeTransaction } = useEVMTransactionModal({
    isOpen,
    chainId,
    tokenAddress: token.address,
    protocolName,
  });

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  useEffect(() => {
    if (isAnyConfirmed && isOpen) {
      onClose();
    }
  }, [isAnyConfirmed, isOpen, onClose]);

  const handleBorrow = useCallback(
    async (amount: string) => {
      await executeTransaction(
        () => buildBorrowFlow(protocolName.toLowerCase(), token.address, amount, token.decimals || decimals || 18),
        "Borrow transaction sent"
      );
    },
    [protocolName, token.address, token.decimals, decimals, buildBorrowFlow, executeTransaction]
  );

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Borrow"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={currentDebt}
      balance={balance}
      network="evm"
      position={position}
      onConfirm={handleBorrow}
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
