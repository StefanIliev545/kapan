import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { useLendingAction } from "~~/hooks/useLendingAction";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
}

export const WithdrawModal: FC<WithdrawModalProps> = ({ isOpen, onClose, token, protocolName, supplyBalance }) => {
  const decimals = token.decimals;
  const { execute } = useLendingAction(
    "evm",
    "Withdraw",
    token.address,
    protocolName,
    decimals,
    undefined,
    supplyBalance,
  );
  const gasCostUsd = useGasEstimate("evm");
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
      gasCostUsd={gasCostUsd}
      onConfirm={execute}
    />
  );
};
