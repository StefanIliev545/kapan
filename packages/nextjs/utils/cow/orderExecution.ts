import { formatUnits } from "viem";
import type { ChunkExecution, OrderExecutionData } from "~~/hooks/useChunkExecutedEvents";

export interface ExecutionSummary {
  /** Total amount sold */
  totalSold: bigint;
  /** Total amount received */
  totalReceived: bigint;
  /** Minimum expected buy amount */
  minExpected: bigint;
  /** Surplus amount (received - minExpected) */
  surplusAmount: bigint;
  /** Surplus percentage (0-100+) */
  surplusPercentage: number;
  /** Actual execution rate (sell per buy, e.g., 3000 USDC/WETH) */
  actualRate: number;
  /** Minimum rate from order params */
  minRate: number;
  /** Rate improvement percentage */
  rateImprovement: number;
  /** Per-chunk execution details with rates */
  chunkDetails: ChunkDetail[];
}

export interface ChunkDetail {
  chunkIndex: number;
  sellAmount: bigint;
  buyAmount: bigint;
  rate: number;
  surplusPercentage: number;
  txHash: string;
}

/**
 * Calculate execution summary from chunk events and order params
 */
export function calculateExecutionSummary(
  executionData: OrderExecutionData,
  minBuyPerChunk: bigint,
  sellDecimals: number,
  buyDecimals: number,
): ExecutionSummary {
  const { totalSold, totalReceived, chunks } = executionData;
  
  // Calculate minimum expected based on chunks executed
  const minExpected = minBuyPerChunk * BigInt(chunks.length);
  
  // Surplus
  const surplusAmount = totalReceived > minExpected ? totalReceived - minExpected : 0n;
  const surplusPercentage = minExpected > 0n
    ? Number((surplusAmount * 10000n) / minExpected) / 100
    : 0;
  
  // Rates (sell token per buy token, e.g., 3000 USDC per 1 WETH)
  const actualRate = totalReceived > 0n
    ? parseFloat(formatUnits(totalSold, sellDecimals)) / parseFloat(formatUnits(totalReceived, buyDecimals))
    : 0;
  
  // Min rate from order params (chunkSize / minBuyPerChunk)
  const chunkSize = chunks.length > 0 ? chunks[0].sellAmount : 0n;
  const minRate = minBuyPerChunk > 0n
    ? parseFloat(formatUnits(chunkSize, sellDecimals)) / parseFloat(formatUnits(minBuyPerChunk, buyDecimals))
    : 0;
  
  // Rate improvement (lower rate = better, so improvement = (min - actual) / min * 100)
  const rateImprovement = minRate > 0 ? ((minRate - actualRate) / minRate) * 100 : 0;
  
  // Per-chunk details
  const chunkDetails: ChunkDetail[] = chunks.map(chunk => {
    const chunkRate = chunk.buyAmount > 0n
      ? parseFloat(formatUnits(chunk.sellAmount, sellDecimals)) / parseFloat(formatUnits(chunk.buyAmount, buyDecimals))
      : 0;
    
    const chunkMinBuy = minBuyPerChunk;
    const chunkSurplus = chunk.buyAmount > chunkMinBuy ? chunk.buyAmount - chunkMinBuy : 0n;
    const chunkSurplusPercentage = chunkMinBuy > 0n
      ? Number((chunkSurplus * 10000n) / chunkMinBuy) / 100
      : 0;
    
    return {
      chunkIndex: chunk.chunkIndex,
      sellAmount: chunk.sellAmount,
      buyAmount: chunk.buyAmount,
      rate: chunkRate,
      surplusPercentage: chunkSurplusPercentage,
      txHash: chunk.txHash,
    };
  });
  
  return {
    totalSold,
    totalReceived,
    minExpected,
    surplusAmount,
    surplusPercentage,
    actualRate,
    minRate,
    rateImprovement,
    chunkDetails,
  };
}

/**
 * Format rate for display
 * @param rate Rate value (e.g., 3000.5)
 * @param sellSymbol Sell token symbol
 * @param buySymbol Buy token symbol
 * @returns Formatted string like "3,000.50 USDC/WETH"
 */
export function formatRate(rate: number, sellSymbol: string, buySymbol: string): string {
  if (rate === 0 || !isFinite(rate)) return "-";
  
  const formatted = rate >= 1000
    ? rate.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : rate >= 1
    ? rate.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : rate.toLocaleString(undefined, { maximumFractionDigits: 6 });
  
  return `${formatted} ${sellSymbol}/${buySymbol}`;
}

/**
 * Format surplus for display
 * @param surplusAmount Surplus in buy token units
 * @param surplusPercentage Surplus percentage
 * @param buyDecimals Buy token decimals
 * @param buySymbol Buy token symbol
 * @returns Formatted string like "+0.002 WETH (+6.67%)"
 */
export function formatSurplus(
  surplusAmount: bigint,
  surplusPercentage: number,
  buyDecimals: number,
  buySymbol: string,
): string {
  if (surplusAmount === 0n) return "No surplus";
  
  const amount = parseFloat(formatUnits(surplusAmount, buyDecimals));
  const amountStr = amount >= 1
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
  
  return `+${amountStr} ${buySymbol} (+${surplusPercentage.toFixed(2)}%)`;
}

/**
 * Store quote rate when order is created (for price impact calculation)
 */
export function storeOrderQuoteRate(
  chainId: number,
  orderHash: string,
  quoteRate: number,
  quotedAt: number = Date.now(),
): void {
  if (typeof window === "undefined") return;
  
  try {
    const key = `kapan-order-quote-${chainId}-${orderHash.toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify({ quoteRate, quotedAt }));
  } catch (e) {
    console.warn("[storeOrderQuoteRate] Failed to store:", e);
  }
}

/**
 * Get stored quote rate for an order
 */
export function getOrderQuoteRate(
  chainId: number,
  orderHash: string,
): { quoteRate: number; quotedAt: number } | null {
  if (typeof window === "undefined") return null;
  
  try {
    const key = `kapan-order-quote-${chainId}-${orderHash.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (e) {
    return null;
  }
}

/**
 * Calculate price impact vs quote rate
 */
export function calculatePriceImpact(actualRate: number, quoteRate: number): number {
  if (quoteRate === 0 || actualRate === 0) return 0;
  // Lower rate = better (less sell per buy)
  // Impact = (actual - quote) / quote * 100
  // Negative = favorable (got better rate)
  return ((actualRate - quoteRate) / quoteRate) * 100;
}
