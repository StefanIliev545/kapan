import { useCallback } from "react";
import { useAccount, useChainId, usePublicClient, useWatchContractEvent } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, type Log } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { logger } from "~~/utils/logger";

// Event ABIs for KapanConditionalOrderManager
const CONDITIONAL_ORDER_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "user", type: "address" },
    ],
    name: "ConditionalOrderCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "user", type: "address" },
    ],
    name: "ConditionalOrderCompleted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "user", type: "address" },
    ],
    name: "ConditionalOrderCancelled",
    type: "event",
  },
] as const;

/**
 * Hook that watches for conditional order events and invalidates queries when they fire.
 * This enables real-time updates when ADL orders are created, executed, or cancelled.
 */
export function useConditionalOrderEvents() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const queryClient = useQueryClient();

  const { data: contractInfo } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager",
    chainId,
  } as any);

  const contractAddress = contractInfo?.address as Address | undefined;
  const isEnabled = !!contractAddress && !!publicClient && !!userAddress;

  // Callback to invalidate queries when any conditional order event fires
  const handleEvent = useCallback(
    (logs: Log[]) => {
      if (logs.length === 0) return;

      logger.info("[useConditionalOrderEvents] Event received, invalidating queries", {
        eventCount: logs.length,
        chainId,
      });

      // Invalidate all conditional order queries
      queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });
    },
    [queryClient, chainId],
  );

  // Watch for ConditionalOrderCreated
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCreated",
    onLogs: handleEvent,
    enabled: isEnabled,
  });

  // Watch for ConditionalOrderCompleted (ADL executed)
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCompleted",
    onLogs: handleEvent,
    enabled: isEnabled,
  });

  // Watch for ConditionalOrderCancelled
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCancelled",
    onLogs: handleEvent,
    enabled: isEnabled,
  });

  return {
    isWatching: isEnabled,
    contractAddress,
  };
}
