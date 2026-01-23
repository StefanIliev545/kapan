import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId } from "wagmi";

export type OrderType = "collateral_swap" | "debt_swap" | "leverage_up" | "close_position" | "unknown";
export type OrderStatus = "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "expired";

export interface Order {
  id: string;
  orderUid: string;
  orderHash: string | null;
  salt: string | null;
  userAddress: string;
  chainId: number;
  orderType: OrderType;
  protocol: string | null;
  sellToken: string;
  buyToken: string;
  sellTokenSymbol: string | null;
  buyTokenSymbol: string | null;
  sellAmount: string;
  buyAmount: string;
  filledSellAmount: string | null;
  filledBuyAmount: string | null;
  status: OrderStatus;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFill {
  id: string;
  orderId: string;
  txHash: string;
  fillSellAmount: string;
  fillBuyAmount: string;
  executionPrice: string | null;
  filledAt: string;
}

interface SaveOrderParams {
  orderUid: string;
  /** On-chain order hash from OrderCreated event - used for webhook matching */
  orderHash?: string;
  salt?: string;
  userAddress: string;
  chainId: number;
  orderType?: OrderType;
  protocol?: string;
  sellToken: string;
  buyToken: string;
  sellTokenSymbol?: string;
  buyTokenSymbol?: string;
  sellAmount: string;
  buyAmount: string;
  validTo?: Date;
}

/**
 * Hook for fetching user's order history
 */
export function useOrderHistory(options?: { chainId?: number; enabled?: boolean }) {
  const { address } = useAccount();
  const currentChainId = useChainId();
  const chainId = options?.chainId ?? currentChainId;

  return useQuery({
    queryKey: ["orders", address, chainId],
    queryFn: async (): Promise<Order[]> => {
      if (!address) return [];

      const params = new URLSearchParams({ wallet: address });
      if (chainId) params.append("chainId", chainId.toString());

      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }

      const data = await response.json();
      return data.orders;
    },
    enabled: options?.enabled !== false && !!address,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook for fetching a single order with its fills
 */
export function useOrder(orderUid: string | undefined) {
  return useQuery({
    queryKey: ["order", orderUid],
    queryFn: async (): Promise<{ order: Order; fills: OrderFill[] }> => {
      const response = await fetch(`/api/orders/${orderUid}`);
      if (!response.ok) {
        throw new Error("Failed to fetch order");
      }
      return response.json();
    },
    enabled: !!orderUid,
    staleTime: 10_000, // 10 seconds
  });
}

/**
 * Hook for saving a new order
 */
export function useSaveOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveOrderParams) => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          validTo: params.validTo?.toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save order");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate order history cache
      queryClient.invalidateQueries({
        queryKey: ["orders", variables.userAddress.toLowerCase()],
      });
    },
  });
}

/**
 * Hook for updating order status
 */
export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderUid,
      ...updates
    }: {
      orderUid: string;
      status?: OrderStatus;
      filledSellAmount?: string;
      filledBuyAmount?: string;
      fill?: {
        txHash: string;
        fillSellAmount: string;
        fillBuyAmount: string;
        executionPrice?: string;
      };
    }) => {
      const response = await fetch(`/api/orders/${orderUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update order");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderUid] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
