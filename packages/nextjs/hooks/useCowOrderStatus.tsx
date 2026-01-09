import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useChainId } from "wagmi";
import {
  parseOrderContext,
  type OrderContext,
  OrderStatus,
  calculateOrderProgress,
  getOrderStatusText,
} from "~~/utils/cow";
import { getKapanOrderManagerAddress } from "~~/utils/constants";
import { logger } from "~~/utils/logger";

// Minimal ABI for reading order state
const ORDER_MANAGER_READ_ABI = [
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "getOrder",
    outputs: [
      {
        components: [
          {
            components: [
              { name: "user", type: "address" },
              { name: "preInstructionsData", type: "bytes" },
              { name: "preTotalAmount", type: "uint256" },
              { name: "sellToken", type: "address" },
              { name: "buyToken", type: "address" },
              { name: "chunkSize", type: "uint256" },
              { name: "minBuyPerChunk", type: "uint256" },
              { name: "postInstructionsData", type: "bytes" },
              { name: "completion", type: "uint8" },
              { name: "targetValue", type: "uint256" },
              { name: "minHealthFactor", type: "uint256" },
              { name: "appDataHash", type: "bytes32" },
            ],
            name: "params",
            type: "tuple",
          },
          { name: "status", type: "uint8" },
          { name: "executedAmount", type: "uint256" },
          { name: "iterationCount", type: "uint256" },
          { name: "createdAt", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "isOrderComplete",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface OrderStatusInfo {
  /** On-chain order context */
  context: OrderContext | null;
  /** Order status from on-chain */
  status: OrderStatus;
  /** Human-readable status */
  statusText: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Number of completed iterations */
  iterations: number;
  /** Total executed amount (in sell token units) */
  executedAmount: bigint;
  /** Whether order is complete */
  isComplete: boolean;
  /** Whether order is active and tradeable */
  isActive: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh function */
  refetch: () => void;
}

/**
 * Hook to monitor a single CoW order's status
 * 
 * @param orderHash - The Kapan order hash to monitor
 * @param options - Configuration options
 * @returns Order status information
 * 
 * @example
 * ```tsx
 * const { status, progress, isComplete, refetch } = useCowOrderStatus(orderHash);
 * 
 * return (
 *   <div>
 *     <p>Status: {status}</p>
 *     <p>Progress: {progress}%</p>
 *     <button onClick={refetch}>Refresh</button>
 *   </div>
 * );
 * ```
 */
export function useCowOrderStatus(
  orderHash: string | undefined,
  options?: {
    /** Polling interval in ms (default: 10000) */
    pollingInterval?: number;
    /** Whether to poll (default: true if order is active) */
    enabled?: boolean;
  }
): OrderStatusInfo {
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Get order manager address for current chain from deployed contracts
  const orderManagerAddress = useMemo(() => {
    return getKapanOrderManagerAddress(chainId);
  }, [chainId]);

  const pollingInterval = options?.pollingInterval ?? 10000;
  const enabled = options?.enabled ?? true;

  // Query on-chain order state
  const {
    data: orderContext,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["cow-order-status", orderHash, chainId],
    queryFn: async (): Promise<OrderContext | null> => {
      if (!orderHash || !orderManagerAddress || !publicClient) {
        return null;
      }

      try {
        const result = await publicClient.readContract({
          address: orderManagerAddress,
          abi: ORDER_MANAGER_READ_ABI,
          functionName: "getOrder",
          args: [orderHash as `0x${string}`],
        });

        return parseOrderContext(result);
      } catch (err) {
        logger.error("[useCowOrderStatus] Failed to fetch order:", err);
        throw err;
      }
    },
    enabled: !!orderHash && !!orderManagerAddress && !!publicClient && enabled,
    refetchInterval: (query) => {
      // Only poll if order is active
      if (query.state.data && query.state.data.status === OrderStatus.Active) {
        return pollingInterval;
      }
      return false;
    },
    staleTime: 5000,
  });

  // Derived state
  const status = orderContext?.status ?? OrderStatus.None;
  const isComplete = status === OrderStatus.Completed;
  const isActive = status === OrderStatus.Active;
  const progress = orderContext ? calculateOrderProgress(orderContext) : 0;
  const iterations = orderContext ? Number(orderContext.iterationCount) : 0;
  const executedAmount = orderContext?.executedAmount ?? 0n;

  return {
    context: orderContext ?? null,
    status,
    statusText: getOrderStatusText(status),
    progress,
    iterations,
    executedAmount,
    isComplete,
    isActive,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to monitor multiple orders at once
 * 
 * @param orderHashes - Array of order hashes to monitor
 * @returns Map of order hash to status info
 */
export function useCowOrdersStatus(
  orderHashes: string[],
  options?: {
    pollingInterval?: number;
    enabled?: boolean;
  }
): Map<string, OrderStatusInfo> {
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Get order manager address for current chain from deployed contracts
  const orderManagerAddress = useMemo(() => {
    return getKapanOrderManagerAddress(chainId);
  }, [chainId]);

  const pollingInterval = options?.pollingInterval ?? 15000;
  const enabled = options?.enabled ?? true;

  const {
    data: orderContexts,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["cow-orders-status", orderHashes.join(","), chainId],
    queryFn: async (): Promise<Map<string, OrderContext>> => {
      if (!orderManagerAddress || !publicClient || orderHashes.length === 0) {
        return new Map();
      }

      const results = new Map<string, OrderContext>();

      // Batch fetch all orders
      await Promise.all(
        orderHashes.map(async (hash) => {
          try {
            const result = await publicClient.readContract({
              address: orderManagerAddress,
              abi: ORDER_MANAGER_READ_ABI,
              functionName: "getOrder",
              args: [hash as `0x${string}`],
            });
            results.set(hash, parseOrderContext(result));
          } catch (err) {
            logger.warn("[useCowOrdersStatus] Failed to fetch order:", hash, err);
          }
        })
      );

      return results;
    },
    enabled: !!orderManagerAddress && !!publicClient && orderHashes.length > 0 && enabled,
    refetchInterval: pollingInterval,
    staleTime: 5000,
  });

  // Build status map
  const statusMap = new Map<string, OrderStatusInfo>();
  
  for (const hash of orderHashes) {
    const context = orderContexts?.get(hash) ?? null;
    const status = context?.status ?? OrderStatus.None;
    
    statusMap.set(hash, {
      context,
      status,
      statusText: getOrderStatusText(status),
      progress: context ? calculateOrderProgress(context) : 0,
      iterations: context ? Number(context.iterationCount) : 0,
      executedAmount: context?.executedAmount ?? 0n,
      isComplete: status === OrderStatus.Completed,
      isActive: status === OrderStatus.Active,
      isLoading,
      error: error as Error | null,
      refetch,
    });
  }

  return statusMap;
}

/**
 * Hook to listen for order events (real-time updates)
 * Uses contract events for immediate feedback
 */
export function useCowOrderEvents(
  orderHash: string | undefined,
  callbacks?: {
    onChunkExecuted?: (chunkIndex: number, sellAmount: bigint, buyAmount: bigint) => void;
    onOrderCompleted?: (totalExecuted: bigint) => void;
    onOrderCancelled?: () => void;
  }
) {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const queryClient = useQueryClient();

  // Get order manager address for current chain from deployed contracts
  const orderManagerAddress = useMemo(() => {
    return getKapanOrderManagerAddress(chainId);
  }, [chainId]);

  useEffect(() => {
    if (!orderHash || !orderManagerAddress || !publicClient) return;

    // Watch for ChunkExecuted events
    const unwatchChunk = publicClient.watchContractEvent({
      address: orderManagerAddress,
      abi: [
        {
          type: "event",
          name: "ChunkExecuted",
          inputs: [
            { name: "orderHash", type: "bytes32", indexed: true },
            { name: "chunkIndex", type: "uint256", indexed: false },
            { name: "sellAmount", type: "uint256", indexed: false },
            { name: "buyAmount", type: "uint256", indexed: false },
          ],
        },
      ],
      eventName: "ChunkExecuted",
      args: { orderHash: orderHash as `0x${string}` },
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as any;
          callbacks?.onChunkExecuted?.(
            Number(args.chunkIndex),
            args.sellAmount,
            args.buyAmount
          );
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["cow-order-status", orderHash] });
        }
      },
    });

    // Watch for OrderCompleted events
    const unwatchComplete = publicClient.watchContractEvent({
      address: orderManagerAddress,
      abi: [
        {
          type: "event",
          name: "OrderCompleted",
          inputs: [
            { name: "orderHash", type: "bytes32", indexed: true },
            { name: "user", type: "address", indexed: true },
            { name: "totalExecuted", type: "uint256", indexed: false },
          ],
        },
      ],
      eventName: "OrderCompleted",
      args: { orderHash: orderHash as `0x${string}` },
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as any;
          callbacks?.onOrderCompleted?.(args.totalExecuted);
          queryClient.invalidateQueries({ queryKey: ["cow-order-status", orderHash] });
          queryClient.invalidateQueries({ queryKey: ["cow-orders"] });
        }
      },
    });

    // Watch for OrderCancelled events
    const unwatchCancel = publicClient.watchContractEvent({
      address: orderManagerAddress,
      abi: [
        {
          type: "event",
          name: "OrderCancelled",
          inputs: [
            { name: "orderHash", type: "bytes32", indexed: true },
            { name: "user", type: "address", indexed: true },
          ],
        },
      ],
      eventName: "OrderCancelled",
      args: { orderHash: orderHash as `0x${string}` },
      onLogs: () => {
        callbacks?.onOrderCancelled?.();
        queryClient.invalidateQueries({ queryKey: ["cow-order-status", orderHash] });
        queryClient.invalidateQueries({ queryKey: ["cow-orders"] });
      },
    });

    return () => {
      unwatchChunk();
      unwatchComplete();
      unwatchCancel();
    };
  }, [orderHash, orderManagerAddress, publicClient, callbacks, queryClient]);
}
