import { useCallback } from "react";
import { useAccount, useChainId, usePublicClient, useWatchContractEvent } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, type Log } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { logger } from "~~/utils/logger";
import { qk } from "~~/lib/queryKeys";

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
    contractName: "KapanConditionalOrderManager" as "KapanRouter",
    chainId,
  });

  const contractAddress = contractInfo?.address as Address | undefined;
  const isEnabled = !!contractAddress && !!publicClient && !!userAddress;

  // Callback to invalidate queries when any conditional order event fires
  const handleOrderEvent = useCallback(
    (logs: Log[]) => {
      if (logs.length === 0) return;

      logger.info("[useConditionalOrderEvents] Order event received, invalidating queries", {
        eventCount: logs.length,
        chainId,
      });

      // Invalidate conditional order queries
      queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });
    },
    [queryClient, chainId],
  );

  // Callback for order completion - also refresh positions since they changed
  const handleOrderCompleted = useCallback(
    (logs: Log[]) => {
      if (logs.length === 0) return;

      logger.info("[useConditionalOrderEvents] Order COMPLETED, refreshing positions", {
        eventCount: logs.length,
        chainId,
        user: userAddress,
      });

      // Invalidate conditional order queries
      queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });

      // Refresh positions - the order execution changed the user's position
      queryClient.invalidateQueries({ queryKey: qk.morpho.all(chainId) });
      queryClient.invalidateQueries({ queryKey: qk.euler.all(chainId) });
      queryClient.invalidateQueries({ queryKey: qk.positions(chainId, userAddress) });
      queryClient.invalidateQueries({ queryKey: qk.balances(chainId, userAddress) });
    },
    [queryClient, chainId, userAddress],
  );

  // Watch for ConditionalOrderCreated
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCreated",
    onLogs: handleOrderEvent,
    enabled: isEnabled,
  });

  // Watch for ConditionalOrderCompleted (ADL/AutoLeverage executed)
  // This also refreshes positions since the order changed the user's position
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCompleted",
    onLogs: handleOrderCompleted,
    enabled: isEnabled,
  });

  // Watch for ConditionalOrderCancelled
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCancelled",
    onLogs: handleOrderEvent,
    enabled: isEnabled,
  });

  return {
    isWatching: isEnabled,
    contractAddress,
  };
}
