import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const RepayModal: FC<RepayModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm");
  const debtBalance = 100; // mocked
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
      before={debtBalance}
      after={debtBalance}
      balance={walletBalance}
      percentBase={debtBalance}
      onConfirm={execute}
    />
  );
};
