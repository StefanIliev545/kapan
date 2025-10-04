import { FC } from "react";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useLendingAction } from "~~/hooks/useLendingAction";
import type { VesuContext } from "~~/utils/vesu";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface BorrowModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  vesuContext?: VesuContext;
  currentDebt: number;
  position?: PositionManager;
}

export const BorrowModalStark: FC<BorrowModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  vesuContext,
  currentDebt,
  position,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark");
  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Borrow",
    token.address,
    protocolName,
    decimals,
    vesuContext,
  );
  if (token.decimals == null) {
    token.decimals = decimals;
  }
  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Borrow"
      token={{ ...token, decimals }}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={currentDebt}
      balance={balance}
      network="stark"
      buildCalls={buildCalls}
      position={position}
      onConfirm={execute}
    />
  );
};
