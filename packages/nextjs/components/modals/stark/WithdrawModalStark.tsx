import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { useLendingAction } from "~~/hooks/useLendingAction";

interface WithdrawModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: number;
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
}) => {
  const decimals = token.decimals;
  const { execute } = useLendingAction("stark", "Withdraw", token.address, protocolName, decimals);
  const gasCostUsd = useGasEstimate("stark");
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
      before={supplyBalance}
      balance={supplyBalance}
      percentBase={supplyBalance}
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
