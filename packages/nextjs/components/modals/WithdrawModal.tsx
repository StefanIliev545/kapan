import { FC } from "react";
import { BaseTokenModal, TokenInfo } from "./BaseTokenModal";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const WithdrawModal: FC<WithdrawModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  return (
    <BaseTokenModal
      isOpen={isOpen}
      onClose={onClose}
      token={token}
      protocolName={protocolName}
      actionType="withdraw"
      actionLabel="Withdraw"
    />
  );
};
