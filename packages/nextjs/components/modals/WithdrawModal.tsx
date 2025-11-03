import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  position?: PositionManager;
}

export const WithdrawModal: FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  position,
}) => {
  const decimals = token.decimals;
  const { buildWithdrawFlow, executeFlowWithApprovals, isConfirmed } = useKapanRouterV2();
  
  if (token.decimals == null) {
    token.decimals = decimals;
  }
  
  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;

  const handleWithdraw = useCallback(async (amount: string, isMax?: boolean) => {
    try {
      const instructions = buildWithdrawFlow(
        protocolName.toLowerCase(),
        token.address,
        amount,
        token.decimals || decimals || 18,
        isMax || false
      );
      
      if (instructions.length === 0) {
        notification.error("Failed to build withdraw instructions");
        return;
      }

      // Use executeFlowWithApprovals to handle approvals automatically
      await executeFlowWithApprovals(instructions);
      notification.success("Withdraw transaction sent");
    } catch (error: any) {
      console.error("Withdraw error:", error);
      notification.error(error.message || "Failed to withdraw");
    }
  }, [protocolName, token.address, token.decimals, decimals, buildWithdrawFlow, executeFlowWithApprovals]);

  useEffect(() => {
    if (isConfirmed && isOpen) {
      onClose();
    }
  }, [isConfirmed, isOpen, onClose]);

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
      before={before}
      balance={supplyBalance}
      percentBase={supplyBalance}
      max={maxInput}
      network="evm"
      position={position}
      onConfirm={handleWithdraw}
    />
  );
};
