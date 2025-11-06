import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";
import { useAccount, useSwitchChain } from "wagmi";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  position?: PositionManager;
  chainId?: number;
}

export const RepayModal: FC<RepayModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  position,
  chainId,
}) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm", chainId);
  const { buildRepayFlowAsync, executeFlowWithApprovals, isConfirmed } = useKapanRouterV2();
  
  if (token.decimals == null) {
    token.decimals = decimals;
  }
  
  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = walletBalance < bump ? walletBalance : bump;

  // Ensure wallet is on the correct EVM network when modal opens
  useEffect(() => {
    if (!isOpen || !chainId) return;
    if (chain?.id !== chainId) {
      try {
        switchChain?.({ chainId });
      } catch (e) {
        console.warn("Auto network switch failed", e);
      }
    }
  }, [isOpen, chainId, chain?.id, switchChain]);

  const handleRepay = useCallback(async (amount: string, isMax?: boolean) => {
    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          notification.error("Please switch to the selected network to proceed");
          return;
        }
      }
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
  }, [protocolName, token.address, token.decimals, decimals, buildRepayFlowAsync, executeFlowWithApprovals, chain?.id, chainId, switchChain]);

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
