import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useLendingAction } from "~~/hooks/useLendingAction";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const RepayModal: FC<RepayModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance, decimals } = useTokenBalance(token.address, "evm");
  const { execute } = useLendingAction("evm", "Repay", token.address, protocolName, decimals);
  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Repay"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={0}
      after={0}
      balance={balance}
      onConfirm={execute}
    />
  );
};

