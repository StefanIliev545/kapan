import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useLendingAction } from "~~/hooks/useLendingAction";

interface DepositModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const DepositModalStark: FC<DepositModalStarkProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute } = useLendingAction("stark", "Deposit", token.address, protocolName, decimals);
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
      after={0}
      balance={balance}
      onConfirm={execute}
    />
  );
};

