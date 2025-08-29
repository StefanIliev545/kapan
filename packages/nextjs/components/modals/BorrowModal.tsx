import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const BorrowModal: FC<BorrowModalProps> = ({ isOpen, onClose, token, protocolName }) => {
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
      after={0}
    />
  );
};

