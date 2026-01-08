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
import { OrderStatus, calculateExecutionSummary } from "~~/utils/cow";
import type { OrderContext } from "~~/utils/cow";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getOrderNote, getOperationLabel, getOperationColorClass, findPendingNoteForOrder, linkNoteToOrderHash, type OperationType } from "~~/utils/orderNotes";
import { getProtocolLogo } from "~~/utils/protocol";

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

function formatDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(timestamp: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(timestamp);
}

interface OrderWithHash {
  orderHash: string;
  context: OrderContext;
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

  const getTokenSymbol = (address: string): string => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
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
        <div className="max-w-5xl mx-auto text-center py-20">
          <h1 className="text-3xl font-bold mb-4">Orders</h1>
          <p className="text-base-content/50">Connect your wallet to view your orders</p>
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="min-h-screen px-4 py-12 md:px-8 lg:px-16">
        <div className="max-w-5xl mx-auto text-center py-20">
          <h1 className="text-3xl font-bold mb-4">Orders</h1>
          <p className="text-base-content/50">Limit orders are not available on this chain</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 lg:px-16">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button 
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-base-content/50 hover:text-base-content transition-colors text-sm mb-6"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              className="p-2 hover:bg-base-200 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-base-content/50 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-base-content/50 text-lg">No orders found</p>
            <p className="text-base-content/40 text-sm mt-2">Create a limit order from the Multiply modal</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Orders */}
            {activeOrders.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-base-content/50 uppercase tracking-wide mb-4">
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
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Orders */}
            {completedOrders.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-base-content/50 uppercase tracking-wide mb-4">
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
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Cancelled Orders */}
            {cancelledOrders.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-base-content/50 uppercase tracking-wide mb-4">
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
  dimmed = false 
}: { 
  order: OrderWithHash;
  executionDataMap: Map<string, any>;
  getTokenSymbol: (address: string) => string;
  getTokenDecimals: (address: string) => number;
  chainId: number;
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

  const executionData = executionDataMap.get(orderHash);
  const hasExecutionData = executionData && executionData.chunks.length > 0;
  const executionSummary = hasExecutionData
    ? calculateExecutionSummary(executionData, params.minBuyPerChunk, sellDecimals, buyDecimals)
    : null;
  
  const totalReceived = executionData?.totalReceived ?? 0n;
  const hasSurplus = executionSummary && executionSummary.surplusAmount > 0n;
  
  const receivedAmountNum = parseFloat(formatUnits(totalReceived, buyDecimals));

  // Look up order note by orderHash for operation type
  // First try direct lookup, then try to match pending notes by order parameters
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
  
  const operationType: OperationType = orderNote?.operationType ?? "unknown";
  const operationLabel = getOperationLabel(operationType);
  const operationColorClass = getOperationColorClass(operationType);
  const protocolName = orderNote?.protocol;
  const protocolLogo = protocolName ? getProtocolLogo(protocolName) : null;

  return (
    <Link 
      href={`/orders/${orderHash}`}
      className={`block p-4 rounded-lg border border-base-200 hover:border-base-300 hover:bg-base-100/50 transition-all ${dimmed ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Token pair and progress */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center -space-x-2 flex-shrink-0">
            <Image src={tokenNameToLogo(sellSymbol)} alt={sellSymbol} width={32} height={32} className="rounded-full ring-2 ring-base-100" />
            <Image src={tokenNameToLogo(buySymbol)} alt={buySymbol} width={32} height={32} className="rounded-full ring-2 ring-base-100" />
          </div>
          
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Operation type badge */}
              {operationType !== "unknown" && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${operationColorClass}`}>
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
                  <span className="text-xs text-base-content/40">{protocolName}</span>
                </div>
              )}
              {/* Token pair */}
              <span className="font-semibold">{sellSymbol} → {buySymbol}</span>
              {/* Status badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                isActive ? 'bg-warning/20 text-warning' :
                isCompleted ? 'bg-success/20 text-success' :
                'bg-error/20 text-error'
              }`}>
                {isActive ? 'Active' : isCompleted ? 'Completed' : 'Cancelled'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-base-content/50">
              <span>{formatAmount(params.preTotalAmount, sellDecimals)} {sellSymbol}</span>
              <span>·</span>
              <span>{completedChunks}/{totalChunks} chunks</span>
              <span>·</span>
              <span>{timeAgo(createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Right: Amounts */}
        <div className="text-right flex-shrink-0">
          {hasExecutionData ? (
            <>
              <div className="font-semibold text-success">
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
          <div className="h-1 bg-base-200 w-full">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
