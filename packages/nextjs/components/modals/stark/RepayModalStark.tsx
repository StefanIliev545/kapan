import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { formatUnits } from "viem";
import { VesuContext, useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface RepayModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  vesuContext?: VesuContext;
  position?: PositionManager;
}

export const RepayModalStark: FC<RepayModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  vesuContext,
  position,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Repay",
    token.address,
    protocolName,
    decimals,
    vesuContext,
    debtBalance,
    balance,
  );
  if (token.decimals == null) {
    token.decimals = decimals;
  }
  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = balance < bump ? balance : bump;
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
      max={maxInput}
      network="stark"
      buildCalls={buildCalls}
      position={position}
      onConfirm={execute}
    />
  );
};
