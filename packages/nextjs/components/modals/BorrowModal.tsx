import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";
import { useAccount, useSwitchChain } from "wagmi";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  currentDebt: number;
  position?: PositionManager;
  chainId?: number;
}

export const BorrowModal: FC<BorrowModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  currentDebt,
  position,
  chainId,
}) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId);
  const { buildBorrowFlow, executeFlowWithApprovals, isConfirmed } = useKapanRouterV2();
  
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
        // Non-blocking; user can still switch manually
        console.warn("Auto network switch failed", e);
      }
    }
  }, [isOpen, chainId, chain?.id, switchChain]);

  const handleBorrow = useCallback(async (amount: string) => {
    try {
      // If a target chain is provided and wallet is on a different chain, switch first
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          notification.error("Please switch to the selected network to proceed");
          return;
        }
      }
      const instructions = buildBorrowFlow(
        protocolName.toLowerCase(),
        token.address,
        amount,
        token.decimals || decimals || 18
      );
      
      if (instructions.length === 0) {
        notification.error("Failed to build borrow instructions");
        return;
      }

      // Use executeFlowWithApprovals to handle gateway authorizations (e.g., Aave credit delegation)
      await executeFlowWithApprovals(instructions);
      notification.success("Borrow transaction sent");
    } catch (error: any) {
      console.error("Borrow error:", error);
      notification.error(error.message || "Failed to borrow");
    }
  }, [protocolName, token.address, token.decimals, decimals, buildBorrowFlow, executeFlowWithApprovals, chain?.id, chainId, switchChain]);

  useEffect(() => {
    if (isConfirmed && isOpen) {
      onClose();
    }
  }, [isConfirmed, isOpen, onClose]);

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Borrow"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={currentDebt}
      balance={balance}
      network="evm"
      position={position}
      onConfirm={handleBorrow}
    />
  );
};
