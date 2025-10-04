import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { formatUnits } from "viem";
import { useLendingAction } from "~~/hooks/useLendingAction";
import type { VesuContext } from "~~/utils/vesu";
import { PositionManager } from "~~/utils/position";

interface WithdrawModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  vesuContext?: VesuContext;
  position?: PositionManager;
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  vesuContext,
  position,
}) => {
  const decimals = token.decimals;
  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Withdraw",
    token.address,
    protocolName,
    decimals,
    vesuContext,
    supplyBalance,
  );
  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;
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
      max={maxInput}
      network="stark"
      buildCalls={buildCalls}
      position={position}
      onConfirm={execute}
    />
  );
};
