import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { formatUnits } from "viem";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { VesuContext, useLendingAction } from "~~/hooks/useLendingAction";

interface WithdrawModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  vesuContext?: VesuContext;
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  vesuContext,
}) => {
  const decimals = token.decimals;
  const { execute } = useLendingAction(
    "stark",
    "Withdraw",
    token.address,
    protocolName,
    decimals,
    vesuContext,
    supplyBalance,
  );
  const gasCostUsd = useGasEstimate("stark");
  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
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
      before={before}
      balance={supplyBalance}
      percentBase={supplyBalance}
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
