import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  position?: PositionManager;
}

export const RepayModal: FC<RepayModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  position,
}) => {
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm");
  const { buildRepayFlowAsync, executeFlowWithApprovals, isPending, isConfirming, isConfirmed, isApproving } = useKapanRouterV2();
  
  if (token.decimals == null) {
    token.decimals = decimals;
  }
  
  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = walletBalance < bump ? walletBalance : bump;

  const handleRepay = useCallback(async (amount: string, isMax?: boolean) => {
    try {
      // Use async version for max repayments to safely read wallet balance
      const instructions = await buildRepayFlowAsync(
        protocolName.toLowerCase(),
        token.address,
        amount,
        token.decimals || decimals || 18,
        isMax || false
      );
      
      if (instructions.length === 0) {
        notification.error("Failed to build repay instructions or no balance to repay");
        return;
      }

      // Use executeFlowWithApprovals to handle approvals automatically
      await executeFlowWithApprovals(instructions);
      notification.success("Repay transaction sent");
    } catch (error: any) {
      console.error("Repay error:", error);
      notification.error(error.message || "Failed to repay");
    }
  }, [protocolName, token.address, token.decimals, decimals, buildRepayFlowAsync, executeFlowWithApprovals]);

  useEffect(() => {
    if (isConfirmed && isOpen) {
      onClose();
    }
  }, [isConfirmed, isOpen, onClose]);

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Repay"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={before}
      balance={walletBalance}
      percentBase={debtBalance}
      max={maxInput}
      network="evm"
      position={position}
      onConfirm={handleRepay}
    />
  );
};
