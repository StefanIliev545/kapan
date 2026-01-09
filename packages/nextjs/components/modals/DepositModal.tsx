import { FC, useCallback } from "react";
import { BatchingPreference } from "./common/BatchingPreference";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName, position, chainId, context }) => {
  const { buildDepositFlow } = useKapanRouterV2();
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId, token.decimals);
  const normalizedProtocolName = protocolName.toLowerCase();

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  const buildFlow = useCallback(
    (amount: string) =>
      buildDepositFlow(normalizedProtocolName, token.address, amount, token.decimals || decimals || 18, context),
    [
      buildDepositFlow,
      context,
      decimals,
      normalizedProtocolName,
      token.address,
      token.decimals,
    ],
  );

  const { handleConfirm: handleDeposit, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Deposit transaction sent",
    emptyFlowErrorMessage: "Failed to build deposit instructions",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  return (
    <TokenActionModal
      isOpen={isOpen}
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
      chainId={chainId}
      position={position}
      onConfirm={handleDeposit}
      renderExtraContent={() => (
        <BatchingPreference
          enabled={preferBatching}
          setEnabled={setPreferBatching}
          isLoaded={isPreferenceLoaded}
        />
      )}
    />
  );
};
