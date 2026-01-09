import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { type Address, type PublicClient } from "viem";
import { getKapanOrderManagerAddress } from "~~/utils/constants";
import { logger } from "~~/utils/logger";

// ChunkExecuted event ABI
const CHUNK_EXECUTED_EVENT_ABI = [
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
] as const;

export interface ChunkExecution {
  chunkIndex: number;
  sellAmount: bigint;
  buyAmount: bigint;
  txHash: string;
  blockNumber: bigint;
}

export interface OrderExecutionData {
  orderHash: string;
  chunks: ChunkExecution[];
  totalSold: bigint;
  totalReceived: bigint;
  fetchedAt: number;
}

interface CachedExecutionData extends OrderExecutionData {
  chainId: number;
  isComplete: boolean;
}

// Cache TTL: 5 minutes for active orders, indefinite for completed
const ACTIVE_ORDER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(chainId: number, orderHash: string): string {
  return `kapan-order-events-${chainId}-${orderHash.toLowerCase()}`;
}

function getFromCache(chainId: number, orderHash: string): CachedExecutionData | null {
  if (typeof window === "undefined") return null;
  
  try {
    const key = getCacheKey(chainId, orderHash);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const data = JSON.parse(cached) as CachedExecutionData;
    
    // Convert bigint strings back to bigint
    data.totalSold = BigInt(data.totalSold);
    data.totalReceived = BigInt(data.totalReceived);
    data.chunks = data.chunks.map(chunk => ({
      ...chunk,
      sellAmount: BigInt(chunk.sellAmount),
      buyAmount: BigInt(chunk.buyAmount),
      blockNumber: BigInt(chunk.blockNumber),
    }));
    
    // Check TTL for active orders
    if (!data.isComplete) {
      const age = Date.now() - data.fetchedAt;
      if (age > ACTIVE_ORDER_CACHE_TTL) {
        return null; // Cache expired
      }
    }
    
    return data;
  } catch (e) {
    logger.warn("[useChunkExecutedEvents] Failed to parse cache:", e);
    return null;
  }
}

function saveToCache(chainId: number, orderHash: string, data: OrderExecutionData, isComplete: boolean): void {
  if (typeof window === "undefined") return;
  
  try {
    const key = getCacheKey(chainId, orderHash);
    const cacheData: CachedExecutionData = {
      ...data,
      chainId,
      isComplete,
      // Convert bigint to string for JSON serialization
      totalSold: data.totalSold.toString() as unknown as bigint,
      totalReceived: data.totalReceived.toString() as unknown as bigint,
      chunks: data.chunks.map(chunk => ({
        ...chunk,
        sellAmount: chunk.sellAmount.toString() as unknown as bigint,
        buyAmount: chunk.buyAmount.toString() as unknown as bigint,
        blockNumber: chunk.blockNumber.toString() as unknown as bigint,
      })),
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (e) {
    logger.warn("[useChunkExecutedEvents] Failed to save cache:", e);
  }
}

/**
 * Fetch ChunkExecuted events for an order from the blockchain
 */
async function fetchChunkExecutedEvents(
  publicClient: PublicClient,
  orderManagerAddress: Address,
  orderHash: string,
): Promise<ChunkExecution[]> {
  try {
    const logs = await publicClient.getLogs({
      address: orderManagerAddress,
      event: CHUNK_EXECUTED_EVENT_ABI[0],
      args: {
        orderHash: orderHash as `0x${string}`,
      },
      fromBlock: "earliest",
      toBlock: "latest",
    });

    return logs.map(log => ({
      chunkIndex: Number(log.args.chunkIndex),
      sellAmount: log.args.sellAmount ?? 0n,
      buyAmount: log.args.buyAmount ?? 0n,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    }));
  } catch (e) {
    logger.error("[fetchChunkExecutedEvents] Failed to fetch events:", e);
    return [];
  }
}

/**
 * Hook to get chunk execution events for an order with caching
 */
export function useChunkExecutedEvents(
  orderHash: string | undefined,
  options?: {
    /** Whether the order is complete (affects cache TTL) */
    isComplete?: boolean;
    /** Force refresh from chain */
    forceRefresh?: boolean;
  }
): {
  data: OrderExecutionData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  // Get order manager address from deployed contracts
  const orderManagerAddress = getKapanOrderManagerAddress(chainId);

  const [data, setData] = useState<OrderExecutionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!orderHash || !publicClient || !orderManagerAddress) {
      setData(null);
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getFromCache(chainId, orderHash);
      if (cached) {
        setData(cached);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const chunks = await fetchChunkExecutedEvents(publicClient, orderManagerAddress, orderHash);
      
      const executionData: OrderExecutionData = {
        orderHash,
        chunks: chunks.sort((a, b) => a.chunkIndex - b.chunkIndex),
        totalSold: chunks.reduce((sum, c) => sum + c.sellAmount, 0n),
        totalReceived: chunks.reduce((sum, c) => sum + c.buyAmount, 0n),
        fetchedAt: Date.now(),
      };

      // Save to cache
      saveToCache(chainId, orderHash, executionData, options?.isComplete ?? false);
      
      setData(executionData);
    } catch (e) {
      setError(e as Error);
      logger.error("[useChunkExecutedEvents] Fetch failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [orderHash, publicClient, orderManagerAddress, chainId, options?.isComplete]);

  // Initial fetch
  useEffect(() => {
    fetchData(options?.forceRefresh);
  }, [fetchData, options?.forceRefresh]);

  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return { data, isLoading, error, refetch };
}

/**
 * Hook to get chunk execution events for multiple orders (batched)
 */
export function useMultipleChunkExecutedEvents(
  orders: Array<{ orderHash: string; isComplete: boolean }>,
): Map<string, OrderExecutionData> {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  // Get order manager address from deployed contracts
  const orderManagerAddress = getKapanOrderManagerAddress(chainId);

  const [dataMap, setDataMap] = useState<Map<string, OrderExecutionData>>(new Map());

  useEffect(() => {
    if (!publicClient || !orderManagerAddress || orders.length === 0) {
      return;
    }

    const fetchAll = async () => {
      const results = new Map<string, OrderExecutionData>();

      for (const { orderHash, isComplete } of orders) {
        // Check cache first
        const cached = getFromCache(chainId, orderHash);
        if (cached) {
          results.set(orderHash, cached);
          continue;
        }

        // Fetch from chain
        try {
          const chunks = await fetchChunkExecutedEvents(publicClient, orderManagerAddress, orderHash);
          
          const executionData: OrderExecutionData = {
            orderHash,
            chunks: chunks.sort((a, b) => a.chunkIndex - b.chunkIndex),
            totalSold: chunks.reduce((sum, c) => sum + c.sellAmount, 0n),
            totalReceived: chunks.reduce((sum, c) => sum + c.buyAmount, 0n),
            fetchedAt: Date.now(),
          };

          saveToCache(chainId, orderHash, executionData, isComplete);
          results.set(orderHash, executionData);
        } catch (e) {
          logger.warn("[useMultipleChunkExecutedEvents] Failed to fetch:", orderHash, e);
        }
      }

      setDataMap(results);
    };

    fetchAll();
  }, [publicClient, orderManagerAddress, chainId, orders]);

  return dataMap;
}
