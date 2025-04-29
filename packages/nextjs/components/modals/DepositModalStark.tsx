import { FC } from "react";
import { BaseTokenModal } from "./stark/BaseTokenModal";

interface DepositModalStarkProps {
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

export const DepositModalStark: FC<DepositModalStarkProps> = ({
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
      actionType="deposit"
      actionLabel="Deposit"
    />
  );
};
