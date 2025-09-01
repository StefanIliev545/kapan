import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const BorrowModal: FC<BorrowModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { balance, decimals } = useTokenBalance(token.address, "evm");
  const { execute, buildTx } = useLendingAction("evm", "Borrow", token.address, protocolName, decimals);
  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Borrow"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={0}
      balance={balance}
      network="evm"
      buildTx={buildTx}
      onConfirm={execute}
    />
  );
};
