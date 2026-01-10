import { FC } from "react";
import { TokenActionModal } from "../TokenActionModal";
import {
  useDepositModalConfig,
  buildDepositModalProps,
  type StarkDepositModalProps,
} from "../common/useDepositModalConfig";
import { useLendingAction } from "~~/hooks/useLendingAction";

export const DepositModalStark: FC<StarkDepositModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  vesuContext,
  position,
}) => {
  // Use shared hook for common deposit modal configuration
  const renderProps = useDepositModalConfig({
    token,
    network: "stark",
  });

  const { decimals } = renderProps;

  // Starknet-specific transaction handling
  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Deposit",
    token.address,
    protocolName,
    decimals,
    vesuContext,
  );

  // Build props using shared utility
  const modalProps = buildDepositModalProps({
    isOpen,
    onClose,
    token,
    protocolName,
    position,
    renderProps,
    onConfirm: execute,
    buildCalls,
  });

  return <TokenActionModal {...modalProps} />;
};
