import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance, decimals } = useTokenBalance(token.address, "evm");
  const { execute } = useLendingAction("evm", "Deposit", token.address, protocolName, decimals);
  const gasCostUsd = useGasEstimate("evm");
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
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
