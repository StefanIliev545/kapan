import { FC } from "react";
import { BaseTokenModal, TokenInfo } from "./BaseTokenModal";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  return (
    <BaseTokenModal
      isOpen={isOpen}
      onClose={onClose}
      token={token}
      protocolName={protocolName}
      actionType="deposit"
      actionLabel="Deposit"
    />
  );
};
