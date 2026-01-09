import { FC, useCallback } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { BatchingPreference } from "./common/BatchingPreference";
import { formatUnits } from "viem";
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

  if (token.decimals == null) {
    token.decimals = decimals;
  }
  
  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;

  return (
    <TokenActionModal
      isOpen={isOpen}
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
      chainId={chainId}
      position={position}
      onConfirm={handleConfirm}
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
