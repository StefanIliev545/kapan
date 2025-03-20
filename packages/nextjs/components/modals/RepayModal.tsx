import { FC } from "react";
import { BaseTokenModal, TokenInfo } from "./BaseTokenModal";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const RepayModal: FC<RepayModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  return (
    <BaseTokenModal
      isOpen={isOpen}
      onClose={onClose}
      token={token}
      protocolName={protocolName}
      actionType="repay"
      actionLabel="Repay"
    />
  );
};
