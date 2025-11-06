import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";
import { useAccount, useSwitchChain } from "wagmi";
import type { Address } from "viem";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  position?: PositionManager;
  chainId?: number;
  market?: Address; // Market address for Compound (baseToken/comet address)
}

export const WithdrawModal: FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  position,
  chainId,
  market,
}) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const decimals = token.decimals;
  const { buildWithdrawFlow, executeFlowBatchedIfPossible, isAnyConfirmed } = useKapanRouterV2();
  
  if (token.decimals == null) {
    token.decimals = decimals;
  }
  
  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;

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

  const handleWithdraw = useCallback(async (amount: string, isMax?: boolean) => {
    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          notification.error("Please switch to the selected network to proceed");
          return;
        }
      }
      const instructions = buildWithdrawFlow(
        protocolName.toLowerCase(),
        token.address,
        amount,
        token.decimals || decimals || 18,
        isMax || false,
        market
      );
      
      if (instructions.length === 0) {
        notification.error("Failed to build withdraw instructions");
        return;
      }

      // Use executeFlowBatchedIfPossible to handle approvals automatically (batched when supported)
      await executeFlowBatchedIfPossible(instructions);
      notification.success("Withdraw transaction sent");
    } catch (error: any) {
      console.error("Withdraw error:", error);
      notification.error(error.message || "Failed to withdraw");
    }
  }, [protocolName, token.address, token.decimals, decimals, buildWithdrawFlow, executeFlowBatchedIfPossible, chain?.id, chainId, switchChain, market]);

  useEffect(() => {
    if (isAnyConfirmed && isOpen) {
      onClose();
    }
  }, [isAnyConfirmed, isOpen, onClose]);

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
