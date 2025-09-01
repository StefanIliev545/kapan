import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName, position }) => {
  const { balance, decimals } = useTokenBalance(token.address, "evm");
  const { execute, buildTx } = useLendingAction("evm", "Deposit", token.address, protocolName, decimals);
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
      buildTx={buildTx}
      position={position}
      onConfirm={execute}
    />
  );
};
