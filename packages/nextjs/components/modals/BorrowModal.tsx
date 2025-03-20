import { FC } from "react";
import { BaseTokenModal, TokenInfo } from "./BaseTokenModal";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const BorrowModal: FC<BorrowModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  return (
    <BaseTokenModal
      isOpen={isOpen}
      onClose={onClose}
      token={token}
      protocolName={protocolName}
      actionType="borrow"
      actionLabel="Borrow"
    />
  );
};
