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

function timeAgo(timestamp: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

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
  const { getUserOrdersWithDetails, cancelOrder, isCancelling, isAvailable } = useCowOrder();
  
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<OrderWithHash[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingHash, setCancellingHash] = useState<string | null>(null);
  
  // Track which user+chain combo we've fetched for to detect changes
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const currentKey = userAddress && chainId ? `${userAddress}-${chainId}` : null;
  const hasFetched = fetchedFor === currentKey;

  const fetchOrders = useCallback(async () => {
    if (!userAddress || !isAvailable || !currentKey) return;
    setIsLoading(true);
    try {
      const userOrders = await getUserOrdersWithDetails();
      setOrders(userOrders);
      setFetchedFor(currentKey);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      setFetchedFor(currentKey); // Mark as fetched even on error to prevent infinite retries
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isAvailable, getUserOrdersWithDetails, currentKey]);

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
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [isOpen, fetchOrders]);

  const handleCancel = async (orderHash: string) => {
    setCancellingHash(orderHash);
    const success = await cancelOrder(orderHash);
    setCancellingHash(null);
    if (success) await fetchOrders();
  };

  // Filter to recent orders (past 7 days) and sort newest first
  const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  
  const recentOrders = useMemo(() => {
    return orders
      .filter(o => now - Number(o.context.createdAt) < SEVEN_DAYS_SECONDS)
      .sort((a, b) => Number(b.context.createdAt) - Number(a.context.createdAt));
  }, [orders, now]);
  
  const hasOlderOrders = orders.length > recentOrders.length;
  const activeOrders = recentOrders.filter(o => o.context.status === OrderStatus.Active);
  const activeCount = activeOrders.length;

  const ordersForEvents = useMemo(() => 
    recentOrders.map(o => ({
      orderHash: o.orderHash,
      isComplete: o.context.status === OrderStatus.Completed,
    })),
    [recentOrders]
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

  // Don't render anything if not available, not connected, or no orders
  if (!isAvailable || !userAddress) return null;
  if (hasFetched && orders.length === 0) return null;

  return (
    <>
      {/* Floating Button - only show if we have orders */}
      {orders.length > 0 && <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 h-12 px-4 bg-primary text-primary-content rounded-lg shadow-lg flex items-center gap-2 hover:bg-primary/90 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="font-medium">Orders</span>
        {activeCount > 0 && (
          <span className="bg-primary-content text-primary text-xs font-bold px-1.5 py-0.5 rounded">{activeCount}</span>
        )}
      </button>}

      {/* Drawer */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-[420px] max-h-[75vh] bg-base-100 rounded-lg shadow-2xl border border-base-300 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-base-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Orders</span>
              <button 
                onClick={fetchOrders} 
                disabled={isLoading}
                className="p-1 hover:bg-base-200 rounded transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-base-content/50 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-base-200 rounded transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-base-content/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <div className="text-center py-16 text-base-content/50">
                <p className="text-sm">{orders.length > 0 ? 'No recent orders' : 'No orders yet'}</p>
                {hasOlderOrders && (
                  <Link href="/orders" className="text-primary text-sm hover:underline mt-2 inline-block">
                    View all orders
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-y divide-base-200">
                {recentOrders.map((order) => {
                  const { orderHash, context } = order;
                  const { params, status, executedAmount, iterationCount, createdAt } = context;
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
                  const hasSurplus = executionSummary && executionSummary.surplusAmount > 0n;
                  
                  const sellAmountNum = parseFloat(formatUnits(params.preTotalAmount, sellDecimals));
                  const receivedAmountNum = parseFloat(formatUnits(totalReceived, buyDecimals));
                  const surplusAmountNum = executionSummary ? parseFloat(formatUnits(executionSummary.surplusAmount, buyDecimals)) : 0;

                  return (
                    <div key={orderHash} className={`px-4 py-3 hover:bg-base-50 transition-colors ${!isActive ? 'opacity-60' : ''}`}>
                      {/* Row 1: Token pair, status, time */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center -space-x-1">
                            <Image src={tokenNameToLogo(sellSymbol)} alt={sellSymbol} width={24} height={24} className="rounded-full ring-2 ring-base-100" />
                            <Image src={tokenNameToLogo(buySymbol)} alt={buySymbol} width={24} height={24} className="rounded-full ring-2 ring-base-100" />
                          </div>
                          <span className="font-medium text-sm">{sellSymbol} → {buySymbol}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            isActive ? 'bg-warning/20 text-warning' :
                            isCompleted ? 'bg-success/20 text-success' :
                            'bg-error/20 text-error'
                          }`}>
                            {isActive ? 'Active' : isCompleted ? 'Done' : 'Cancelled'}
                          </span>
                        </div>
                        <span className="text-xs text-base-content/40">{timeAgo(createdAt)}</span>
                      </div>

                      {/* Row 2: Progress bar */}
                      <div className="mb-2">
                        <div className="h-1 bg-base-200 w-full">
                          <div 
                            className={`h-full transition-all ${isActive ? 'bg-primary' : 'bg-success'}`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-base-content/40">{completedChunks}/{totalChunks} chunks</span>
                          <span className="text-xs text-base-content/50 font-medium">{progressPercent.toFixed(0)}%</span>
                        </div>
                      </div>

                      {/* Row 3: Amounts */}
                      <div className="flex justify-between text-sm mb-2">
                        <div>
                          <span className="text-base-content/50">Sell </span>
                          <span className="font-medium">{formatAmount(params.preTotalAmount, sellDecimals)}</span>
                          <span className="text-base-content/50 ml-1">{sellSymbol}</span>
                          <span className="ml-2"><UsdValue symbol={sellSymbol} amount={sellAmountNum} /></span>
                        </div>
                        <div className="text-right">
                          <span className="text-base-content/50">Got </span>
                          <span className={`font-medium ${hasExecutionData ? 'text-success' : 'text-base-content/40'}`}>
                            {hasExecutionData ? formatAmount(totalReceived, buyDecimals) : '-'}
                          </span>
                          {hasExecutionData && (
                            <>
                              <span className="text-base-content/50 ml-1">{buySymbol}</span>
                              <span className="ml-2"><UsdValue symbol={buySymbol} amount={receivedAmountNum} /></span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Row 4: Surplus (if any) */}
                      {hasSurplus && executionSummary && (
                        <div className="text-sm text-success mb-2">
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
                            onClick={() => handleCancel(orderHash)}
                            disabled={isCancelling || isCancellingThis}
                            className="text-error hover:underline disabled:opacity-50"
                          >
                            {isCancellingThis ? 'Cancelling...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {recentOrders.length > 0 && (
            <div className="px-4 py-2 border-t border-base-200 text-xs text-base-content/40 flex justify-between">
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
}
