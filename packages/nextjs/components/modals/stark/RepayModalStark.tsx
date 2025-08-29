import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { formatUnits } from "viem";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { VesuContext, useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";

interface RepayModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  vesuContext?: VesuContext;
}

export const RepayModalStark: FC<RepayModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  vesuContext,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute } = useLendingAction("stark", "Repay", token.address, protocolName, decimals, vesuContext);
  const gasCostUsd = useGasEstimate("stark");
  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
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
      before={before}
      balance={balance}
      percentBase={debtBalance}
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
