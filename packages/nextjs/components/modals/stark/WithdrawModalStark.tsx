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
    protocolAmount?: bigint;
    tokenPrice?: bigint;
  };
  protocolName: string;
  vesuContext?: {
    pool_id: bigint;
    counterpart_token: string;
  };
}

export const WithdrawModalStark: FC<WithdrawModalStarkProps> = ({
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
      actionType="withdraw"
      actionLabel="Withdraw"
      vesuContext={vesuContext}
    />
  );
}; 