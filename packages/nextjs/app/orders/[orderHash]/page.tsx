"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useChainId, usePublicClient } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useChunkExecutedEvents } from "~~/hooks/useChunkExecutedEvents";
import { useTokenInfo } from "~~/hooks/useTokenInfo";
import { useTokenPriceApi } from "~~/hooks/useTokenPriceApi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { 
  OrderStatus, 
  getCowExplorerAddressUrl,
  calculateExecutionSummary,
  getOrderQuoteRate,
  calculatePriceImpact,
} from "~~/utils/cow";
import type { OrderContext } from "~~/utils/cow";

const ORDER_MANAGER_ADDRESSES: Record<number, Address | undefined> = {
  42161: "0x8F94351Ac17B4B5fb0923D229319805bB52616CD",
  8453: "0xE4b28de3AA865540Bbc1C71892b6b6Af24929858",
};

function formatAmount(amount: bigint, decimals: number, maxDecimals?: number): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  const max = maxDecimals ?? (num >= 1000 ? 2 : num >= 1 ? 4 : 6);
  return num.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: 0 });
}

function formatAmountPrecise(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  // Show more decimals for precise display
  if (num === 0) return "0";
  if (num < 0.0001) return num.toExponential(4);
  if (num < 1) return num.toFixed(6);
  if (num < 100) return num.toFixed(4);
  if (num < 10000) return num.toFixed(2);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function getBlockExplorerTxUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    42161: "https://arbiscan.io",
    8453: "https://basescan.org",
    10: "https://optimistic.etherscan.io",
  };
  return `${explorers[chainId] || "https://etherscan.io"}/tx/${txHash}`;
}

const ORDER_MANAGER_ABI = [
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "getOrder",
    outputs: [
      {
        components: [
          {
            components: [
              { name: "user", type: "address" },
              { name: "preInstructionsPerIteration", type: "bytes[]" },
              { name: "preTotalAmount", type: "uint256" },
              { name: "sellToken", type: "address" },
              { name: "buyToken", type: "address" },
              { name: "chunkSize", type: "uint256" },
              { name: "minBuyPerChunk", type: "uint256" },
              { name: "postInstructionsPerIteration", type: "bytes[]" },
              { name: "completion", type: "uint8" },
              { name: "targetValue", type: "uint256" },
              { name: "minHealthFactor", type: "uint256" },
              { name: "appDataHash", type: "bytes32" },
              { name: "isFlashLoanOrder", type: "bool" },
              { name: "isKindBuy", type: "bool" },
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
] as const;

export default function OrderDetailPage() {
  const params = useParams();
  const orderHash = params.orderHash as string;
  const chainId = useChainId();
  const publicClient = usePublicClient();
  
  const [order, setOrder] = useState<OrderContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const orderManagerAddress = ORDER_MANAGER_ADDRESSES[chainId];
  
  useEffect(() => {
    if (!orderHash || !publicClient || !orderManagerAddress) {
      setIsLoading(false);
      return;
    }
    
    const fetchOrder = async () => {
      try {
        const result = await publicClient.readContract({
          address: orderManagerAddress,
          abi: ORDER_MANAGER_ABI,
          functionName: "getOrder",
          args: [orderHash as `0x${string}`],
        });
        
        const [contextData] = [result];
        const orderContext: OrderContext = {
          params: {
            user: contextData.params.user,
            sellToken: contextData.params.sellToken,
            buyToken: contextData.params.buyToken,
            preTotalAmount: contextData.params.preTotalAmount,
            chunkSize: contextData.params.chunkSize,
            minBuyPerChunk: contextData.params.minBuyPerChunk,
            targetValue: contextData.params.targetValue,
            minHealthFactor: contextData.params.minHealthFactor,
            appDataHash: contextData.params.appDataHash,
            isFlashLoanOrder: contextData.params.isFlashLoanOrder,
            isKindBuy: contextData.params.isKindBuy ?? false,
            completion: contextData.params.completion,
            preInstructionsPerIteration: [...(contextData.params.preInstructionsPerIteration || [])],
            postInstructionsPerIteration: [...(contextData.params.postInstructionsPerIteration || [])],
          },
          status: contextData.status as OrderStatus,
          executedAmount: contextData.executedAmount,
          iterationCount: contextData.iterationCount,
          createdAt: contextData.createdAt,
        };
        
        setOrder(orderContext);
      } catch (e) {
        console.error("Failed to fetch order:", e);
        setError("Failed to fetch order details");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchOrder();
  }, [orderHash, publicClient, orderManagerAddress]);
  
  const { data: executionData, isLoading: isLoadingEvents } = useChunkExecutedEvents(
    orderHash,
    { isComplete: order?.status === OrderStatus.Completed }
  );
  
  const tokenAddresses = useMemo(() => {
    if (!order) return [];
    return [order.params.sellToken, order.params.buyToken] as Address[];
  }, [order]);
  
  const tokenInfoMap = useTokenInfo(tokenAddresses, chainId);
  
  const getTokenSymbol = (address: string): string => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
  };
  
  const getTokenDecimals = (address: string): number => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.decimals ?? 18;
  };

  // Get symbols for price lookup
  const sellSymbol = order ? getTokenSymbol(order.params.sellToken) : "";
  const buySymbol = order ? getTokenSymbol(order.params.buyToken) : "";
  
  // Fetch token prices
  const sellPriceData = useTokenPriceApi(sellSymbol);
  const buyPriceData = useTokenPriceApi(buySymbol);
  const sellPrice = sellPriceData.isSuccess ? (sellPriceData as { price: number }).price : undefined;
  const buyPrice = buyPriceData.isSuccess ? (buyPriceData as { price: number }).price : undefined;
  
  const executionSummary = useMemo(() => {
    if (!executionData || !order || executionData.chunks.length === 0) return null;
    
    const sellDecimals = getTokenDecimals(order.params.sellToken);
    const buyDecimals = getTokenDecimals(order.params.buyToken);
    
    return calculateExecutionSummary(
      executionData,
      order.params.minBuyPerChunk,
      sellDecimals,
      buyDecimals
    );
  }, [executionData, order, tokenInfoMap]);
  
  const quoteData = useMemo(() => {
    if (!orderHash) return null;
    return getOrderQuoteRate(chainId, orderHash);
  }, [chainId, orderHash]);
  
  const priceImpact = useMemo(() => {
    if (!quoteData || !executionSummary) return null;
    return calculatePriceImpact(executionSummary.actualRate, quoteData.quoteRate);
  }, [quoteData, executionSummary]);
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }
  
  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-error text-xl mb-4">{error || "Order not found"}</p>
          <Link href="/" className="text-primary hover:underline">Back to Home</Link>
        </div>
      </div>
    );
  }
  
  const sellDecimals = getTokenDecimals(order.params.sellToken);
  const buyDecimals = getTokenDecimals(order.params.buyToken);
  const totalChunks = Number(order.params.targetValue);
  const completedChunks = Number(order.iterationCount);
  const progressPercent = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;
  const totalMinBuy = order.params.minBuyPerChunk * BigInt(totalChunks);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  
  const isActive = order.status === OrderStatus.Active;
  const isCompleted = order.status === OrderStatus.Completed;
  const isCancelled = order.status === OrderStatus.Cancelled;

  // Calculate USD values
  const totalSoldUsd = sellPrice ? parseFloat(formatUnits(order.executedAmount, sellDecimals)) * sellPrice : null;
  const totalReceivedUsd = buyPrice && executionData ? parseFloat(formatUnits(executionData.totalReceived, buyDecimals)) * buyPrice : null;
  const surplusUsd = buyPrice && executionSummary ? parseFloat(formatUnits(executionSummary.surplusAmount, buyDecimals)) * buyPrice : null;

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 lg:px-16">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <button 
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 text-base-content/50 hover:text-base-content transition-colors text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Hero: Token Pair */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 mb-12">
          {/* Left: Token Pair */}
          <div className="flex items-center gap-6 md:gap-10">
            {/* Sell Token */}
            <div className="flex items-center gap-4">
              <Image 
                src={tokenNameToLogo(sellSymbol)} 
                alt={sellSymbol} 
                width={64} 
                height={64} 
                className="rounded-full"
              />
              <div>
                <span className="text-base-content/50 text-sm block">Sell</span>
                <span className="text-3xl md:text-4xl font-bold text-base-content">{sellSymbol}</span>
              </div>
            </div>
            
            {/* Arrow */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            
            {/* Buy Token */}
            <div className="flex items-center gap-4">
              <Image 
                src={tokenNameToLogo(buySymbol)} 
                alt={buySymbol} 
                width={64} 
                height={64} 
                className="rounded-full"
              />
              <div>
                <span className="text-base-content/50 text-sm block">Buy</span>
                <span className="text-3xl md:text-4xl font-bold text-success">{buySymbol}</span>
              </div>
            </div>
          </div>

          {/* Right: Status */}
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-full font-semibold text-sm ${
              isActive ? 'bg-warning/20 text-warning' :
              isCompleted ? 'bg-success/20 text-success' :
              isCancelled ? 'bg-error/20 text-error' :
              'bg-base-300 text-base-content/50'
            }`}>
              {isActive ? 'Active' : isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : 'Unknown'}
            </div>
            <span className="text-base-content/40 text-sm">{formatDate(order.createdAt)}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base-content/50 text-sm">Progress</span>
            <span className="text-base-content/80 font-mono text-sm">{completedChunks} / {totalChunks} chunks</span>
          </div>
          <div className="relative h-2 bg-base-300">
            <div 
              className="absolute inset-y-0 left-0 bg-primary transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-right mt-1">
            <span className="text-primary font-semibold">{progressPercent.toFixed(0)}%</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* Total Sold */}
          <div>
            <span className="text-base-content/50 text-sm block mb-1">Total Sold</span>
            <span className="text-2xl font-bold">{formatAmount(order.executedAmount, sellDecimals)}</span>
            <span className="text-base-content/60 ml-1">{sellSymbol}</span>
            {totalSoldUsd !== null && (
              <p className="text-base-content/50 text-sm mt-0.5">{formatUsd(totalSoldUsd)}</p>
            )}
            <p className="text-base-content/40 text-xs mt-1">
              of {formatAmount(order.params.preTotalAmount, sellDecimals)} {sellSymbol}
            </p>
          </div>

          {/* Total Received */}
          <div>
            <span className="text-base-content/50 text-sm block mb-1">Total Received</span>
            {isLoadingEvents ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : executionData ? (
              <>
                <span className="text-2xl font-bold text-success">{formatAmount(executionData.totalReceived, buyDecimals)}</span>
                <span className="text-base-content/60 ml-1">{buySymbol}</span>
                {totalReceivedUsd !== null && (
                  <p className="text-success/80 text-sm mt-0.5">{formatUsd(totalReceivedUsd)}</p>
                )}
                <p className="text-base-content/40 text-xs mt-1">
                  min: {formatAmount(totalMinBuy, buyDecimals)} {buySymbol}
                </p>
              </>
            ) : (
              <span className="text-base-content/40 text-2xl">-</span>
            )}
          </div>

          {/* Surplus */}
          <div>
            <span className="text-base-content/50 text-sm block mb-1">Surplus</span>
            {executionSummary && executionSummary.surplusAmount > 0n ? (
              <>
                <span className="text-2xl font-bold text-success">+{formatAmountPrecise(executionSummary.surplusAmount, buyDecimals)}</span>
                <span className="text-success/80 ml-1">{buySymbol}</span>
                {surplusUsd !== null && surplusUsd > 0 && (
                  <p className="text-success/80 text-sm mt-0.5">{formatUsd(surplusUsd)}</p>
                )}
                <p className="text-success text-xs mt-1">+{executionSummary.surplusPercentage.toFixed(2)}% above min</p>
              </>
            ) : (
              <span className="text-base-content/40 text-2xl">-</span>
            )}
          </div>

          {/* Rate */}
          <div>
            <span className="text-base-content/50 text-sm block mb-1">Execution Rate</span>
            {executionSummary ? (
              <>
                <span className="text-2xl font-bold font-mono">{(1 / executionSummary.actualRate).toFixed(4)}</span>
                <p className="text-base-content/40 text-xs mt-1">
                  {buySymbol} per {sellSymbol}
                </p>
              </>
            ) : (
              <span className="text-base-content/40 text-2xl">-</span>
            )}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Left: Order Details */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-base-content/80">Order Parameters</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-base-300/50">
                <span className="text-base-content/50">Chunk Size</span>
                <span className="font-medium">{formatAmount(order.params.chunkSize, sellDecimals)} {sellSymbol}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-base-300/50">
                <span className="text-base-content/50">Min Buy / Chunk</span>
                <span className="font-medium">{formatAmount(order.params.minBuyPerChunk, buyDecimals)} {buySymbol}</span>
              </div>
              {executionSummary && (
                <>
                  <div className="flex justify-between py-2 border-b border-base-300/50">
                    <span className="text-base-content/50">Min Rate</span>
                    <span className="font-mono text-base-content/60">{executionSummary.minRate.toFixed(6)}</span>
                  </div>
                  {executionSummary.rateImprovement > 0 && (
                    <div className="flex justify-between py-2 border-b border-base-300/50">
                      <span className="text-base-content/50">Rate Improvement</span>
                      <span className="text-success font-medium">+{executionSummary.rateImprovement.toFixed(2)}%</span>
                    </div>
                  )}
                  {priceImpact !== null && (
                    <div className="flex justify-between py-2 border-b border-base-300/50">
                      <span className="text-base-content/50">vs Initial Quote</span>
                      <span className={priceImpact < 0 ? 'text-success font-medium' : priceImpact > 0 ? 'text-warning font-medium' : ''}>
                        {priceImpact < 0 ? '+' : ''}{(-priceImpact).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between py-2 border-b border-base-300/50">
                <span className="text-base-content/50">Flash Loan</span>
                <span className={order.params.isFlashLoanOrder ? 'text-primary font-medium' : 'text-base-content/40'}>
                  {order.params.isFlashLoanOrder ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-base-300/50">
                <span className="text-base-content/50">Min Health Factor</span>
                <span className="font-medium">{formatUnits(order.params.minHealthFactor, 18)}</span>
              </div>
            </div>
          </div>

          {/* Right: Execution History */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-base-content/80">Execution History</h3>
            {executionSummary && executionSummary.chunkDetails.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                {executionSummary.chunkDetails.map((chunk) => (
                  <div key={chunk.chunkIndex} className="flex items-center justify-between py-2 px-3 bg-base-200/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-base-content/40 text-xs font-mono w-6">#{chunk.chunkIndex}</span>
                      <span className="text-sm">{formatAmount(chunk.sellAmount, sellDecimals)}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span className="text-sm text-success">{formatAmount(chunk.buyAmount, buyDecimals)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {chunk.surplusPercentage > 0 && (
                        <span className="text-success text-xs font-medium">+{chunk.surplusPercentage.toFixed(2)}%</span>
                      )}
                      <a
                        href={getBlockExplorerTxUrl(chainId, chunk.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 text-xs"
                      >
                        tx
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-base-content/40 text-sm">No executions yet</p>
            )}
          </div>
        </div>

        {/* Footer: Order Hash & Links */}
        <div className="border-t border-base-300/50 pt-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-base-content/50 text-xs block mb-1">Order Hash</span>
              <div className="flex items-center gap-2">
                <code className="text-xs text-base-content/70 truncate">{orderHash}</code>
                <button
                  onClick={() => copyToClipboard(orderHash)}
                  className="p-1 hover:bg-base-200 rounded transition-colors flex-shrink-0"
                  title="Copy"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <a
                href={getCowExplorerAddressUrl(chainId, orderManagerAddress || "")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
              >
                CoW Explorer
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              
              <button
                onClick={() => copyToClipboard(shareUrl)}
                className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
              >
                Share
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my Kapan Finance order!`)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
              >
                Tweet
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
