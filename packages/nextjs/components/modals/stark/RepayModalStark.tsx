import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useLendingAction } from "~~/hooks/useLendingAction";

interface RepayModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const RepayModalStark: FC<RepayModalStarkProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute } = useLendingAction("stark", "Repay", token.address, protocolName, decimals);
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

