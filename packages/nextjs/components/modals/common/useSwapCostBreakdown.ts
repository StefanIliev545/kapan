import { useMemo } from "react";
import { formatUnits } from "viem";
import type { FlashLoanProviderOption } from "~~/utils/flashLoan";

interface UseSwapCostBreakdownInput {
  /** Selected flash-loan provider — supplies feeBps. May be null while loading. */
  selectedProvider: FlashLoanProviderOption | null | undefined;
  /** Raw flash-loan principal in `flashTokenDecimals`. The fee is feeBps × this amount. */
  flashAmountRaw: bigint;
  /** Decimals of the token the flash loan is denominated in (collateral or debt depending on flow). */
  flashTokenDecimals: number;
  /** USD price of the flash token, 1e8-scaled (e.g., from Aave UiHelper). */
  flashTokenPriceRaw: bigint | undefined;
  /** Input-side USD value (collateral sold / debt repaid) — computed by the caller. */
  srcUsdFallback: number | undefined;
  /** Output-side USD value (token received) — computed by the caller. */
  dstUsdFallback: number | undefined;
  /** Realized price-impact percent from useAutoSlippage. May be null when no quote. */
  priceImpact: number | null | undefined;
  /** User's slippage tolerance, percent (e.g., 0.5 means 0.5%). */
  slippage: number;
}

export interface SwapCostBreakdown {
  flashFeeUsd: number;
  priceImpactUsd: number;
  priceImpactPct: number;
  maxSlippageUsd: number;
  slippagePct: number;
  /** Worst-case total = flash fee + max(realized impact, slippage allowance). */
  totalCostUsd: number;
  /** True iff there's any USD basis to derive figures from — drives whether the row renders. */
  hasAnyData: boolean;
}

/**
 * Shared swap cost-breakdown computation for leverage / close / swap modals.
 *
 * Realized price impact and worst-case slippage are *alternative* cost ceilings rather than
 * additive: if realized exceeds slippage the on-chain minOut would revert, and if slippage is
 * the binding constraint that's what the user actually pays. So `totalCostUsd` uses
 * `flash + max(realized, slippage)` rather than summing them.
 */
export function useSwapCostBreakdown({
  selectedProvider,
  flashAmountRaw,
  flashTokenDecimals,
  flashTokenPriceRaw,
  srcUsdFallback,
  dstUsdFallback,
  priceImpact,
  slippage,
}: UseSwapCostBreakdownInput): SwapCostBreakdown {
  return useMemo(() => {
    const feeBps = selectedProvider?.feeBps ?? 0;

    let flashFeeUsd = 0;
    if (feeBps > 0 && flashAmountRaw > 0n && flashTokenPriceRaw && flashTokenPriceRaw > 0n) {
      const flashFeeRaw = (flashAmountRaw * BigInt(feeBps)) / 10000n;
      const flashFeeAmount = Number.parseFloat(formatUnits(flashFeeRaw, flashTokenDecimals));
      const priceUsd = Number(formatUnits(flashTokenPriceRaw, 8));
      flashFeeUsd = flashFeeAmount * priceUsd;
    }

    let priceImpactUsd = 0;
    let priceImpactPct = 0;
    if (srcUsdFallback !== undefined && dstUsdFallback !== undefined) {
      const diff = srcUsdFallback - dstUsdFallback;
      if (diff > 0) {
        priceImpactUsd = diff;
        if (srcUsdFallback > 0) priceImpactPct = (diff / srcUsdFallback) * 100;
      }
    } else if (priceImpact !== null && priceImpact !== undefined && priceImpact > 0 && srcUsdFallback) {
      priceImpactUsd = (priceImpact / 100) * srcUsdFallback;
      priceImpactPct = priceImpact;
    }

    const valueBasisUsd = Math.max(srcUsdFallback ?? 0, dstUsdFallback ?? 0);
    const maxSlippageUsd = (slippage / 100) * valueBasisUsd;

    const swapWorstCaseUsd = Math.max(priceImpactUsd, maxSlippageUsd);

    const hasAnyData =
      flashFeeUsd > 0 ||
      priceImpactUsd > 0 ||
      maxSlippageUsd > 0 ||
      srcUsdFallback !== undefined ||
      dstUsdFallback !== undefined;

    return {
      flashFeeUsd,
      priceImpactUsd,
      priceImpactPct,
      maxSlippageUsd,
      slippagePct: slippage,
      totalCostUsd: flashFeeUsd + swapWorstCaseUsd,
      hasAnyData,
    };
  }, [
    selectedProvider,
    flashAmountRaw,
    flashTokenDecimals,
    flashTokenPriceRaw,
    srcUsdFallback,
    dstUsdFallback,
    priceImpact,
    slippage,
  ]);
}
