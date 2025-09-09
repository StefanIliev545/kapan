import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { VesuContext, useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface DepositModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  vesuContext?: VesuContext;
  position?: PositionManager;
}

export const DepositModalStark: FC<DepositModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  vesuContext,
  position,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Deposit",
    token.address,
    protocolName,
    decimals,
    vesuContext,
  );
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
      network="stark"
      buildCalls={buildCalls}
      position={position}
      onConfirm={execute}
    />
  );
};
