import { useCallback, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";

import { useBatchingPreference } from "./useBatchingPreference";
import { useKapanRouterV2 } from "./useKapanRouterV2";
import { notification } from "~~/utils/scaffold-stark/notification";
import type { ProtocolInstruction } from "~~/utils/v2/instructionHelpers";

interface UseEvmTransactionFlowParams {
  isOpen: boolean;
  chainId?: number;
  onClose?: () => void;
  successMessage: string;
  buildFlow: (amount: string, isMax?: boolean) =>
    | ProtocolInstruction[]
    | null
    | undefined
    | Promise<ProtocolInstruction[] | null | undefined>;
  emptyFlowErrorMessage?: string;
  chainSwitchErrorMessage?: string;
  simulateWhenBatching?: boolean;
}

export const useEvmTransactionFlow = ({
  isOpen,
  chainId,
  onClose,
  buildFlow,
  successMessage,
  emptyFlowErrorMessage = "Failed to build transaction instructions",
  chainSwitchErrorMessage = "Please switch to the selected network to proceed",
  simulateWhenBatching = false,
}: UseEvmTransactionFlowParams) => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const batchingPreference = useBatchingPreference();
  const { executeFlowBatchedIfPossible, isAnyConfirmed, simulateInstructions } = useKapanRouterV2();

  const ensureCorrectChain = useCallback(async () => {
    if (!chainId || !switchChain || chain?.id === chainId) return;
    await switchChain({ chainId });
  }, [chainId, chain?.id, switchChain]);

  useEffect(() => {
    if (!isOpen) return;
    ensureCorrectChain().catch(error => {
      console.warn("Auto network switch failed", error);
    });
  }, [ensureCorrectChain, isOpen]);

  const handleConfirm = useCallback(
    async (amount: string, isMax?: boolean) => {
      try {
        await ensureCorrectChain();
      } catch (error) {
        notification.error(chainSwitchErrorMessage);
        throw error;
      }

      const instructions = await buildFlow(amount, isMax);

      if (!instructions || instructions.length === 0) {
        const error = new Error(emptyFlowErrorMessage);
        notification.error(error.message);
        throw error;
      }

      // For batched flows, run a client-side simulation to surface readable errors before bundling
      if (simulateWhenBatching && batchingPreference.enabled) {
        try {
          await simulateInstructions(instructions);
        } catch (error: any) {
          notification.error(error?.message || "Transaction simulation failed");
          throw error;
        }
      }

      await executeFlowBatchedIfPossible(instructions, batchingPreference.enabled);
      // Transaction toast notifications are handled by executeFlowBatchedIfPossible
    },
    [
      ensureCorrectChain,
      buildFlow,
      executeFlowBatchedIfPossible,
      batchingPreference.enabled,
      simulateInstructions,
      successMessage,
      chainSwitchErrorMessage,
      emptyFlowErrorMessage,
      simulateWhenBatching,
    ],
  );

  useEffect(() => {
    if (isAnyConfirmed && isOpen) {
      onClose?.();
    }
  }, [isAnyConfirmed, isOpen, onClose]);

  return {
    handleConfirm,
    batchingPreference,
  };
};

export type UseEvmTransactionFlowReturn = ReturnType<typeof useEvmTransactionFlow>;
