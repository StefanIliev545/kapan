import { FC, useCallback } from "react";
import { BatchingPreference } from "./common/BatchingPreference";
import { REPAY_MODAL_CONFIG, ensureTokenDecimals, useRepayModal } from "./common/useRepayModal";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  position?: PositionManager;
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
}

export const RepayModal: FC<RepayModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  position,
  chainId,
  context,
}) => {
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm", chainId, token.decimals);
  const { buildRepayFlowAsync } = useKapanRouterV2();
  const normalizedProtocolName = protocolName.toLowerCase();

  // Ensure token has decimals set (backwards compatibility)
  ensureTokenDecimals(token, decimals);

  // Use shared hook for common repay calculations
  const { before, maxInput, effectiveDecimals } = useRepayModal({
    token,
    debtBalance,
    walletBalance,
    decimals,
  });

  const buildFlow = useCallback(
    (amount: string, isMax?: boolean) =>
      buildRepayFlowAsync(normalizedProtocolName, token.address, amount, effectiveDecimals, isMax, maxInput, context),
    [buildRepayFlowAsync, context, effectiveDecimals, maxInput, normalizedProtocolName, token.address],
  );

  const { handleConfirm: handleRepay, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Repay transaction sent",
    emptyFlowErrorMessage: "Failed to build repay instructions or no balance to repay",
    chainSwitchErrorMessage: "Please switch to the selected network to proceed",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  const renderBatchingPreference = useCallback(
    () => <BatchingPreference enabled={preferBatching} setEnabled={setPreferBatching} isLoaded={isPreferenceLoaded} />,
    [preferBatching, setPreferBatching, isPreferenceLoaded],
  );

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action={REPAY_MODAL_CONFIG.action}
      token={token}
      protocolName={protocolName}
      apyLabel={REPAY_MODAL_CONFIG.apyLabel}
      apy={token.currentRate}
      metricLabel={REPAY_MODAL_CONFIG.metricLabel}
      before={before}
      balance={walletBalance}
      percentBase={debtBalance}
      max={maxInput}
      network="evm"
      chainId={chainId}
      position={position}
      onConfirm={handleRepay}
      renderExtraContent={renderBatchingPreference}
    />
  );
};
