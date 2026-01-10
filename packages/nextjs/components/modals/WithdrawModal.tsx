import { FC, useCallback } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { BatchingPreference } from "./common/BatchingPreference";
import { useWithdrawModalConfig } from "./common/useWithdrawModalConfig";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { PositionManager } from "~~/utils/position";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  position?: PositionManager;
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
}

export const WithdrawModal: FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  position,
  chainId,
  context,
}) => {
  const { buildWithdrawFlow } = useKapanRouterV2();
  const decimals = token.decimals;
  const normalizedProtocolName = protocolName.toLowerCase();

  const buildFlow = useCallback(
    (amount: string, isMax?: boolean) =>
      buildWithdrawFlow(
        normalizedProtocolName,
        token.address,
        amount,
        token.decimals || decimals || 18,
        isMax || false,
        context,
      ),
    [
      buildWithdrawFlow,
      context,
      decimals,
      normalizedProtocolName,
      token.address,
      token.decimals,
    ],
  );

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Withdraw transaction sent",
    emptyFlowErrorMessage: "Failed to build withdraw instructions",
  });
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  const { commonModalProps } = useWithdrawModalConfig({ token, supplyBalance });

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
      {...commonModalProps}
      token={token}
      protocolName={protocolName}
      apy={token.currentRate}
      balance={supplyBalance}
      network="evm"
      chainId={chainId}
      position={position}
      onConfirm={handleConfirm}
      renderExtraContent={renderBatchingPreference}
    />
  );
};
