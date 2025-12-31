"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { useCowOrder } from "~~/hooks/useCowOrder";
import { OrderStatus, getCowExplorerAddressUrl } from "~~/utils/cow";
import type { OrderContext } from "~~/utils/cow";

// Common token address to symbol mapping (extend as needed)
const TOKEN_SYMBOLS: Record<string, string> = {
  // Arbitrum
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
  "0x5979d7b546e38e414f7e9822514be443a4800529": "wstETH",
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
  "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": "DAI",
  // Base
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x4200000000000000000000000000000000000006": "WETH",
  // Add more as needed
};

// Token decimals (default to 18 if unknown)
const TOKEN_DECIMALS: Record<string, number> = {
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6, // USDC Arbitrum
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // USDC Base
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": 6, // USDT Arbitrum
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": 8, // WBTC Arbitrum
};

function getTokenSymbol(address: string): string {
  const normalized = address.toLowerCase();
  return TOKEN_SYMBOLS[normalized] || `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTokenDecimals(address: string): number {
  const normalized = address.toLowerCase();
  return TOKEN_DECIMALS[normalized] || 18;
}

function formatAmount(amount: bigint, address: string, maxDecimals?: number): string {
  const decimals = getTokenDecimals(address);
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  const max = maxDecimals ?? (num >= 1000 ? 2 : num >= 1 ? 4 : 6);
  return num.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: 0 });
}

function formatRate(rate: number, precision: number = 6): string {
  if (rate === 0 || !isFinite(rate)) return "-";
  if (rate >= 1000) return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (rate >= 1) return rate.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return rate.toLocaleString(undefined, { maximumFractionDigits: precision });
}

function timeAgo(timestamp: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getStatusBadge(status: OrderStatus): { text: string; className: string } {
  switch (status) {
    case OrderStatus.Active:
      return { text: "Active", className: "badge-warning" };
    case OrderStatus.Completed:
      return { text: "Completed", className: "badge-success" };
    case OrderStatus.Cancelled:
      return { text: "Cancelled", className: "badge-error" };
    default:
      return { text: "Unknown", className: "badge-ghost" };
  }
}

// Calculate rate: how much buyToken per sellToken
function calculateRate(sellAmount: bigint, sellDecimals: number, buyAmount: bigint, buyDecimals: number): number {
  if (sellAmount === 0n) return 0;
  const sell = parseFloat(formatUnits(sellAmount, sellDecimals));
  const buy = parseFloat(formatUnits(buyAmount, buyDecimals));
  return buy / sell;
}

interface OrderWithHash {
  orderHash: string;
  context: OrderContext;
}

export function PendingOrdersDrawer() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const { getUserOrdersWithDetails, cancelOrder, isCancelling, isAvailable, orderManagerAddress } = useCowOrder();
  
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<OrderWithHash[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingHash, setCancellingHash] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!userAddress || !isAvailable) return;
    
    setIsLoading(true);
    try {
      const userOrders = await getUserOrdersWithDetails();
      setOrders(userOrders);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isAvailable, getUserOrdersWithDetails]);

  // Fetch on mount and when drawer opens
  useEffect(() => {
    if (isOpen && userAddress && isAvailable) {
      fetchOrders();
    }
  }, [isOpen, userAddress, isAvailable, fetchOrders]);

  // Auto-refresh every 15s when open (faster for better UX)
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [isOpen, fetchOrders]);

  const handleCancel = async (orderHash: string) => {
    setCancellingHash(orderHash);
    const success = await cancelOrder(orderHash);
    setCancellingHash(null);
    
    if (success) {
      await fetchOrders();
    }
  };

  const toggleExpanded = (orderHash: string) => {
    setExpandedOrder(expandedOrder === orderHash ? null : orderHash);
  };

  // Filter to only active orders for the badge count
  const activeOrders = orders.filter(o => o.context.status === OrderStatus.Active);
  const activeCount = activeOrders.length;

  // Don't render if no CoW support on this chain
  if (!isAvailable || !userAddress) {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 btn btn-primary shadow-lg gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Orders
        {activeCount > 0 && (
          <span className="badge badge-secondary badge-sm">{activeCount}</span>
        )}
      </button>

      {/* Drawer Panel - wider for more info */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-[520px] max-h-[80vh] bg-base-200 rounded-xl shadow-2xl border border-base-300 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-base-300 bg-base-300">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">Limit Orders</h3>
              <button 
                onClick={fetchOrders} 
                className="btn btn-ghost btn-xs btn-circle"
                disabled={isLoading}
                title="Refresh"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <button onClick={() => setIsOpen(false)} className="btn btn-ghost btn-sm btn-circle">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading && orders.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-base-content/60">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="font-medium">No orders found</p>
                <p className="text-sm mt-1">Create a limit order from the Multiply modal</p>
              </div>
            ) : (
              orders.map((order) => {
                const { orderHash, context } = order;
                const { params, status, executedAmount, iterationCount, createdAt } = context;
                const statusBadge = getStatusBadge(status);
                const isActive = status === OrderStatus.Active;
                const isCancellingThis = cancellingHash === orderHash;
                const isExpanded = expandedOrder === orderHash;
                
                // Token info
                const sellSymbol = getTokenSymbol(params.sellToken);
                const buySymbol = getTokenSymbol(params.buyToken);
                const sellDecimals = getTokenDecimals(params.sellToken);
                const buyDecimals = getTokenDecimals(params.buyToken);
                
                // Calculate progress
                const totalChunks = Number(params.targetValue);
                const completedChunks = Number(iterationCount);
                const progressPercent = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;
                const remainingChunks = totalChunks - completedChunks;
                
                // Calculate rates
                const minRate = calculateRate(params.chunkSize, sellDecimals, params.minBuyPerChunk, buyDecimals);
                const totalMinBuy = params.minBuyPerChunk * BigInt(totalChunks);
                const executedSell = executedAmount;
                
                // Remaining amounts
                const remainingSell = params.preTotalAmount - executedAmount;

                return (
                  <div 
                    key={orderHash} 
                    className={`card bg-base-100 shadow-sm border border-base-300/50 ${!isActive ? 'opacity-70' : ''}`}
                  >
                    <div className="card-body p-4 gap-3">
                      {/* Header: Token Pair + Status + Time */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 font-semibold text-base">
                            <span>{sellSymbol}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span>{buySymbol}</span>
                          </div>
                          <span className={`badge badge-sm ${statusBadge.className}`}>
                            {statusBadge.text}
                          </span>
                        </div>
                        <span className="text-xs text-base-content/50">{timeAgo(createdAt)}</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-base-content/70">
                            Chunk {completedChunks}/{totalChunks}
                          </span>
                          <span className="font-medium">{Math.round(progressPercent)}%</span>
                        </div>
                        <progress 
                          className={`progress w-full h-2 ${isActive ? 'progress-primary' : 'progress-success'}`}
                          value={progressPercent} 
                          max="100"
                        />
                      </div>

                      {/* Key Stats Grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Total Sell:</span>
                          <span className="font-medium">{formatAmount(params.preTotalAmount, params.sellToken)} {sellSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Min Buy:</span>
                          <span className="font-medium">{formatAmount(totalMinBuy, params.buyToken)} {buySymbol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Executed:</span>
                          <span className="text-success font-medium">{formatAmount(executedSell, params.sellToken)} {sellSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Remaining:</span>
                          <span className="text-warning font-medium">{formatAmount(remainingSell, params.sellToken)} {sellSymbol}</span>
                        </div>
                      </div>

                      {/* Min Rate Display */}
                      <div className="bg-base-200/50 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-sm text-base-content/60">Min Rate:</span>
                        <span className="font-mono text-sm">
                          1 {sellSymbol} = {formatRate(minRate)} {buySymbol}
                        </span>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-base-300/50 pt-3 mt-1 space-y-2">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-base-content/70">
                            <div className="flex justify-between">
                              <span>Chunk Size:</span>
                              <span>{formatAmount(params.chunkSize, params.sellToken)} {sellSymbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Min/Chunk:</span>
                              <span>{formatAmount(params.minBuyPerChunk, params.buyToken)} {buySymbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Chunks Left:</span>
                              <span>{remainingChunks}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Health Factor:</span>
                              <span>{formatUnits(params.minHealthFactor, 18)}</span>
                            </div>
                          </div>
                          
                          {/* Order Hash */}
                          <div className="text-xs text-base-content/40 pt-2 border-t border-base-300/30">
                            <span className="font-medium">Order Hash:</span>
                            <code className="block mt-1 break-all bg-base-200 px-2 py-1 rounded">{orderHash}</code>
                          </div>
                        </div>
                      )}

                      {/* Actions Row */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => toggleExpanded(orderHash)}
                          className="btn btn-ghost btn-xs"
                        >
                          {isExpanded ? "Less" : "More"}
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <a
                          href={getCowExplorerAddressUrl(chainId, orderManagerAddress || "")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-xs"
                        >
                          CoW Explorer
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                        {isActive && (
                          <button
                            onClick={() => handleCancel(orderHash)}
                            disabled={isCancelling || isCancellingThis}
                            className="btn btn-error btn-xs ml-auto"
                          >
                            {isCancellingThis ? (
                              <>
                                <span className="loading loading-spinner loading-xs"></span>
                                Cancelling
                              </>
                            ) : (
                              "Cancel"
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Stats */}
          {orders.length > 0 && (
            <div className="px-5 py-3 border-t border-base-300 bg-base-300 flex items-center justify-between text-xs text-base-content/60">
              <span>{activeCount} active, {orders.length - activeCount} completed</span>
              <span>Auto-refresh: 15s</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
