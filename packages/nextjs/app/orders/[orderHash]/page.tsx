"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useChainId, usePublicClient } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useCopyToClipboard } from "~~/hooks/common/useCopyToClipboard";
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
import {
  getOrderNote,
  getOperationLabel,
  getOperationColorClass,
  findPendingNoteForOrder,
  linkNoteToOrderHash,
  type OperationType,
} from "~~/utils/orderNotes";
import { getProtocolLogo } from "~~/utils/protocol";
import { LoadingOverlay, LoadingSpinner } from "~~/components/common/Loading";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";
import { formatDateTime } from "~~/utils/deadline";
import { truncateAddress } from "~~/utils/address";

const ORDER_MANAGER_ADDRESSES: Record<number, Address | undefined> = {
  42161: "0x8F94351Ac17B4B5fb0923D229319805bB52616CD",
  8453: "0xE4b28de3AA865540Bbc1C71892b6b6Af24929858",
};

// ----- Formatting utilities -----

function formatAmount(amount: bigint, decimals: number, maxDecimals?: number): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  const max = maxDecimals ?? (num >= 1000 ? 2 : num >= 1 ? 4 : 6);
  return num.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: 0 });
}

function formatAmountPrecise(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
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

// ----- ABI definition -----

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

// ----- Sub-components -----

const handleHistoryBack = () => window.history.back();

function BackButton() {
  return (
    <div className="mx-auto mb-8 max-w-7xl">
      <button
        onClick={handleHistoryBack}
        className="text-base-content/50 hover:text-base-content inline-flex items-center gap-2 text-sm transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
    </div>
  );
}

interface OperationBadgeProps {
  operationType: OperationType;
  operationLabel: string;
  operationColorClass: string;
  protocolName: string | undefined;
  protocolLogo: string | null;
}

function OperationBadge({ operationType, operationLabel, operationColorClass, protocolName, protocolLogo }: OperationBadgeProps) {
  if (operationType === "unknown" && !protocolName) {
    return null;
  }

  return (
    <div className="mb-6 flex items-center gap-3">
      {operationType !== "unknown" && (
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${operationColorClass}`}>
          {operationLabel}
        </span>
      )}
      {protocolName && (
        <div className="bg-base-200 flex items-center gap-2 rounded-full px-3 py-1">
          {protocolLogo && (
            <Image
              src={protocolLogo}
              alt={protocolName}
              width={18}
              height={18}
              className="rounded-sm"
            />
          )}
          <span className="text-base-content/70 text-sm">{protocolName}</span>
        </div>
      )}
    </div>
  );
}

interface TokenDisplayProps {
  symbol: string;
  label: string;
  colorClass?: string;
}

function TokenDisplay({ symbol, label, colorClass = "text-base-content" }: TokenDisplayProps) {
  return (
    <div className="flex items-center gap-4">
      <Image
        src={tokenNameToLogo(symbol)}
        alt={symbol}
        width={64}
        height={64}
        className="rounded-full"
      />
      <div>
        <span className="text-base-content/50 block text-sm">{label}</span>
        <span className={`text-3xl font-bold md:text-4xl ${colorClass}`}>{symbol}</span>
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  isActive: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  createdAt: bigint;
}

function StatusBadge({ isActive, isCompleted, isCancelled, createdAt }: StatusBadgeProps) {
  const statusConfig = getStatusConfig(isActive, isCompleted, isCancelled);

  return (
    <div className="flex items-center gap-4">
      <div className={`rounded-full px-4 py-2 text-sm font-semibold ${statusConfig.className}`}>
        {statusConfig.label}
      </div>
      <span className="text-base-content/40 text-sm">{formatDateTime(createdAt)}</span>
    </div>
  );
}

function getStatusConfig(isActive: boolean, isCompleted: boolean, isCancelled: boolean) {
  if (isActive) {
    return { className: 'bg-warning/20 text-warning', label: 'Active' };
  }
  if (isCompleted) {
    return { className: 'bg-success/20 text-success', label: 'Completed' };
  }
  if (isCancelled) {
    return { className: 'bg-error/20 text-error', label: 'Cancelled' };
  }
  return { className: 'bg-base-300 text-base-content/50', label: 'Unknown' };
}

interface TokenPairHeroProps {
  sellSymbol: string;
  buySymbol: string;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  createdAt: bigint;
}

function TokenPairHero({ sellSymbol, buySymbol, isActive, isCompleted, isCancelled, createdAt }: TokenPairHeroProps) {
  return (
    <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-6 md:gap-10">
        <TokenDisplay symbol={sellSymbol} label="Sell" />
        <ArrowIcon />
        <TokenDisplay symbol={buySymbol} label="Buy" colorClass="text-success" />
      </div>
      <StatusBadge isActive={isActive} isCompleted={isCompleted} isCancelled={isCancelled} createdAt={createdAt} />
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="text-primary size-8 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

interface ProgressBarProps {
  completedChunks: number;
  totalChunks: number;
}

function ProgressBar({ completedChunks, totalChunks }: ProgressBarProps) {
  const progressPercent = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;
  const progressStyle = useMemo(() => ({ width: `${progressPercent}%` }), [progressPercent]);

  return (
    <div className="mb-12">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-base-content/50 text-sm">Progress</span>
        <span className="text-base-content/80 font-mono text-sm">{completedChunks} / {totalChunks} chunks</span>
      </div>
      <div className="bg-base-300 relative h-2">
        <div
          className="bg-primary absolute inset-y-0 left-0 transition-all duration-700 ease-out"
          style={progressStyle}
        />
      </div>
      <div className="mt-1 text-right">
        <span className="text-primary font-semibold">{progressPercent.toFixed(0)}%</span>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  children: React.ReactNode;
}

function StatCard({ label, children }: StatCardProps) {
  return (
    <div>
      <span className="text-base-content/50 mb-1 block text-sm">{label}</span>
      {children}
    </div>
  );
}

interface TotalSoldStatProps {
  executedAmount: bigint;
  preTotalAmount: bigint;
  sellDecimals: number;
  sellSymbol: string;
  totalSoldUsd: number | null;
}

function TotalSoldStat({ executedAmount, preTotalAmount, sellDecimals, sellSymbol, totalSoldUsd }: TotalSoldStatProps) {
  return (
    <StatCard label="Total Sold">
      <span className="text-2xl font-bold">{formatAmount(executedAmount, sellDecimals)}</span>
      <span className="text-base-content/60 ml-1">{sellSymbol}</span>
      {totalSoldUsd !== null && (
        <p className="text-base-content/50 mt-0.5 text-sm">{formatUsd(totalSoldUsd)}</p>
      )}
      <p className="text-base-content/40 mt-1 text-xs">
        of {formatAmount(preTotalAmount, sellDecimals)} {sellSymbol}
      </p>
    </StatCard>
  );
}

interface TotalReceivedStatProps {
  isLoadingEvents: boolean;
  totalReceived: bigint | undefined;
  buyDecimals: number;
  buySymbol: string;
  totalReceivedUsd: number | null;
  totalMinBuy: bigint;
}

function TotalReceivedStat({ isLoadingEvents, totalReceived, buyDecimals, buySymbol, totalReceivedUsd, totalMinBuy }: TotalReceivedStatProps) {
  if (isLoadingEvents) {
    return (
      <StatCard label="Total Received">
        <LoadingSpinner size="sm" />
      </StatCard>
    );
  }

  if (!totalReceived) {
    return (
      <StatCard label="Total Received">
        <span className="text-base-content/40 text-2xl">-</span>
      </StatCard>
    );
  }

  return (
    <StatCard label="Total Received">
      <span className="text-success text-2xl font-bold">{formatAmount(totalReceived, buyDecimals)}</span>
      <span className="text-base-content/60 ml-1">{buySymbol}</span>
      {totalReceivedUsd !== null && (
        <p className="text-success/80 mt-0.5 text-sm">{formatUsd(totalReceivedUsd)}</p>
      )}
      <p className="text-base-content/40 mt-1 text-xs">
        min: {formatAmount(totalMinBuy, buyDecimals)} {buySymbol}
      </p>
    </StatCard>
  );
}

interface SurplusStatProps {
  surplusAmount: bigint | undefined;
  surplusPercentage: number | undefined;
  buyDecimals: number;
  buySymbol: string;
  surplusUsd: number | null;
}

function SurplusStat({ surplusAmount, surplusPercentage, buyDecimals, buySymbol, surplusUsd }: SurplusStatProps) {
  const hasSurplus = surplusAmount !== undefined && surplusAmount > 0n;

  if (!hasSurplus) {
    return (
      <StatCard label="Surplus">
        <span className="text-base-content/40 text-2xl">-</span>
      </StatCard>
    );
  }

  return (
    <StatCard label="Surplus">
      <span className="text-success text-2xl font-bold">+{formatAmountPrecise(surplusAmount, buyDecimals)}</span>
      <span className="text-success/80 ml-1">{buySymbol}</span>
      {surplusUsd !== null && surplusUsd > 0 && (
        <p className="text-success/80 mt-0.5 text-sm">{formatUsd(surplusUsd)}</p>
      )}
      <p className="text-success mt-1 text-xs">+{surplusPercentage?.toFixed(2)}% above min</p>
    </StatCard>
  );
}

interface ExecutionRateStatProps {
  actualRate: number | undefined;
  buySymbol: string;
  sellSymbol: string;
}

function ExecutionRateStat({ actualRate, buySymbol, sellSymbol }: ExecutionRateStatProps) {
  if (!actualRate) {
    return (
      <StatCard label="Execution Rate">
        <span className="text-base-content/40 text-2xl">-</span>
      </StatCard>
    );
  }

  return (
    <StatCard label="Execution Rate">
      <span className="font-mono text-2xl font-bold">{(1 / actualRate).toFixed(4)}</span>
      <p className="text-base-content/40 mt-1 text-xs">
        {buySymbol} per {sellSymbol}
      </p>
    </StatCard>
  );
}

interface StatsGridProps {
  order: OrderContext;
  sellDecimals: number;
  buyDecimals: number;
  sellSymbol: string;
  buySymbol: string;
  isLoadingEvents: boolean;
  executionData: { totalReceived: bigint } | null;
  executionSummary: { surplusAmount: bigint; surplusPercentage: number; actualRate: number } | null;
  totalSoldUsd: number | null;
  totalReceivedUsd: number | null;
  surplusUsd: number | null;
}

function StatsGrid({
  order,
  sellDecimals,
  buyDecimals,
  sellSymbol,
  buySymbol,
  isLoadingEvents,
  executionData,
  executionSummary,
  totalSoldUsd,
  totalReceivedUsd,
  surplusUsd,
}: StatsGridProps) {
  const totalChunks = Number(order.params.targetValue);
  const totalMinBuy = order.params.minBuyPerChunk * BigInt(totalChunks);

  return (
    <div className="mb-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
      <TotalSoldStat
        executedAmount={order.executedAmount}
        preTotalAmount={order.params.preTotalAmount}
        sellDecimals={sellDecimals}
        sellSymbol={sellSymbol}
        totalSoldUsd={totalSoldUsd}
      />
      <TotalReceivedStat
        isLoadingEvents={isLoadingEvents}
        totalReceived={executionData?.totalReceived}
        buyDecimals={buyDecimals}
        buySymbol={buySymbol}
        totalReceivedUsd={totalReceivedUsd}
        totalMinBuy={totalMinBuy}
      />
      <SurplusStat
        surplusAmount={executionSummary?.surplusAmount}
        surplusPercentage={executionSummary?.surplusPercentage}
        buyDecimals={buyDecimals}
        buySymbol={buySymbol}
        surplusUsd={surplusUsd}
      />
      <ExecutionRateStat
        actualRate={executionSummary?.actualRate}
        buySymbol={buySymbol}
        sellSymbol={sellSymbol}
      />
    </div>
  );
}

interface OrderParametersProps {
  order: OrderContext;
  sellDecimals: number;
  buyDecimals: number;
  sellSymbol: string;
  buySymbol: string;
  executionSummary: { minRate: number; rateImprovement: number } | null;
  priceImpact: number | null;
}

function OrderParameters({ order, sellDecimals, buyDecimals, sellSymbol, buySymbol, executionSummary, priceImpact }: OrderParametersProps) {
  return (
    <div>
      <h3 className="text-base-content/80 mb-4 text-lg font-semibold">Order Parameters</h3>
      <div className="space-y-3">
        <ParameterRow label="Chunk Size" value={`${formatAmount(order.params.chunkSize, sellDecimals)} ${sellSymbol}`} />
        <ParameterRow label="Min Buy / Chunk" value={`${formatAmount(order.params.minBuyPerChunk, buyDecimals)} ${buySymbol}`} />
        {executionSummary && (
          <>
            <ParameterRow label="Min Rate" value={executionSummary.minRate.toFixed(6)} valueClassName="text-base-content/60 font-mono" />
            {executionSummary.rateImprovement > 0 && (
              <ParameterRow label="Rate Improvement" value={`+${executionSummary.rateImprovement.toFixed(2)}%`} valueClassName="text-success font-medium" />
            )}
            {priceImpact !== null && (
              <PriceImpactRow priceImpact={priceImpact} />
            )}
          </>
        )}
        <FlashLoanRow isEnabled={order.params.isFlashLoanOrder} />
        <ParameterRow label="Min Health Factor" value={formatUnits(order.params.minHealthFactor, 18)} />
      </div>
    </div>
  );
}

interface ParameterRowProps {
  label: string;
  value: string;
  valueClassName?: string;
}

function ParameterRow({ label, value, valueClassName = "font-medium" }: ParameterRowProps) {
  return (
    <div className="border-base-300/50 flex justify-between border-b py-2">
      <span className="text-base-content/50">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

function PriceImpactRow({ priceImpact }: { priceImpact: number }) {
  const isPositive = priceImpact < 0;
  const isNegative = priceImpact > 0;
  const className = isPositive ? 'text-success font-medium' : isNegative ? 'text-warning font-medium' : '';
  const displayValue = `${isPositive ? '+' : ''}${(-priceImpact).toFixed(2)}%`;

  return (
    <div className="border-base-300/50 flex justify-between border-b py-2">
      <span className="text-base-content/50">vs Initial Quote</span>
      <span className={className}>{displayValue}</span>
    </div>
  );
}

function FlashLoanRow({ isEnabled }: { isEnabled: boolean }) {
  return (
    <div className="border-base-300/50 flex justify-between border-b py-2">
      <span className="text-base-content/50">Flash Loan</span>
      <span className={isEnabled ? 'text-primary font-medium' : 'text-base-content/40'}>
        {isEnabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}

interface ChunkDetail {
  chunkIndex: number;
  sellAmount: bigint;
  buyAmount: bigint;
  surplusPercentage: number;
  txHash: string;
}

interface ExecutionHistoryProps {
  chunkDetails: ChunkDetail[];
  sellDecimals: number;
  buyDecimals: number;
  chainId: number;
}

function ExecutionHistory({ chunkDetails, sellDecimals, buyDecimals, chainId }: ExecutionHistoryProps) {
  return (
    <div>
      <h3 className="text-base-content/80 mb-4 text-lg font-semibold">Execution History</h3>
      {chunkDetails.length > 0 ? (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-2">
          {chunkDetails.map((chunk) => (
            <ChunkRow
              key={chunk.chunkIndex}
              chunk={chunk}
              sellDecimals={sellDecimals}
              buyDecimals={buyDecimals}
              chainId={chainId}
            />
          ))}
        </div>
      ) : (
        <p className="text-base-content/40 text-sm">No executions yet</p>
      )}
    </div>
  );
}

interface ChunkRowProps {
  chunk: ChunkDetail;
  sellDecimals: number;
  buyDecimals: number;
  chainId: number;
}

function ChunkRow({ chunk, sellDecimals, buyDecimals, chainId }: ChunkRowProps) {
  return (
    <div className="bg-base-200/50 flex items-center justify-between rounded-lg px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-base-content/40 w-6 font-mono text-xs">#{chunk.chunkIndex}</span>
        <span className="text-sm">{formatAmount(chunk.sellAmount, sellDecimals)}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="text-base-content/30 size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <span className="text-success text-sm">{formatAmount(chunk.buyAmount, buyDecimals)}</span>
      </div>
      <div className="flex items-center gap-3">
        {chunk.surplusPercentage > 0 && (
          <span className="text-success text-xs font-medium">+{chunk.surplusPercentage.toFixed(2)}%</span>
        )}
        <a
          href={getBlockExplorerTxLink(chainId, chunk.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 text-xs"
        >
          tx
        </a>
      </div>
    </div>
  );
}

interface OrderFooterProps {
  orderHash: string;
  chainId: number;
  orderManagerAddress: Address | undefined;
}

function OrderFooter({ orderHash, chainId, orderManagerAddress }: OrderFooterProps) {
  const { copy: copyToClipboard } = useCopyToClipboard();
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopyOrderHash = useCallback(() => copyToClipboard(orderHash), [copyToClipboard, orderHash]);
  const handleCopyShareUrl = useCallback(() => copyToClipboard(shareUrl), [copyToClipboard, shareUrl]);

  return (
    <div className="border-base-300/50 border-t pt-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <OrderHashDisplay orderHash={orderHash} onCopy={handleCopyOrderHash} />
        <FooterLinks
          chainId={chainId}
          orderManagerAddress={orderManagerAddress}
          shareUrl={shareUrl}
          onCopyShare={handleCopyShareUrl}
        />
      </div>
    </div>
  );
}

interface OrderHashDisplayProps {
  orderHash: string;
  onCopy: () => void;
}

function OrderHashDisplay({ orderHash, onCopy }: OrderHashDisplayProps) {
  return (
    <div className="min-w-0 flex-1">
      <span className="text-base-content/50 mb-1 block text-xs">Order Hash</span>
      <div className="flex items-center gap-2">
        <code className="text-base-content/70 truncate text-xs">{orderHash}</code>
        <button
          onClick={onCopy}
          className="hover:bg-base-200 flex-shrink-0 rounded p-1 transition-colors"
          title="Copy"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="text-base-content/40 size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface FooterLinksProps {
  chainId: number;
  orderManagerAddress: Address | undefined;
  shareUrl: string;
  onCopyShare: () => void;
}

function FooterLinks({ chainId, orderManagerAddress, shareUrl, onCopyShare }: FooterLinksProps) {
  return (
    <div className="flex items-center gap-6">
      <a
        href={getCowExplorerAddressUrl(chainId, orderManagerAddress || "")}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm"
      >
        CoW Explorer
        <ExternalLinkIcon />
      </a>

      <button
        onClick={onCopyShare}
        className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm"
      >
        Share
        <ShareIcon />
      </button>

      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my Kapan Finance order!`)}&url=${encodeURIComponent(shareUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm"
      >
        Tweet
        <TwitterIcon />
      </a>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg className="size-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ----- Custom hooks -----

function useOrderData(orderHash: string, chainId: number) {
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

  return { order, isLoading, error, orderManagerAddress };
}

function useOrderNote(orderHash: string, sellSymbol: string, buySymbol: string, chainId: number, createdAt: number) {
  let orderNote = getOrderNote(orderHash);

  if (!orderNote) {
    const pendingNote = findPendingNoteForOrder(sellSymbol, buySymbol, chainId, createdAt);
    if (pendingNote?.salt) {
      linkNoteToOrderHash(pendingNote.salt, orderHash);
      orderNote = pendingNote;
    }
  }

  const operationType: OperationType = orderNote?.operationType ?? "unknown";
  const operationLabel = getOperationLabel(operationType);
  const operationColorClass = getOperationColorClass(operationType);
  const protocolName = orderNote?.protocol;
  const protocolLogo = protocolName ? getProtocolLogo(protocolName) : null;

  return { operationType, operationLabel, operationColorClass, protocolName, protocolLogo };
}

const EMPTY_CHUNK_DETAILS: ChunkDetail[] = [];

// ----- Main component -----

export default function OrderDetailPage() {
  const params = useParams();
  const orderHash = params.orderHash as string;
  const chainId = useChainId();

  const { order, isLoading, error, orderManagerAddress } = useOrderData(orderHash, chainId);

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
    return info?.symbol ?? truncateAddress(address);
  };

  const getTokenDecimals = (address: string): number => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.decimals ?? 18;
  };

  const sellSymbol = order ? getTokenSymbol(order.params.sellToken) : "";
  const buySymbol = order ? getTokenSymbol(order.params.buyToken) : "";

  const sellPriceData = useTokenPriceApi(sellSymbol);
  const buyPriceData = useTokenPriceApi(buySymbol);
  const sellPrice = sellPriceData.isSuccess ? (sellPriceData as { price: number }).price : undefined;
  const buyPrice = buyPriceData.isSuccess ? (buyPriceData as { price: number }).price : undefined;

  const sellDecimals = order ? getTokenDecimals(order.params.sellToken) : 18;
  const buyDecimals = order ? getTokenDecimals(order.params.buyToken) : 18;

  const executionSummary = useMemo(() => {
    if (!executionData || !order || executionData.chunks.length === 0) return null;
    return calculateExecutionSummary(executionData, order.params.minBuyPerChunk, sellDecimals, buyDecimals);
  }, [executionData, order, sellDecimals, buyDecimals]);

  const quoteData = useMemo(() => {
    if (!orderHash) return null;
    return getOrderQuoteRate(chainId, orderHash);
  }, [chainId, orderHash]);

  const priceImpact = useMemo(() => {
    if (!quoteData || !executionSummary) return null;
    return calculatePriceImpact(executionSummary.actualRate, quoteData.quoteRate);
  }, [quoteData, executionSummary]);

  const orderNoteInfo = useOrderNote(
    orderHash,
    sellSymbol,
    buySymbol,
    chainId,
    order ? Number(order.createdAt) : 0
  );

  const chunkDetails = useMemo(
    () => executionSummary?.chunkDetails ?? EMPTY_CHUNK_DETAILS,
    [executionSummary]
  );

  // Early returns for loading and error states
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingOverlay size="lg" label="Loading order details..." padded={false} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-error mb-4 text-xl">{error || "Order not found"}</p>
          <Link href="/" className="text-primary hover:underline">Back to Home</Link>
        </div>
      </div>
    );
  }

  const totalChunks = Number(order.params.targetValue);
  const completedChunks = Number(order.iterationCount);
  const isActive = order.status === OrderStatus.Active;
  const isCompleted = order.status === OrderStatus.Completed;
  const isCancelled = order.status === OrderStatus.Cancelled;

  const totalSoldUsd = sellPrice ? parseFloat(formatUnits(order.executedAmount, sellDecimals)) * sellPrice : null;
  const totalReceivedUsd = buyPrice && executionData ? parseFloat(formatUnits(executionData.totalReceived, buyDecimals)) * buyPrice : null;
  const surplusUsd = buyPrice && executionSummary ? parseFloat(formatUnits(executionSummary.surplusAmount, buyDecimals)) * buyPrice : null;

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 lg:px-16">
      <BackButton />

      <div className="mx-auto max-w-7xl">
        <OperationBadge
          operationType={orderNoteInfo.operationType}
          operationLabel={orderNoteInfo.operationLabel}
          operationColorClass={orderNoteInfo.operationColorClass}
          protocolName={orderNoteInfo.protocolName}
          protocolLogo={orderNoteInfo.protocolLogo}
        />

        <TokenPairHero
          sellSymbol={sellSymbol}
          buySymbol={buySymbol}
          isActive={isActive}
          isCompleted={isCompleted}
          isCancelled={isCancelled}
          createdAt={order.createdAt}
        />

        <ProgressBar completedChunks={completedChunks} totalChunks={totalChunks} />

        <StatsGrid
          order={order}
          sellDecimals={sellDecimals}
          buyDecimals={buyDecimals}
          sellSymbol={sellSymbol}
          buySymbol={buySymbol}
          isLoadingEvents={isLoadingEvents}
          executionData={executionData}
          executionSummary={executionSummary}
          totalSoldUsd={totalSoldUsd}
          totalReceivedUsd={totalReceivedUsd}
          surplusUsd={surplusUsd}
        />

        <div className="mb-12 grid gap-8 lg:grid-cols-2">
          <OrderParameters
            order={order}
            sellDecimals={sellDecimals}
            buyDecimals={buyDecimals}
            sellSymbol={sellSymbol}
            buySymbol={buySymbol}
            executionSummary={executionSummary}
            priceImpact={priceImpact}
          />
          <ExecutionHistory
            chunkDetails={chunkDetails}
            sellDecimals={sellDecimals}
            buyDecimals={buyDecimals}
            chainId={chainId}
          />
        </div>

        <OrderFooter
          orderHash={orderHash}
          chainId={chainId}
          orderManagerAddress={orderManagerAddress}
        />
      </div>
    </div>
  );
}
