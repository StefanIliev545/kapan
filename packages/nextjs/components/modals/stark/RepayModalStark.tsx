import { FC } from "react";
import { BaseTokenModal } from "./BaseTokenModal";

interface RepayModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string;
    currentRate: number;
  };
  protocolName: string;
  vesuContext?: {
    pool_id: bigint;
    counterpart_token: string;
  };
}

export const RepayModalStark: FC<RepayModalStarkProps> = ({
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
      actionType="repay"
      actionLabel="Repay"
      vesuContext={vesuContext}
    />
  );
}; 