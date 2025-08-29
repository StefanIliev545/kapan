import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";

interface RepayModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: number;
}

export const RepayModalStark: FC<RepayModalStarkProps> = ({ isOpen, onClose, token, protocolName, debtBalance }) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute } = useLendingAction("stark", "Repay", token.address, protocolName, decimals);
  const gasCostUsd = useGasEstimate("stark");
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
      balance={balance}
      percentBase={debtBalance}
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
