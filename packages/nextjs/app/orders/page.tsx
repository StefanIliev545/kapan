"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAccount, useChainId } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useCowOrder } from "~~/hooks/useCowOrder";
import { useMultipleChunkExecutedEvents } from "~~/hooks/useChunkExecutedEvents";
import { useTokenInfo } from "~~/hooks/useTokenInfo";
import { useTokenPriceApi } from "~~/hooks/useTokenPriceApi";
import { OrderStatus, calculateExecutionSummary, fetchAppData, parseOperationTypeFromAppCode, type KapanOperationType } from "~~/utils/cow";
import type { OrderContext } from "~~/utils/cow";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getOrderNote, getOperationLabel, getOperationColorClass, findPendingNoteForOrder, linkNoteToOrderHash, type OperationType } from "~~/utils/orderNotes";
import { getProtocolLogo } from "~~/utils/protocol";
import { LoadingOverlay } from "~~/components/common/Loading";
import { timeAgo } from "~~/utils/deadline";
import { truncateAddress } from "~~/utils/address";

function formatAmount(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatUsd(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(2)}`;
}

interface OrderWithHash {
  orderHash: string;
  context: OrderContext;
}

/**
 * Map KapanOperationType to OperationType for display
 */
function mapKapanOperationType(kapanType: KapanOperationType): OperationType {
  switch (kapanType) {
    case "leverage-up": return "leverage_up";
    case "close-position": return "close_position";
    case "debt-swap": return "debt_swap";
    case "collateral-swap": return "collateral_swap";
  }
}

/**
 * Hook to fetch operation types from appData for multiple orders
 * Returns a map of orderHash -> OperationType
 */
function useAppDataOperationTypes(orders: OrderWithHash[], chainId: number): Map<string, OperationType> {
  const [operationTypes, setOperationTypes] = useState<Map<string, OperationType>>(new Map());

  useEffect(() => {
    if (orders.length === 0) return;

    const fetchTypes = async () => {
      const newTypes = new Map<string, OperationType>();

      // Fetch appData for each order that has an appDataHash
      await Promise.all(
        orders.map(async ({ orderHash, context }) => {
          const appDataHash = context.params.appDataHash;
          if (!appDataHash || appDataHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
            return;
          }

          try {
            const appData = await fetchAppData(chainId, appDataHash);
            if (appData) {
              const kapanType = parseOperationTypeFromAppCode(appData.appCode);
              if (kapanType) {
                newTypes.set(orderHash, mapKapanOperationType(kapanType));
              }
            }
          } catch {
            // Silently ignore fetch errors - will fall back to localStorage
          }
        })
      );

      if (newTypes.size > 0) {
        setOperationTypes(prev => {
          const merged = new Map(prev);
          newTypes.forEach((value, key) => merged.set(key, value));
          return merged;
        });
      }
    };

    fetchTypes();
  }, [orders, chainId]);

  return operationTypes;
}

function UsdValue({ symbol, amount }: { symbol: string; amount: number }) {
  const priceData = useTokenPriceApi(symbol);
  const price = priceData.isSuccess ? (priceData as { price: number }).price : undefined;
  if (!price) return null;
  return <span className="text-base-content/40">{formatUsd(amount * price)}</span>;
}

export default function OrdersPage() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const { getUserOrdersWithDetails, isAvailable } = useCowOrder();
  
  const [orders, setOrders] = useState<OrderWithHash[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!userAddress || !isAvailable) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const userOrders = await getUserOrdersWithDetails();
      // Sort by createdAt descending (newest first)
      userOrders.sort((a, b) => Number(b.context.createdAt) - Number(a.context.createdAt));
      setOrders(userOrders);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isAvailable, getUserOrdersWithDetails]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const ordersForEvents = useMemo(() => 
    orders.map(o => ({
      orderHash: o.orderHash,
      isComplete: o.context.status === OrderStatus.Completed,
    })),
    [orders]
  );

  const executionDataMap = useMultipleChunkExecutedEvents(ordersForEvents);

  const tokenAddresses = useMemo(() => {
    const addresses = new Set<Address>();
    orders.forEach(o => {
      addresses.add(o.context.params.sellToken as Address);
      addresses.add(o.context.params.buyToken as Address);
    });
    return Array.from(addresses);
  }, [orders]);

  const tokenInfoMap = useTokenInfo(tokenAddresses, chainId);

  // Fetch operation types from appData (falls back to localStorage notes in OrderRow)
  const appDataOperationTypes = useAppDataOperationTypes(orders, chainId);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  const getTokenSymbol = (address: string): string => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.symbol ?? truncateAddress(address);
  };

  const getTokenDecimals = (address: string): number => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.decimals ?? 18;
  };

  // Group orders by status
  const activeOrders = orders.filter(o => o.context.status === OrderStatus.Active);
  const completedOrders = orders.filter(o => o.context.status === OrderStatus.Completed);
  const cancelledOrders = orders.filter(o => o.context.status === OrderStatus.Cancelled);

  if (!userAddress) {
    return (
      <div className="min-h-screen px-4 py-12 md:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl py-20 text-center">
          <h1 className="mb-4 text-3xl font-bold">Orders</h1>
          <p className="text-base-content/50">Connect your wallet to view your orders</p>
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="min-h-screen px-4 py-12 md:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl py-20 text-center">
          <h1 className="mb-4 text-3xl font-bold">Orders</h1>
          <p className="text-base-content/50">Limit orders are not available on this chain</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="text-base-content/50 hover:text-base-content mb-6 inline-flex items-center gap-2 text-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Orders</h1>
              <p className="text-base-content/50 mt-1">
                {orders.length} total · {activeOrders.length} active
              </p>
            </div>
            <button 
              onClick={fetchOrders}
              disabled={isLoading}
              className="hover:bg-base-200 rounded-lg p-2 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`text-base-content/50 size-5${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading && orders.length === 0 ? (
          <LoadingOverlay size="lg" label="Loading orders..." />
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-base-content/50 text-lg">No orders found</p>
            <p className="text-base-content/40 mt-2 text-sm">Create a limit order from the Multiply modal</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Orders */}
            {activeOrders.length > 0 && (
              <section>
                <h2 className="text-base-content/50 mb-4 text-sm font-medium uppercase tracking-wide">
                  Active ({activeOrders.length})
                </h2>
                <div className="space-y-3">
                  {activeOrders.map((order) => (
                    <OrderRow
                      key={order.orderHash}
                      order={order}
                      executionDataMap={executionDataMap}
                      getTokenSymbol={getTokenSymbol}
                      getTokenDecimals={getTokenDecimals}
                      chainId={chainId}
                      appDataOperationType={appDataOperationTypes.get(order.orderHash)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Orders */}
            {completedOrders.length > 0 && (
              <section>
                <h2 className="text-base-content/50 mb-4 text-sm font-medium uppercase tracking-wide">
                  Completed ({completedOrders.length})
                </h2>
                <div className="space-y-3">
                  {completedOrders.map((order) => (
                    <OrderRow
                      key={order.orderHash}
                      order={order}
                      executionDataMap={executionDataMap}
                      getTokenSymbol={getTokenSymbol}
                      getTokenDecimals={getTokenDecimals}
                      chainId={chainId}
                      appDataOperationType={appDataOperationTypes.get(order.orderHash)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Cancelled Orders */}
            {cancelledOrders.length > 0 && (
              <section>
                <h2 className="text-base-content/50 mb-4 text-sm font-medium uppercase tracking-wide">
                  Cancelled ({cancelledOrders.length})
                </h2>
                <div className="space-y-3">
                  {cancelledOrders.map((order) => (
                    <OrderRow
                      key={order.orderHash}
                      order={order}
                      executionDataMap={executionDataMap}
                      getTokenSymbol={getTokenSymbol}
                      getTokenDecimals={getTokenDecimals}
                      chainId={chainId}
                      appDataOperationType={appDataOperationTypes.get(order.orderHash)}
                      dimmed
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  executionDataMap,
  getTokenSymbol,
  getTokenDecimals,
  chainId,
  appDataOperationType,
  dimmed = false
}: {
  order: OrderWithHash;
  executionDataMap: Map<string, any>;
  getTokenSymbol: (address: string) => string;
  getTokenDecimals: (address: string) => number;
  chainId: number;
  appDataOperationType?: OperationType;
  dimmed?: boolean;
}) {
  const { orderHash, context } = order;
  const { params, status, iterationCount, createdAt } = context;
  
  const isActive = status === OrderStatus.Active;
  const isCompleted = status === OrderStatus.Completed;
  
  const sellSymbol = getTokenSymbol(params.sellToken);
  const buySymbol = getTokenSymbol(params.buyToken);
  const sellDecimals = getTokenDecimals(params.sellToken);
  const buyDecimals = getTokenDecimals(params.buyToken);
  
  const totalChunks = Number(params.targetValue);
  const completedChunks = Number(iterationCount);
  const progressPercent = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;

  // Memoize style object to avoid creating new object on each render
  const progressBarStyle = useMemo(() => ({ width: `${progressPercent}%` }), [progressPercent]);

  const executionData = executionDataMap.get(orderHash);
  const hasExecutionData = executionData && executionData.chunks.length > 0;
  const executionSummary = hasExecutionData
    ? calculateExecutionSummary(executionData, params.minBuyPerChunk, sellDecimals, buyDecimals)
    : null;
  
  const totalReceived = executionData?.totalReceived ?? 0n;
  const hasSurplus = executionSummary && executionSummary.surplusAmount > 0n;
  
  const receivedAmountNum = parseFloat(formatUnits(totalReceived, buyDecimals));

  // Determine operation type:
  // 1. First try appData (derived from on-chain appDataHash)
  // 2. Fall back to localStorage notes
  let orderNote = getOrderNote(orderHash);

  // If no note found, try to find and link a pending note
  if (!orderNote) {
    const pendingNote = findPendingNoteForOrder(
      sellSymbol,
      buySymbol,
      chainId,
      Number(createdAt)
    );

    if (pendingNote && pendingNote.salt) {
      // Link the pending note to this orderHash for future lookups
      linkNoteToOrderHash(pendingNote.salt, orderHash);
      orderNote = pendingNote;
    }
  }

  // Prefer appData-derived type, fall back to localStorage note, then "unknown"
  const operationType: OperationType = appDataOperationType ?? orderNote?.operationType ?? "unknown";
  const operationLabel = getOperationLabel(operationType);
  const operationColorClass = getOperationColorClass(operationType);
  const protocolName = orderNote?.protocol;
  const protocolLogo = protocolName ? getProtocolLogo(protocolName) : null;

  return (
    <Link 
      href={`/orders/${orderHash}`}
      className={`border-base-200 hover:border-base-300 hover:bg-base-100/50 block rounded-lg border p-4 transition-all ${dimmed ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Token pair and progress */}
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex flex-shrink-0 items-center -space-x-2">
            <Image src={tokenNameToLogo(sellSymbol)} alt={sellSymbol} width={32} height={32} className="ring-base-100 rounded-full ring-2" />
            <Image src={tokenNameToLogo(buySymbol)} alt={buySymbol} width={32} height={32} className="ring-base-100 rounded-full ring-2" />
          </div>
          
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Operation type badge */}
              {operationType !== "unknown" && (
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${operationColorClass}`}>
                  {operationLabel}
                </span>
              )}
              {/* Protocol with icon */}
              {protocolName && (
                <div className="flex items-center gap-1">
                  {protocolLogo && (
                    <Image 
                      src={protocolLogo} 
                      alt={protocolName} 
                      width={14} 
                      height={14} 
                      className="rounded-sm"
                    />
                  )}
                  <span className="text-base-content/40 text-xs">{protocolName}</span>
                </div>
              )}
              {/* Token pair */}
              <span className="font-semibold">{sellSymbol} → {buySymbol}</span>
              {/* Status badge */}
              <span className={`rounded px-1.5 py-0.5 text-xs ${
                isActive ? 'bg-warning/20 text-warning' :
                isCompleted ? 'bg-success/20 text-success' :
                'bg-error/20 text-error'
              }`}>
                {isActive ? 'Active' : isCompleted ? 'Completed' : 'Cancelled'}
              </span>
            </div>
            <div className="text-base-content/50 mt-1 flex items-center gap-3 text-sm">
              <span>{formatAmount(params.preTotalAmount, sellDecimals)} {sellSymbol}</span>
              <span>·</span>
              <span>{completedChunks}/{totalChunks} chunks</span>
              <span>·</span>
              <span>{timeAgo(createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Right: Amounts */}
        <div className="flex-shrink-0 text-right">
          {hasExecutionData ? (
            <>
              <div className="text-success font-semibold">
                {formatAmount(totalReceived, buyDecimals)} {buySymbol}
              </div>
              <div className="text-sm">
                <UsdValue symbol={buySymbol} amount={receivedAmountNum} />
                {hasSurplus && executionSummary && (
                  <span className="text-success ml-2">+{executionSummary.surplusPercentage.toFixed(1)}%</span>
                )}
              </div>
            </>
          ) : (
            <div className="text-base-content/40">-</div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="mt-3">
          <div className="bg-base-200 h-1 w-full">
            <div
              className="bg-primary h-full transition-all"
              style={progressBarStyle}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
