import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useBatchingPreference } from "~~/hooks/useBatchingPreference";
import { PositionManager } from "~~/utils/position";
import { notification } from "~~/utils/scaffold-stark/notification";
import { useAccount, useSwitchChain } from "wagmi";
import type { Address } from "viem";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
  chainId?: number;
  market?: Address; // Market address for Compound (baseToken/comet address)
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName, position, chainId, market }) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId);
  const { buildDepositFlow, executeFlowBatchedIfPossible, isAnyConfirmed } = useKapanRouterV2();
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = useBatchingPreference();
  
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
    if (chainId && chain?.id !== chainId) {
      try {
        await switchChain?.({ chainId });
      } catch (e) {
        notification.error("Please switch to the selected network to proceed");
        throw e;
      }
    }
    const instructions = buildDepositFlow(
      protocolName.toLowerCase(),
      token.address,
      amount,
      token.decimals || decimals || 18,
      market
    );
    
    if (instructions.length === 0) {
      const error = new Error("Failed to build deposit instructions");
      notification.error(error.message);
      throw error;
    }

    // Use executeFlowBatchedIfPossible to handle approvals automatically (batched when supported)
    await executeFlowBatchedIfPossible(instructions, preferBatching);
    notification.success("Deposit transaction sent");
    
    if (isAnyConfirmed) {
      onClose();
    }
  }, [protocolName, token.address, token.decimals, decimals, buildDepositFlow, executeFlowBatchedIfPossible, isAnyConfirmed, onClose, chain?.id, chainId, switchChain, market, preferBatching]);

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
      renderExtraContent={() => isPreferenceLoaded ? (
        <div className="pt-2 pb-1">
          <label className="label cursor-pointer gap-2 justify-start">
            <input
              type="checkbox"
              checked={preferBatching}
              onChange={(e) => setPreferBatching(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="label-text text-xs">Batch Transactions with Smart Account</span>
          </label>
        </div>
      ) : null}
    />
  );
};
