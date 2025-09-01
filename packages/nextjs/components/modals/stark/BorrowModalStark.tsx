import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { VesuContext, useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface BorrowModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  vesuContext?: VesuContext;
  currentDebt: number;
  position?: PositionManager;
}

export const BorrowModalStark: FC<BorrowModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  vesuContext,
  currentDebt,
  position,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute } = useLendingAction("stark", "Borrow", token.address, protocolName, decimals, vesuContext);
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
      network="stark"
      position={position}
      onConfirm={execute}
    />
  );
};
