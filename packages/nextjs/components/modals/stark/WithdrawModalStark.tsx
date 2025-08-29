import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useLendingAction } from "~~/hooks/useLendingAction";

interface WithdrawModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute } = useLendingAction("stark", "Withdraw", token.address, protocolName, decimals);
  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Withdraw"
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

