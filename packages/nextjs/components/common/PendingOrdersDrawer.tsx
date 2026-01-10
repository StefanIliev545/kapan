"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAccount, useChainId } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { useCowOrder } from "~~/hooks/useCowOrder";
import { useMultipleChunkExecutedEvents, useWatchChunkExecuted } from "~~/hooks/useChunkExecutedEvents";
import { useTokenInfo } from "~~/hooks/useTokenInfo";
import { useTokenPriceApi } from "~~/hooks/useTokenPriceApi";
import { OrderStatus, calculateExecutionSummary } from "~~/utils/cow";
import type { OrderContext } from "~~/utils/cow";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import {
  getOrderNote,
  findPendingNoteForOrder,
  linkNoteToOrderHash,
  getOperationLabel,
  getOperationColorClass,
  ORDER_CREATED_EVENT,
  type OrderNote,
} from "~~/utils/orderNotes";
import { getProtocolLogo } from "~~/utils/protocol";
import { timeAgo } from "~~/utils/deadline";
import { truncateAddress } from "~~/utils/address";
import { useIntervalWhen } from "~~/hooks/common";

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

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

interface OrderWithHash {
  orderHash: string;
  context: OrderContext;
}

// Component to fetch and display USD value
function UsdValue({ symbol, amount }: { symbol: string; amount: number }) {
  const priceData = useTokenPriceApi(symbol);
  const price = priceData.isSuccess ? (priceData as { price: number }).price : undefined;
  
  if (!price) return null;
  const usdValue = amount * price;
  return <span className="text-base-content/40">{formatUsd(usdValue)}</span>;
}

export function PendingOrdersDrawer() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const { getUserOrdersWithDetails, cancelOrder, isCancelling, isAvailable } = useCowOrder();

  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<OrderWithHash[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingHash, setCancellingHash] = useState<string | null>(null);

  // Track previous order states to detect progress/completion
  const prevOrderStates = useRef<Map<string, { status: number; iterations: bigint }>>(new Map());

  // Track which user+chain combo we've fetched for to detect changes
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const currentKey = userAddress && chainId ? `${userAddress}-${chainId}` : null;
  const hasFetched = fetchedFor === currentKey;

  // Refresh protocol data when orders progress or complete
  const refreshProtocolData = useCallback(() => {
    console.log("[PendingOrdersDrawer] Order state changed, refreshing protocol data...");
    Promise.all([
      queryClient.refetchQueries({ queryKey: ['readContract'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['readContracts'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['balance'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['token'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['morpho-positions'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['morpho-markets-support'], type: 'active' }),
    ]).catch(e => console.warn("[PendingOrdersDrawer] Refetch error:", e));

    // Also dispatch txCompleted event for any other listeners
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("txCompleted"));
    }
  }, [queryClient]);

  const fetchOrders = useCallback(async () => {
    if (!userAddress || !isAvailable || !currentKey) return;
    setIsLoading(true);
    try {
      const userOrders = await getUserOrdersWithDetails();

      // Check if any order progressed or completed
      let hasChanges = false;
      for (const order of userOrders) {
        const prev = prevOrderStates.current.get(order.orderHash);
        if (prev) {
          const statusChanged = prev.status !== order.context.status;
          const iterationsIncreased = order.context.iterationCount > prev.iterations;
          if (statusChanged || iterationsIncreased) {
            hasChanges = true;
            console.log(`[PendingOrdersDrawer] Order ${order.orderHash.slice(0, 10)}... changed:`, {
              statusChanged,
              iterationsIncreased,
              oldStatus: prev.status,
              newStatus: order.context.status,
              oldIterations: prev.iterations.toString(),
              newIterations: order.context.iterationCount.toString(),
            });
          }
        }
        // Update tracked state
        prevOrderStates.current.set(order.orderHash, {
          status: order.context.status,
          iterations: order.context.iterationCount,
        });
      }

      // Refresh protocol data if any order changed
      if (hasChanges) {
        refreshProtocolData();
      }

      setOrders(userOrders);
      setFetchedFor(currentKey);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      setFetchedFor(currentKey); // Mark as fetched even on error to prevent infinite retries
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isAvailable, getUserOrdersWithDetails, currentKey, refreshProtocolData]);

  // Reset state when user or chain changes
  useEffect(() => {
    if (currentKey !== fetchedFor) {
      setOrders([]);
      setIsOpen(false);
    }
  }, [currentKey, fetchedFor]);

  // Fetch on mount or when user/chain changes
  useEffect(() => {
    if (userAddress && isAvailable && !hasFetched) {
      fetchOrders();
    }
  }, [userAddress, isAvailable, hasFetched, fetchOrders]);

  // Auto-refresh when drawer is open
  useIntervalWhen(fetchOrders, 15000, isOpen);

  // Listen for new order created events and refetch
  useEffect(() => {
    const handleOrderCreated = () => {
      // Small delay to allow the order to be indexed
      setTimeout(() => {
        fetchOrders();
      }, 2000);
    };

    window.addEventListener(ORDER_CREATED_EVENT, handleOrderCreated);
    return () => window.removeEventListener(ORDER_CREATED_EVENT, handleOrderCreated);
  }, [fetchOrders]);

  const handleCancel = useCallback(async (orderHash: string) => {
    setCancellingHash(orderHash);
    const success = await cancelOrder(orderHash);
    setCancellingHash(null);
    if (success) await fetchOrders();
  }, [cancelOrder, fetchOrders]);

  // Toggle drawer open/close
  const toggleDrawer = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // Close drawer
  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Filter to recent orders (past 7 days), exclude cancelled, sort newest first
  const now = Math.floor(Date.now() / 1000);

  const recentOrders = useMemo(() => {
    return orders
      .filter(o => now - Number(o.context.createdAt) < SEVEN_DAYS_SECONDS)
      .filter(o => o.context.status !== OrderStatus.Cancelled) // Exclude cancelled orders
      .sort((a, b) => Number(b.context.createdAt) - Number(a.context.createdAt));
  }, [orders, now]);
  
  const hasOlderOrders = orders.length > recentOrders.length;
  const activeOrders = recentOrders.filter(o => o.context.status === OrderStatus.Active);
  const pastOrders = recentOrders.filter(o => o.context.status !== OrderStatus.Active);
  const activeCount = activeOrders.length;

  // Get active order hashes for live event watching
  const activeOrderHashes = useMemo(
    () => activeOrders.map(o => o.orderHash),
    [activeOrders]
  );

  // Watch for live ChunkExecuted events and refresh when chunks fill
  const handleChunkExecuted = useCallback((orderHash: string, chunkIndex: number) => {
    console.log(`[PendingOrdersDrawer] Chunk ${chunkIndex} filled for order ${orderHash.slice(0, 10)}...`);
    // Refetch orders to get updated iteration counts
    fetchOrders();
    // Also refresh protocol data since positions changed
    refreshProtocolData();
  }, [fetchOrders, refreshProtocolData]);

  useWatchChunkExecuted(activeOrderHashes, handleChunkExecuted, activeCount > 0);

  const ordersForEvents = useMemo(() =>
    recentOrders.map(o => ({
      orderHash: o.orderHash,
      isComplete: o.context.status === OrderStatus.Completed,
    })),
    [recentOrders]
  );

  // Memoized cancel handlers for each order
  const cancelHandlers = useMemo(() => {
    return recentOrders.reduce<Record<string, () => void>>((acc, order) => {
      acc[order.orderHash] = () => handleCancel(order.orderHash);
      return acc;
    }, {});
  }, [recentOrders, handleCancel]);

  // Memoized progress bar styles for each order
  const progressStyles = useMemo(() => {
    return recentOrders.reduce<Record<string, React.CSSProperties>>((acc, order) => {
      const totalChunks = Number(order.context.params.targetValue);
      const completedChunks = Number(order.context.iterationCount);
      const progressPercent = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;
      acc[order.orderHash] = { width: `${progressPercent}%` };
      return acc;
    }, {});
  }, [recentOrders]);

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

  const getTokenSymbol = useCallback((address: string): string => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.symbol ?? truncateAddress(address);
  }, [tokenInfoMap]);

  const getTokenDecimals = useCallback((address: string): number => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.decimals ?? 18;
  }, [tokenInfoMap]);

  // Look up order notes for operation type and protocol info
  const orderNotesMap = useMemo(() => {
    const notesMap = new Map<string, OrderNote>();
    
    for (const order of orders) {
      const { orderHash, context } = order;
      
      // Try direct lookup by orderHash
      let note = getOrderNote(orderHash);
      
      // If not found, try to match by tokens and timestamp
      if (!note) {
        const sellSymbol = getTokenSymbol(context.params.sellToken);
        const buySymbol = getTokenSymbol(context.params.buyToken);
        note = findPendingNoteForOrder(
          sellSymbol,
          buySymbol,
          chainId,
          Number(context.createdAt)
        );
        
        // If found a pending note, link it to the orderHash
        if (note && note.salt) {
          linkNoteToOrderHash(note.salt, orderHash);
        }
      }
      
      if (note) {
        notesMap.set(orderHash, note);
      }
    }
    
    return notesMap;
  }, [orders, chainId, getTokenSymbol]);

  // Don't render anything if CoW not available or not connected
  if (!isAvailable || !userAddress) return null;

  // If no orders, still mount but don't show anything visible
  // This allows us to receive ORDER_CREATED_EVENT and fetch when orders are placed
  const showButton = orders.length > 0;

  return (
    <>
      {/* Floating Button - only show if we have orders */}
      {showButton && (
        <button
          onClick={toggleDrawer}
          className="bg-primary text-primary-content hover:bg-primary/90 fixed bottom-4 right-4 z-50 flex h-12 items-center gap-2 rounded-lg px-4 shadow-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="font-medium">Orders</span>
          {activeCount > 0 && (
            <span className="bg-primary-content text-primary rounded px-1.5 py-0.5 text-xs font-bold">{activeCount}</span>
          )}
        </button>
      )}

      {/* Drawer */}
      {isOpen && (
        <div className="bg-base-100 border-base-300 fixed bottom-20 right-4 z-50 flex max-h-[75vh] w-[420px] flex-col overflow-hidden rounded-lg border shadow-2xl">
          {/* Header */}
          <div className="border-base-200 flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Orders</span>
              <button 
                onClick={fetchOrders} 
                disabled={isLoading}
                className="hover:bg-base-200 rounded p-1 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`text-base-content/50 size-4${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <button onClick={closeDrawer} className="hover:bg-base-200 rounded p-1 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="text-base-content/50 size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && orders.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-base-content/50 py-16 text-center">
                <p className="text-sm">{orders.length > 0 ? 'No recent orders' : 'No orders yet'}</p>
                {hasOlderOrders && (
                  <Link href="/orders" className="text-primary mt-2 inline-block text-sm hover:underline">
                    View all orders
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-base-200 divide-y">
                {/* Active orders first */}
                {activeOrders.map((order) => renderOrderItem(order))}

                {/* Past orders section */}
                {pastOrders.length > 0 && (
                  <>
                    {/* Separator with PAST header */}
                    <div className="border-base-300 bg-base-100 sticky top-0 border-y px-4 py-2">
                      <span className="text-base-content/60 text-xs font-bold uppercase tracking-tight">Past Orders</span>
                    </div>
                    {pastOrders.map((order) => renderOrderItem(order))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {recentOrders.length > 0 && (
            <div className="border-base-200 text-base-content/40 flex justify-between border-t px-4 py-2 text-xs">
              <span>{activeCount} active{hasOlderOrders ? ` · ${orders.length - recentOrders.length} older` : ''}</span>
              <Link href="/orders" className="text-primary hover:underline">
                View all
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Helper function to render an order item
  function renderOrderItem(order: OrderWithHash) {
                  const { orderHash, context } = order;
                  const { params, status, iterationCount, createdAt } = context;
                  const isActive = status === OrderStatus.Active;
                  const isCompleted = status === OrderStatus.Completed;
                  const isCancellingThis = cancellingHash === orderHash;

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
                  const totalSold = executionData?.totalSold ?? 0n;
                  const hasSurplus = executionSummary && executionSummary.surplusAmount > 0n;

                  const sellAmountNum = parseFloat(formatUnits(params.preTotalAmount, sellDecimals));
                  const receivedAmountNum = parseFloat(formatUnits(totalReceived, buyDecimals));
                  const actualSoldAmountNum = parseFloat(formatUnits(totalSold, sellDecimals));
                  const surplusAmountNum = executionSummary ? parseFloat(formatUnits(executionSummary.surplusAmount, buyDecimals)) : 0;

                  // Get order note for operation type and protocol
                  const orderNote = orderNotesMap.get(orderHash);
                  const operationType = orderNote?.operationType ?? "unknown";
                  const operationLabel = getOperationLabel(operationType);
                  const operationColorClass = getOperationColorClass(operationType);
                  const protocolName = orderNote?.protocol;
                  const protocolLogo = protocolName ? getProtocolLogo(protocolName) : null;

                  return (
                    <div key={orderHash} className={`hover:bg-base-50 px-4 py-3 transition-colors ${!isActive ? 'opacity-60' : ''}`}>
                      {/* Row 0: Protocol (left) | Operation type + Order kind + Status (right) */}
                      <div className="mb-1.5 flex items-center justify-between">
                        {/* Left: Protocol */}
                        <div className="flex items-center gap-1">
                          {protocolName && protocolLogo && (
                            <Image
                              src={protocolLogo}
                              alt={protocolName}
                              width={14}
                              height={14}
                              className="rounded-sm"
                            />
                          )}
                          {protocolName && (
                            <span className="text-base-content/50 text-[10px]">{protocolName}</span>
                          )}
                        </div>
                        {/* Right: Tags grouped */}
                        <div className="flex items-center gap-1.5">
                          {/* Operation type badge */}
                          {operationType !== "unknown" && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${operationColorClass}`}>
                              {operationLabel}
                            </span>
                          )}
                          {/* Order kind badge */}
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            params.isKindBuy ? 'bg-info/20 text-info' : 'bg-secondary/20 text-secondary'
                          }`}>
                            {params.isKindBuy ? 'BUY' : 'SELL'}
                          </span>
                          {/* Status badge */}
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            isActive ? 'bg-warning/20 text-warning' :
                            isCompleted ? 'bg-success/20 text-success' :
                            'bg-error/20 text-error'
                          }`}>
                            {isActive ? 'Active' : isCompleted ? 'Done' : 'Cancelled'}
                          </span>
                        </div>
                      </div>

                      {/* Row 1: Token pair + time */}
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center -space-x-1">
                            <Image src={tokenNameToLogo(sellSymbol)} alt={sellSymbol} width={24} height={24} className="ring-base-100 rounded-full ring-2" />
                            <Image src={tokenNameToLogo(buySymbol)} alt={buySymbol} width={24} height={24} className="ring-base-100 rounded-full ring-2" />
                          </div>
                          <span className="text-sm font-medium">{sellSymbol} → {buySymbol}</span>
                        </div>
                        <span className="text-base-content/40 text-xs">{timeAgo(createdAt, true)}</span>
                      </div>

                      {/* Row 2: Progress bar */}
                      <div className="mb-2">
                        <div className="bg-base-200 h-1 w-full">
                          <div
                            className={`h-full transition-all ${isActive ? 'bg-primary' : 'bg-success'}`}
                            style={progressStyles[orderHash]}
                          />
                        </div>
                        <div className="mt-1 flex justify-between">
                          <span className="text-base-content/40 text-xs">{completedChunks}/{totalChunks} chunks</span>
                          <span className="text-base-content/50 text-xs font-medium">{progressPercent.toFixed(0)}%</span>
                        </div>
                      </div>

                      {/* Row 3: Amounts - Sell/Buy with expected amounts */}
                      {/* KIND_SELL: Exact sell amount, minimum buy amount */}
                      {/* KIND_BUY: Maximum sell amount, exact buy amount */}
                      <div className="mb-2 space-y-1 text-sm">
                        {/* Sell row */}
                        <div className="flex justify-between">
                          <div>
                            <span className="text-base-content/50">{params.isKindBuy ? 'Sell up to ' : 'Sell '}</span>
                            <span className="font-medium">{formatAmount(params.preTotalAmount, sellDecimals)}</span>
                            <span className="text-base-content/50 ml-1">{sellSymbol}</span>
                          </div>
                          <UsdValue symbol={sellSymbol} amount={sellAmountNum} />
                        </div>
                        {/* Buy row - expected buy amount */}
                        <div className="flex justify-between">
                          <div>
                            <span className="text-base-content/50">{params.isKindBuy ? 'Buy ' : 'Get at least '}</span>
                            <span className="font-medium">{formatAmount(params.minBuyPerChunk * params.targetValue, buyDecimals)}</span>
                            <span className="text-base-content/50 ml-1">{buySymbol}</span>
                          </div>
                          <UsdValue symbol={buySymbol} amount={parseFloat(formatUnits(params.minBuyPerChunk * params.targetValue, buyDecimals))} />
                        </div>
                        {/* Execution result row - shows the floating side (what actually varied) */}
                        {/* KIND_SELL: "Got X" (buy amount varied), KIND_BUY: "Sold X" (sell amount varied) */}
                        {hasExecutionData && (
                          <div className="flex justify-between">
                            <div>
                              {params.isKindBuy ? (
                                <>
                                  <span className="text-base-content/50">Sold </span>
                                  <span className="text-success font-medium">{formatAmount(totalSold, sellDecimals)}</span>
                                  <span className="text-base-content/50 ml-1">{sellSymbol}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-base-content/50">Got </span>
                                  <span className="text-success font-medium">{formatAmount(totalReceived, buyDecimals)}</span>
                                  <span className="text-base-content/50 ml-1">{buySymbol}</span>
                                </>
                              )}
                            </div>
                            {params.isKindBuy ? (
                              <UsdValue symbol={sellSymbol} amount={actualSoldAmountNum} />
                            ) : (
                              <UsdValue symbol={buySymbol} amount={receivedAmountNum} />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Row 4: Surplus (if any) */}
                      {hasSurplus && executionSummary && (
                        <div className="text-success mb-2 text-sm">
                          <span>+{formatAmount(executionSummary.surplusAmount, buyDecimals)} {buySymbol}</span>
                          <span className="text-success/70 ml-1">(+{executionSummary.surplusPercentage.toFixed(2)}%)</span>
                          <span className="ml-2"><UsdValue symbol={buySymbol} amount={surplusAmountNum} /></span>
                        </div>
                      )}

                      {/* Row 5: Actions */}
                      <div className="flex items-center gap-3 text-xs">
                        <Link href={`/orders/${orderHash}`} className="text-primary hover:underline">
                          Details
                        </Link>
                        {isActive && (
                          <button
                            onClick={cancelHandlers[orderHash]}
                            disabled={isCancelling || isCancellingThis}
                            className="text-error hover:underline disabled:opacity-50"
                          >
                            {isCancellingThis ? 'Cancelling...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
  }
}
