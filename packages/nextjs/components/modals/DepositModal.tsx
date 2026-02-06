import { type FC, useCallback } from "react";
import { BatchingPreference } from "./common/BatchingPreference";
import {
  useDepositModalConfig,
  buildDepositModalProps,
  type EvmDepositModalProps,
} from "./common/useDepositModalConfig";
import { TokenActionModal } from "./TokenActionModal";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";

export const DepositModal: FC<EvmDepositModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  position,
  chainId,
  context,
}) => {
  const { buildDepositFlow } = useKapanRouterV2();
  const normalizedProtocolName = protocolName.toLowerCase();

  // Use shared hook for common deposit modal configuration
  const renderProps = useDepositModalConfig({
    token,
    network: "evm",
    chainId,
  });

  const { decimals } = renderProps;

  const buildFlow = useCallback(
    (amount: string) =>
      buildDepositFlow(
        normalizedProtocolName,
        token.address,
        amount,
        token.decimals || decimals || 18,
        context,
      ),
    [buildDepositFlow, context, decimals, normalizedProtocolName, token.address, token.decimals],
  );

  const { handleConfirm: handleDeposit, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Deposit transaction sent",
    emptyFlowErrorMessage: "Failed to build deposit instructions",
  });

  const {
    enabled: preferBatching,
    setEnabled: setPreferBatching,
    isLoaded: isPreferenceLoaded,
  } = batchingPreference;

  // Build props using shared utility
  const modalProps = buildDepositModalProps({
    isOpen,
    onClose,
    token,
    protocolName,
    position,
    renderProps,
    chainId,
    onConfirm: handleDeposit,
    renderExtraContent: () => (
      <BatchingPreference
        enabled={preferBatching}
        setEnabled={setPreferBatching}
        isLoaded={isPreferenceLoaded}
      />
    ),
  });

  return <TokenActionModal {...modalProps} />;
};
