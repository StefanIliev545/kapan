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

// TriggerExecuted fires on each chunk fill — positions change after every chunk, not just completion.
const TRIGGER_EXECUTED_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: false, name: "iterationCount", type: "uint256" },
      { indexed: false, name: "actualSellAmount", type: "uint256" },
      { indexed: false, name: "actualBuyAmount", type: "uint256" },
    ],
    name: "TriggerExecuted",
    type: "event",
  },
] as const;

/** Dispatch the global txCompleted event so protocol views (Morpho, Euler, Compound, etc.)
 *  trigger their position refetch via useTxCompletedListener. */
function dispatchTxCompleted() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("txCompleted"));
  }
}

/**
 * Hook that watches for conditional order events and invalidates queries when they fire.
 * This enables real-time updates when ADL, limit, or auto-leverage orders are created,
 * executed (each chunk), completed, or cancelled.
 *
 * Mounted in PendingOrdersDrawer which is always rendered (regardless of drawer open/close),
 * so event watching is always active when the user is connected.
 */
export function useConditionalOrderEvents() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const queryClient = useQueryClient();

  const { data: contractInfo } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager" as any,
    chainId: chainId as any,
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

  // Shared logic for position-changing events (completion, cancellation, chunk fills)
  const refreshPositions = useCallback(
    (eventName: string, logs: Log[]) => {
      if (logs.length === 0) return;

      logger.info(`[useConditionalOrderEvents] ${eventName}, refreshing positions`, {
        eventCount: logs.length,
        chainId,
        user: userAddress,
      });

      // Invalidate conditional order queries
      queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });

      // Refresh positions - the order execution changed the user's position
      // Protocol-specific query keys (Morpho, Euler use custom keys)
      queryClient.invalidateQueries({ queryKey: qk.morpho.all(chainId) });
      queryClient.invalidateQueries({ queryKey: qk.euler.all(chainId) });
      queryClient.invalidateQueries({ queryKey: qk.positions(chainId, userAddress) });
      queryClient.invalidateQueries({ queryKey: qk.balances(chainId, userAddress) });
      // Aave, Compound, Venus use wagmi's readContract queries — invalidate those too
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      queryClient.invalidateQueries({ queryKey: ["readContracts"] });

      // Dispatch txCompleted so protocol views (MorphoProtocolView, EulerProtocolView,
      // CompoundLendingPositions, etc.) that listen via useTxCompletedListener also refresh.
      dispatchTxCompleted();
    },
    [queryClient, chainId, userAddress],
  );

  const handleOrderCompleted = useCallback(
    (logs: Log[]) => refreshPositions("Order COMPLETED", logs),
    [refreshPositions],
  );

  const handleOrderCancelled = useCallback(
    (logs: Log[]) => refreshPositions("Order CANCELLED", logs),
    [refreshPositions],
  );

  const handleTriggerExecuted = useCallback(
    (logs: Log[]) => refreshPositions("Chunk executed (TriggerExecuted)", logs),
    [refreshPositions],
  );

  // Watch for ConditionalOrderCreated
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCreated",
    onLogs: handleOrderEvent,
    enabled: isEnabled,
  });

  // Watch for ConditionalOrderCompleted (ADL/AutoLeverage/Limit fully executed)
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCompleted",
    onLogs: handleOrderCompleted,
    enabled: isEnabled,
  });

  // Watch for ConditionalOrderCancelled — positions may have partially changed
  useWatchContractEvent({
    address: contractAddress,
    abi: CONDITIONAL_ORDER_EVENTS_ABI,
    eventName: "ConditionalOrderCancelled",
    onLogs: handleOrderCancelled,
    enabled: isEnabled,
  });

  // Watch for TriggerExecuted — fires on each chunk fill. Positions change after
  // every chunk, not just on final completion. This ensures the UI stays up-to-date
  // for multi-chunk orders (limit orders, DCA, etc.).
  useWatchContractEvent({
    address: contractAddress,
    abi: TRIGGER_EXECUTED_EVENT_ABI,
    eventName: "TriggerExecuted",
    onLogs: handleTriggerExecuted,
    enabled: isEnabled,
  });

  return {
    isWatching: isEnabled,
    contractAddress,
  };
}
