import type { FC } from "react";
import { useCallback } from "react";
import type { PositionManager } from "~~/utils/position";
import type { TokenInfo } from "./TokenActionModal";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { BatchingPreference } from "./common/BatchingPreference";
import { TokenActionModal } from "./TokenActionModal";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  currentDebt: number;
  position?: PositionManager;
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
}

export const BorrowModal: FC<BorrowModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  currentDebt,
  position,
  chainId,
  context,
}) => {
  const { buildBorrowFlow } = useKapanRouterV2();
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId, token.decimals);
  const normalizedProtocolName = protocolName.toLowerCase();

  if (token.decimals === null || token.decimals === undefined) {
    token.decimals = decimals;
  }

  const buildFlow = useCallback(
    (amount: string) =>
      buildBorrowFlow(normalizedProtocolName, token.address, amount, token.decimals || decimals || 18, context),
    [buildBorrowFlow, context, decimals, normalizedProtocolName, token.address, token.decimals],
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

  const renderBatchingPreference = useCallback(
    () => (
      <BatchingPreference
        enabled={preferBatching}
        setEnabled={setPreferBatching}
        isLoaded={isPreferenceLoaded}
      />
    ),
    [preferBatching, setPreferBatching, isPreferenceLoaded],
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
      chainId={chainId}
      position={position}
      onConfirm={handleBorrow}
      renderExtraContent={renderBatchingPreference}
    />
  );
};
