import { FC, useCallback } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
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
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId);
  const normalizedProtocolName = protocolName.toLowerCase();

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  const buildFlow = useCallback(
    (amount: string) =>
      buildBorrowFlow(normalizedProtocolName, token.address, amount, token.decimals || decimals || 18),
    [buildBorrowFlow, decimals, normalizedProtocolName, token.address, token.decimals],
  );

  const { handleConfirm: handleBorrow, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Borrow transaction sent",
    emptyFlowErrorMessage: "Failed to build borrow instructions",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

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
      chainId={chainId}
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
