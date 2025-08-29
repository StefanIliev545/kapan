import { FC } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
}

export const WithdrawModal: FC<WithdrawModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Withdraw"
      token={token}
      protocolName={protocolName}
      apyLabel="Supply APY"
      apy={token.currentRate}
      metricLabel="Total supplied"
      before={0}
      after={0}
    />
  );
};

