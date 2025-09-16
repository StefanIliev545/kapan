import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  currentDebt: number;
  position?: PositionManager;
}

export const BorrowModal: FC<BorrowModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  currentDebt,
  position,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "evm");
  const { execute, buildTx } = useLendingAction("evm", "Borrow", token.address, protocolName, decimals);
  if (token.decimals == null) {
    token.decimals = decimals;
  }
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
      buildTx={buildTx}
      position={position}
      onConfirm={execute}
    />
  );
};
