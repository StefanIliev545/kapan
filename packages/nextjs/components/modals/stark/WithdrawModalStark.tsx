import { FC } from "react";
import { BaseTokenModal } from "./BaseTokenModal";

interface WithdrawModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string;
    currentRate: number;
  };
  protocolName: string;
  counterpartToken?: string;
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  counterpartToken,
}) => {
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