import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  position?: PositionManager;
}

export const RepayModal: FC<RepayModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  position,
}) => {
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm");
  const { execute, buildTx } = useLendingAction(
    "evm",
    "Repay",
    token.address,
    protocolName,
    decimals,
    undefined,
    debtBalance,
    walletBalance,
  );
  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = walletBalance < bump ? walletBalance : bump;
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
      balance={walletBalance}
      percentBase={debtBalance}
      max={maxInput}
      network="evm"
      buildTx={buildTx}
      position={position}
      onConfirm={execute}
    />
  );
};
