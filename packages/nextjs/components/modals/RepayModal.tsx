import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: number;
}

export const RepayModal: FC<RepayModalProps> = ({ isOpen, onClose, token, protocolName, debtBalance }) => {
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm");
  const { execute } = useLendingAction("evm", "Repay", token.address, protocolName, decimals);
  const gasCostUsd = useGasEstimate("evm");
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
      balance={walletBalance}
      percentBase={debtBalance}
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
