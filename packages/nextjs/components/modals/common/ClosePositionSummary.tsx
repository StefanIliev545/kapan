"use client";

import { FC, ReactNode } from "react";
import Image from "next/image";
import { formatTokenAmount } from "~~/utils/protocols";
import { formatUsd } from "~~/utils/formatNumber";
import type { ClosePositionToken, RemainderInfo } from "./useClosePositionQuote";

/**
 * Fee breakdown for the swap
 */
export interface SwapFeeBreakdown {
  /** Aggregator fees (e.g., AVNU fees) */
  aggregatorFee: bigint;
  aggregatorFeeUsd?: number;
  /** Integrator fees (if any) */
  integratorFee?: bigint;
  integratorFeeUsd?: number;
  /** Network/gas fees */
  gasFeeUsd?: number;
  /** Fees token info for formatting */
  feeToken: {
    decimals: number;
    name: string;
  };
}

/**
 * Props for the swap exchange display
 */
export interface SwapExchangeDisplayProps {
  /** Token being sold (collateral) */
  sellToken: ClosePositionToken;
  /** Token being bought (debt token) */
  buyToken: ClosePositionToken;
  /** Amount being sold */
  sellAmount: bigint;
  /** Amount being bought */
  buyAmount: bigint;
  /** USD value of sell amount */
  sellAmountUsd?: number;
  /** USD value of buy amount */
  buyAmountUsd?: number;
}

/**
 * Displays the swap exchange: sell token -> buy token
 */
export const SwapExchangeDisplay: FC<SwapExchangeDisplayProps> = ({
  sellToken,
  buyToken,
  sellAmount,
  buyAmount,
  sellAmountUsd,
  buyAmountUsd,
}) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Image src={sellToken.icon} alt={sellToken.name} width={24} height={24} className="w-6 h-6" />
      <div>
        <div className="text-base font-medium">
          {formatTokenAmount(sellAmount.toString(), sellToken.decimals)} {sellToken.name}
        </div>
        {sellAmountUsd !== undefined && (
          <div className="text-[11px] text-gray-500">{formatUsd(sellAmountUsd)}</div>
        )}
      </div>
    </div>
    <div className="text-gray-400">&rarr;</div>
    <div className="flex items-center gap-2">
      <Image src={buyToken.icon} alt={buyToken.name} width={24} height={24} className="w-6 h-6" />
      <div className="text-right">
        <div className="text-base font-medium">
          {formatTokenAmount(buyAmount.toString(), buyToken.decimals)} {buyToken.name}
        </div>
        {buyAmountUsd !== undefined && (
          <div className="text-[11px] text-gray-500">{formatUsd(buyAmountUsd)}</div>
        )}
      </div>
    </div>
  </div>
);

/**
 * Props for the fee breakdown display
 */
export interface FeeBreakdownDisplayProps {
  fees: SwapFeeBreakdown;
  /** Optional: show fees in debt token (for reswap scenarios) */
  showFeesInToken?: boolean;
}

/**
 * Displays the fee breakdown for a swap
 */
export const FeeBreakdownDisplay: FC<FeeBreakdownDisplayProps> = ({ fees, showFeesInToken = true }) => {
  const totalFeesUsd =
    (fees.aggregatorFeeUsd ?? 0) + (fees.integratorFeeUsd ?? 0) + (fees.gasFeeUsd ?? 0);

  return (
    <div className="space-y-1 pt-2 border-t border-gray-100">
      <div className="flex justify-between text-[12px]">
        <span className="text-gray-600">Aggregator fee</span>
        <span>
          {showFeesInToken && (
            <>
              {formatTokenAmount(fees.aggregatorFee.toString(), fees.feeToken.decimals)} {fees.feeToken.name}
              <span className="text-gray-500"> &middot; </span>
            </>
          )}
          <span className="text-gray-500">{fees.aggregatorFeeUsd !== undefined ? formatUsd(fees.aggregatorFeeUsd) : "-"}</span>
        </span>
      </div>

      {fees.integratorFee !== undefined && fees.integratorFee > 0n && (
        <div className="flex justify-between text-[12px]">
          <span className="text-gray-600">Integrator fee</span>
          <span>
            {showFeesInToken && (
              <>
                {formatTokenAmount(fees.integratorFee.toString(), fees.feeToken.decimals)} {fees.feeToken.name}
                <span className="text-gray-500"> &middot; </span>
              </>
            )}
            <span className="text-gray-500">{fees.integratorFeeUsd !== undefined ? formatUsd(fees.integratorFeeUsd) : "-"}</span>
          </span>
        </div>
      )}

      <div className="flex justify-between text-[12px]">
        <span className="text-gray-600">Network fee</span>
        <span className="text-gray-700">{fees.gasFeeUsd !== undefined ? formatUsd(fees.gasFeeUsd) : "-"}</span>
      </div>

      <div className="flex justify-between text-[12px]">
        <span className="text-gray-600">Total fees (USD)</span>
        <span className="text-gray-700">{formatUsd(totalFeesUsd)}</span>
      </div>
    </div>
  );
};

/**
 * Props for the withdraw remainder display
 */
export interface WithdrawRemainderDisplayProps {
  /** Token being withdrawn (collateral) */
  token: ClosePositionToken;
  /** Remainder info from useClosePositionQuote */
  remainderInfo: RemainderInfo;
  /** Action button or content to render on the right */
  action?: ReactNode;
}

/**
 * Displays the remainder amount to be withdrawn after swap
 */
export const WithdrawRemainderDisplay: FC<WithdrawRemainderDisplayProps> = ({
  token,
  remainderInfo,
  action,
}) => (
  <div className="pt-2 border-t border-gray-100">
    <div className="text-[12px] text-gray-600 mb-1">Withdraw</div>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Image src={token.icon} alt={token.name} width={20} height={20} className="w-5 h-5" />
        <div>
          <div className="text-base font-medium">
            {remainderInfo.remainderFormatted} {token.name}
          </div>
          {remainderInfo.remainderUsd !== undefined && (
            <div className="text-[11px] text-gray-500">{formatUsd(remainderInfo.remainderUsd)}</div>
          )}
        </div>
      </div>
      {action}
    </div>
  </div>
);

/**
 * Props for the complete close position summary
 */
export interface ClosePositionSummaryProps {
  /** Token being sold (collateral) */
  collateral: ClosePositionToken;
  /** Token being bought (debt) */
  debt: ClosePositionToken;
  /** Amount being sold */
  sellAmount: bigint;
  /** Amount being bought */
  buyAmount: bigint;
  /** USD values */
  sellAmountUsd?: number;
  buyAmountUsd?: number;
  /** Fee breakdown */
  fees: SwapFeeBreakdown;
  /** Remainder info (optional - show withdraw section if provided) */
  remainderInfo?: RemainderInfo | null;
  /** Action button for the withdraw section */
  withdrawAction?: ReactNode;
  /** Additional content after fees */
  additionalContent?: ReactNode;
}

/**
 * Complete close position summary component
 * Combines swap exchange, fees, and withdraw remainder displays
 */
export const ClosePositionSummary: FC<ClosePositionSummaryProps> = ({
  collateral,
  debt,
  sellAmount,
  buyAmount,
  sellAmountUsd,
  buyAmountUsd,
  fees,
  remainderInfo,
  withdrawAction,
  additionalContent,
}) => (
  <div className="space-y-3">
    <SwapExchangeDisplay
      sellToken={collateral}
      buyToken={debt}
      sellAmount={sellAmount}
      buyAmount={buyAmount}
      sellAmountUsd={sellAmountUsd}
      buyAmountUsd={buyAmountUsd}
    />

    <FeeBreakdownDisplay fees={fees} />

    {additionalContent}

    {remainderInfo && (
      <WithdrawRemainderDisplay
        token={collateral}
        remainderInfo={remainderInfo}
        action={withdrawAction}
      />
    )}
  </div>
);

export default ClosePositionSummary;
