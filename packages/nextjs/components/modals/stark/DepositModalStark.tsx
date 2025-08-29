import { FC } from "react";
import { BaseTokenModal } from "./BaseTokenModal";

interface DepositModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string;
    currentRate: number;
    tokenPrice?: bigint;
  };
  protocolName: string;
  vesuContext?: {
    pool_id: bigint;
    counterpart_token: string;
  };
}

export const DepositModalStark: FC<DepositModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  vesuContext,
}) => {
  return (
    <BaseTokenModal
      isOpen={isOpen}
      onClose={onClose}
      token={token}
      protocolName={protocolName}
      actionType="deposit"
      actionLabel="Deposit"
      vesuContext={vesuContext}
    />
  );
};
