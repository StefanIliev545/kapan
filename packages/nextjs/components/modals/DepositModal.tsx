import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";
import { useAccount, useSwitchChain } from "wagmi";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
  chainId?: number;
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName, position, chainId }) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId);
  const { buildDepositFlow, executeFlowWithApprovals, isConfirmed } = useKapanRouterV2();
  
  if (token.decimals == null) {
    token.decimals = decimals;
  }

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

  const handleDeposit = useCallback(async (amount: string) => {
    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          notification.error("Please switch to the selected network to proceed");
          return;
        }
      }
      const instructions = buildDepositFlow(
        protocolName.toLowerCase(),
        token.address,
        amount,
        token.decimals || decimals || 18
      );
      
      if (instructions.length === 0) {
        notification.error("Failed to build deposit instructions");
        return;
      }

      // Use executeFlowWithApprovals to handle approvals automatically
      await executeFlowWithApprovals(instructions);
      notification.success("Deposit transaction sent");
      
      if (isConfirmed) {
        onClose();
      }
    } catch (error: any) {
      console.error("Deposit error:", error);
      notification.error(error.message || "Failed to deposit");
    }
  }, [protocolName, token.address, token.decimals, decimals, buildDepositFlow, executeFlowWithApprovals, isConfirmed, onClose, chain?.id, chainId, switchChain]);

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Deposit"
      token={token}
      protocolName={protocolName}
      apyLabel="Supply APY"
      apy={token.currentRate}
      metricLabel="Total supplied"
      before={0}
      balance={balance}
      network="evm"
      position={position}
      onConfirm={handleDeposit}
    />
  );
};
