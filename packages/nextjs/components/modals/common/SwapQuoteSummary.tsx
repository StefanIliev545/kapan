"use client";

import { FC } from "react";
import Image from "next/image";
import { formatTokenAmount } from "~~/utils/protocols";
import { formatUsd } from "~~/utils/formatNumber";

export interface TokenDisplay {
  name: string;
  icon: string;
  decimals: number;
}

export interface SwapQuoteItem {
  sellToken: TokenDisplay;
  buyToken: TokenDisplay;
  sellAmount: bigint;
  buyAmount: bigint;
  sellAmountInUsd?: number;
  buyAmountInUsd?: number;
}

export interface SwapFees {
  avnuFeesInUsd?: number;
  integratorFeesInUsd?: number;
  gasFeesInUsd?: number;
}

export interface AggregatedFees {
  avnu: number;
  integrator: number;
  gas: number;
}

interface SwapQuoteSummaryProps {
  /** Single swap or array of swaps to display */
  swaps: SwapQuoteItem | SwapQuoteItem[];
  /** Fees can be provided directly or aggregated from multiple swaps */
  fees: SwapFees | AggregatedFees;
  /** Optional className for the container */
  className?: string;
  /** Whether to show swap details (default: true) */
  showSwaps?: boolean;
}

export interface SwapFeeSummaryProps {
  /** Fees can be provided directly or aggregated from multiple swaps */
  fees: SwapFees | AggregatedFees;
  /** Optional className for the container */
  className?: string;
}

const isAggregatedFees = (fees: SwapFees | AggregatedFees): fees is AggregatedFees => {
  return "avnu" in fees;
};

const SingleSwapDisplay: FC<{ swap: SwapQuoteItem }> = ({ swap }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span>Swap</span>
      <span className="flex items-center gap-2 font-medium">
        <Image
          src={swap.sellToken.icon}
          alt={swap.sellToken.name}
          width={20}
          height={20}
          className="rounded-full"
        />
        {formatTokenAmount(swap.sellAmount.toString(), swap.sellToken.decimals)} {swap.sellToken.name}
      </span>
    </div>
    <div className="flex items-center justify-between">
      <span>Receive</span>
      <span className="flex items-center gap-2 font-medium">
        <Image
          src={swap.buyToken.icon}
          alt={swap.buyToken.name}
          width={20}
          height={20}
          className="rounded-full"
        />
        {formatTokenAmount(swap.buyAmount.toString(), swap.buyToken.decimals)} {swap.buyToken.name}
      </span>
    </div>
  </div>
);

/**
 * Standalone fee summary component for displaying swap fees.
 * Use this when you have custom swap display but want consistent fee formatting.
 */
export const SwapFeeSummary: FC<SwapFeeSummaryProps> = ({ fees, className = "" }) => {
  const aggregated = isAggregatedFees(fees);

  const avnuFee = aggregated ? fees.avnu : (fees.avnuFeesInUsd ?? 0);
  const integratorFee = aggregated ? fees.integrator : (fees.integratorFeesInUsd ?? 0);
  const gasFee = aggregated ? fees.gas : (fees.gasFeesInUsd ?? 0);

  return (
    <div className={`border-base-300 text-base-content/70 space-y-1 border-t pt-2 text-xs ${className}`}>
      <div className="flex justify-between">
        <span>{aggregated ? "Total AVNU fees" : "AVNU fee"}</span>
        <span>{formatUsd(avnuFee)}</span>
      </div>
      {integratorFee > 0 && (
        <div className="flex justify-between">
          <span>{aggregated ? "Total integrator fees" : "Integrator fee"}</span>
          <span>{formatUsd(integratorFee)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>{aggregated ? "Total network fees" : "Network fee"}</span>
        <span>{formatUsd(gasFee)}</span>
      </div>
    </div>
  );
};

export const SwapQuoteSummary: FC<SwapQuoteSummaryProps> = ({ swaps, fees, className = "", showSwaps = true }) => {
  const swapArray = Array.isArray(swaps) ? swaps : [swaps];

  return (
    <div className={`bg-base-200/60 space-y-3 rounded-md p-3 text-sm ${className}`}>
      {showSwaps && swapArray.map((swap, index) => (
        <SingleSwapDisplay
          key={`${swap.sellToken.name}-${swap.buyToken.name}-${index}`}
          swap={swap}
        />
      ))}
      <SwapFeeSummary fees={fees} className={showSwaps ? "" : "border-t-0 pt-0"} />
    </div>
  );
};

export default SwapQuoteSummary;
