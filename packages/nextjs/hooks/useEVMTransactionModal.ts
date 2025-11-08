import { useCallback, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useKapanRouterV2 } from "./useKapanRouterV2";
import { useBatchingPreference } from "./useBatchingPreference";
import { useTokenBalance } from "./useTokenBalance";
import { notification } from "~~/utils/scaffold-stark/notification";
import type { Address } from "viem";

export interface EVMTransactionModalConfig {
  isOpen: boolean;
  chainId?: number;
  tokenAddress: string;
  protocolName: string;
  market?: Address; // Market address for Compound
}

/**
 * Shared hook for common EVM transaction modal logic
 * Handles network switching, transaction building, and execution
 */
export const useEVMTransactionModal = (config: EVMTransactionModalConfig) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { balance, decimals } = useTokenBalance(config.tokenAddress, "evm", config.chainId);
  const { executeFlowBatchedIfPossible, isAnyConfirmed } = useKapanRouterV2();
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = useBatchingPreference();

  // Ensure wallet is on the correct EVM network when modal opens
  useEffect(() => {
    if (!config.isOpen || !config.chainId) return;
    if (chain?.id !== config.chainId) {
      try {
        switchChain?.({ chainId: config.chainId });
      } catch (e) {
        console.warn("Auto network switch failed", e);
      }
    }
  }, [config.isOpen, config.chainId, chain?.id, switchChain]);

  /**
   * Execute a transaction with automatic network switching and error handling
   */
  const executeTransaction = useCallback(
    async (
      buildInstructions: () => any[] | Promise<any[]>,
      successMessage: string,
      onSuccess?: () => void
    ) => {
      // Switch network if needed
      if (config.chainId && chain?.id !== config.chainId) {
        try {
          await switchChain?.({ chainId: config.chainId });
        } catch (e) {
          notification.error("Please switch to the selected network to proceed");
          throw e;
        }
      }

      // Build instructions
      const instructions = await buildInstructions();

      if (instructions.length === 0) {
        const error = new Error("Failed to build transaction instructions");
        notification.error(error.message);
        throw error;
      }

      // Execute with batching support
      await executeFlowBatchedIfPossible(instructions, preferBatching);
      notification.success(successMessage);

      if (onSuccess) {
        onSuccess();
      }
    },
    [config.chainId, chain?.id, switchChain, executeFlowBatchedIfPossible, preferBatching]
  );

  return {
    balance,
    decimals,
    preferBatching,
    setPreferBatching,
    isPreferenceLoaded,
    isAnyConfirmed,
    executeTransaction,
  };
};

