import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useWithdrawModalConfig } from "../common/useWithdrawModalConfig";
import { useLendingAction } from "~~/hooks/useLendingAction";
import type { VesuContext } from "~~/utils/vesu";
import { PositionManager } from "~~/utils/position";

interface WithdrawModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  vesuContext?: VesuContext;
  position?: PositionManager;
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  vesuContext,
  position,
}) => {
  const { decimals, commonModalProps } = useWithdrawModalConfig({ token, supplyBalance });
  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Withdraw",
    token.address,
    protocolName,
    decimals,
    vesuContext,
    supplyBalance,
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
      network="stark"
      buildCalls={buildCalls}
      position={position}
      onConfirm={execute}
    />
  );
};
