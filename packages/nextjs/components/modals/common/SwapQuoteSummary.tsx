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
}

const isAggregatedFees = (fees: SwapFees | AggregatedFees): fees is AggregatedFees => {
  return "avnu" in fees;
};

const SingleSwapDisplay: FC<{ swap: SwapQuoteItem }> = ({ swap }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span>Swap</span>
      <span className="font-medium flex items-center gap-2">
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
      <span className="font-medium flex items-center gap-2">
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

export const SwapQuoteSummary: FC<SwapQuoteSummaryProps> = ({ swaps, fees, className = "" }) => {
  const swapArray = Array.isArray(swaps) ? swaps : [swaps];
  const aggregated = isAggregatedFees(fees);

  const avnuFee = aggregated ? fees.avnu : (fees.avnuFeesInUsd ?? 0);
  const integratorFee = aggregated ? fees.integrator : (fees.integratorFeesInUsd ?? 0);
  const gasFee = aggregated ? fees.gas : (fees.gasFeesInUsd ?? 0);

  return (
    <div className={`rounded-md bg-base-200/60 p-3 space-y-3 text-sm ${className}`}>
      {swapArray.map((swap, index) => (
        <SingleSwapDisplay
          key={`${swap.sellToken.name}-${swap.buyToken.name}-${index}`}
          swap={swap}
        />
      ))}

      <div className="pt-2 border-t border-base-300 space-y-1 text-xs text-base-content/70">
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
    </div>
  );
};

export default SwapQuoteSummary;
