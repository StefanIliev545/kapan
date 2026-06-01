"use client";

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Address, formatUnits, parseUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { getOneInchAdapterInfo, getKyberAdapterInfo, is1inchSupported, isKyberSupported } from "~~/utils/chainFeatures";
import { getAvailableFlashLoanProviders, getDefaultFlashLoanProvider } from "~~/utils/flashLoan";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { FlashLoanProviderSelector } from "~~/components/modals/common/FlashLoanProviderSelector";
import { useTokenPrice } from "~~/hooks/useTokenPrice";
import { CostBreakdownRows } from "~~/components/modals/common/CostBreakdownRows";
import { encodeAlchemixContext, type AlchemixMarket } from "~~/utils/alchemix/markets";
import { ALCHEMIX_GATEWAY_NAME } from "~~/utils/alchemix/protocolConstants";
import type { AlchemixPosition } from "~~/hooks/useAlchemixLendingPositions";
import { LoadingSpinner } from "~~/components/common/Loading";

/**
 * Dedicated multiply ("Loop") modal for Alchemix V3 positions.
 *
 * Why not reuse MultiplyEvmModal?
 * -------------------------------
 * MultiplyEvmModal's leverage / flash-amount / quote logic is built around the standard
 * topology: flash-loan the *debt* token, swap it to collateral, deposit, borrow debt to
 * repay flash. Alchemix V3 has the opposite topology — flash-loan the *collateral*, deposit,
 * borrow alAsset, swap alAsset → collateral exact-in to clear the flash. The modal-side UI
 * math (debt-denominated flash, debt-denominated leverage, debt-denominated displayed values)
 * doesn't translate. This modal is intentionally lightweight: just the inputs + computed
 * targets, no zap-mode branching, no E-Mode, no limit orders.
 *
 * Design assumptions
 * ------------------
 *   - Operates on an *existing* position (tokenId is required). Fresh-position multiply needs
 *     gateway-side transient-storage tokenId resolution (separate work).
 *   - alAsset ≈ underlying at peg (alUSD ≈ USDC, alETH ≈ WETH). Borrow amount sized as
 *     `flashRepay × (1 + slippage)` in debt-decimals.
 *   - Swap is alAsset → underlying via 1inch (CoW path can be wired later for chunked thin-
 *     liquidity orders if peg breaks).
 */
interface AlchemixMultiplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: AlchemixPosition;
  chainId: number;
}

const SLIPPAGE_OPTIONS = [0.5, 1, 2] as const;
const DEFAULT_SLIPPAGE = 0.5;
const MAX_LEVERAGE = 9; // 90% LTV → ~9× practical leverage with safety buffer

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export const AlchemixMultiplyModal: FC<AlchemixMultiplyModalProps> = ({ isOpen, onClose, position, chainId }) => {
  const { market, tokenId, collateralUnderlying, debt: existingDebt, maxLtvPct } = position;

  const [marginAmount, setMarginAmount] = useState("");
  const [leverage, setLeverage] = useState(2);
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMarginAmount("");
      setLeverage(2);
      setSlippage(DEFAULT_SLIPPAGE);
    }
  }, [isOpen]);

  // ============ Flash loan provider list (Aave is last-resort due to fee) ============
  const flashLoanProviders = useMemo(() => getAvailableFlashLoanProviders(chainId), [chainId]);
  const defaultFlashLoanProvider = useMemo(() => getDefaultFlashLoanProvider(chainId), [chainId]);

  // ============ Margin balance ============
  const { balance: walletMargin } = useTokenBalance(market.underlying, "evm", chainId, market.underlyingDecimals);

  const marginRaw = useMemo(() => {
    if (!marginAmount) return 0n;
    try {
      return parseUnits(marginAmount, market.underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [marginAmount, market.underlyingDecimals]);

  // ============ Computed targets ============
  // Cap leverage so the post-multiply LTV lands a hair below the protocol max.
  const effectiveMaxLtvPct = Math.max(1, Math.min(maxLtvPct - 1, 89)); // 1% buffer below max

  // Bridge decimals: scale up underlying-denominated values to debt-denominated (e.g. 1e12 for USDC↔alUSD).
  const decimalsDiff = BigInt(market.debtDecimals - market.underlyingDecimals);
  const collateralToDebtScale = decimalsDiff >= 0n ? 10n ** decimalsDiff : 1n;

  // Existing position in COLLATERAL-denominated equity (collateral - debt-as-collateral).
  // alUSD ≈ USDC at peg, so we convert debt → collateral by dividing by the decimal scale.
  // Negative equity (debt > collateral) is clamped to 0n — multiply doesn't apply.
  const existingDebtAsCollateral = existingDebt / collateralToDebtScale;
  const existingEquityCollateral = collateralUnderlying > existingDebtAsCollateral
    ? collateralUnderlying - existingDebtAsCollateral
    : 0n;

  // ============ Stage 1: fixed-size reference probe to discover the alAsset → underlying rate ============
  // We probe with a *fixed* 1-alAsset reference amount (independent of leverage) so the rate
  // discovery doesn't create a circular dep with leverage capping. Aggregator quotes are roughly
  // linear over the size ranges relevant here, so a 1-alUSD probe gives us the rate we need.
  // We race 1inch + Kyber: alAsset/underlying liquidity often lives in Curve/Balancer stable
  // pools that one router prices materially better than the other on a given chain.
  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const kyberAdapter = getKyberAdapterInfo(chainId);
  const oneInchAvailable = is1inchSupported(chainId);
  const kyberAvailable = isKyberSupported(chainId);
  const aggregatorAvailable = oneInchAvailable || kyberAvailable;
  // Used as the React-Query `from` cache key + the legacy single-router fallback recipient.
  // In "best" mode the hook overrides this per-racer with each aggregator's own adapter.
  const fallbackAdapterAddress: Address = (oneInchAdapter?.address ?? kyberAdapter?.address ?? ZERO_ADDRESS) as Address;

  const probeAmount = useMemo(() => 1n * 10n ** BigInt(market.debtDecimals), [market.debtDecimals]);

  const { data: probeQuote, isLoading: isProbeLoading } = use1inchQuote({
    chainId,
    src: market.debtToken,
    dst: market.underlying,
    amount: probeAmount.toString(),
    from: fallbackAdapterAddress,
    slippage,
    enabled: isOpen && aggregatorAvailable && probeAmount > 0n,
    preferredRouter: "best",
  });

  const probeOutRaw = useMemo<bigint>(() => {
    const out = (probeQuote as { dstAmount?: string })?.dstAmount;
    return out ? BigInt(out) : 0n;
  }, [probeQuote]);

  // borrowFactor: face-value alAsset borrowed per face-value underlying of flashRepay.
  // At perfect peg + zero slippage, factor = 1. With market rate 0.967 + 0.5% slippage ≈ 1.04.
  // Used by both `dynamicMaxLeverage` (so the slider knows the real protocol-LTV ceiling) and
  // by `finalBorrowAmount` sizing.
  const borrowFactor = useMemo(() => {
    if (probeOutRaw === 0n || probeAmount === 0n) {
      // Conservative fallback before probe lands — covers ~3% peg discount + 1% slippage.
      return 1.05;
    }
    // rate = (probeOut × 10^(debtDec−collDec)) / probeIn  (face-value, USDC per alUSD)
    const rateScaled = (probeOutRaw * collateralToDebtScale * 10000n) / probeAmount;
    const rate = Number(rateScaled) / 10000;
    if (rate <= 0) return 1.05;
    const slippageMultiplier = 1 + (Math.round(slippage * 100) + 5) / 10000;
    return slippageMultiplier / rate;
  }, [probeOutRaw, probeAmount, collateralToDebtScale, slippage]);

  // Dynamic max leverage given the current position state (C, D), any new margin (m), and the
  // discovered borrowFactor. Solves the face-value LTV equation:
  //   LTV(L) = (D + f × borrowFactor) / (C + m + f),  f = totalEquity × (L − 1)
  // for L at LTV = effectiveMaxLtv:
  //   f = (target × (C + m) − D) / (borrowFactor − target)
  //   L = 1 + f / totalEquity
  const dynamicMaxLeverage = useMemo(() => {
    const totalEquityRaw = existingEquityCollateral + marginRaw;
    if (totalEquityRaw === 0n) return 1;
    const decFactor = 10 ** market.underlyingDecimals;
    const totalCollat = (Number(collateralUnderlying) + Number(marginRaw)) / decFactor;
    const debt = Number(existingDebtAsCollateral) / decFactor;
    const totalEquity = Number(totalEquityRaw) / decFactor;
    const target = effectiveMaxLtvPct / 100;
    const denom = borrowFactor - target;
    if (denom <= 0 || totalEquity <= 0) return 1;
    const numerator = target * totalCollat - debt;
    if (numerator <= 0) return 1;
    const maxL = 1 + numerator / (totalEquity * denom);
    return Math.max(1, Math.min(maxL, MAX_LEVERAGE));
  }, [existingEquityCollateral, marginRaw, collateralUnderlying, existingDebtAsCollateral, market.underlyingDecimals, effectiveMaxLtvPct, borrowFactor]);

  // The leverage used downstream: clamped by both LTV ceiling AND flash-loan liquidity.
  // Liquidity cap pulled from `useFlashLoanSelection.liquidityData` (declared below) — the value
  // is read via a forward ref because the selection hook depends on a flash amount that itself
  // needs cappedLeverage. We break the cycle by computing the *unclamped* flashAmountAtLeverage
  // first to feed the selection hook, then post-clamp leverage by the resulting liquidity.
  const ltvBoundedLeverage = useMemo(
    () => Math.max(1, Math.min(leverage, dynamicMaxLeverage)),
    [leverage, dynamicMaxLeverage],
  );

  // Principal flash amount at LTV-bounded leverage (no fee included). Used for two things:
  //   (1) feeding `useFlashLoanSelection` to pick a provider that has enough liquidity
  //   (2) checking against the selected provider's reported liquidity to derive a hard cap
  const flashPrincipalAtLeverage = useMemo(() => {
    const totalEquity = existingEquityCollateral + marginRaw;
    if (totalEquity === 0n || ltvBoundedLeverage <= 1) return 0n;
    const leverageMultiplier = BigInt(Math.round((ltvBoundedLeverage - 1) * 10000));
    return (totalEquity * leverageMultiplier) / 10000n;
  }, [existingEquityCollateral, marginRaw, ltvBoundedLeverage]);

  // Liquidity-aware provider selection. Auto-picks zero-fee providers (Balancer V2 → Morpho →
  // Balancer V3) first; Aave (5bps) is last resort. User can override via the dropdown.
  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders,
    defaultProvider: defaultFlashLoanProvider,
    tokenAddress: market.underlying,
    amount: flashPrincipalAtLeverage,
    chainId,
  });

  // Available liquidity on the selected provider. If liquidity hasn't loaded yet, treat as
  // unbounded so we don't visibly reject leverage levels that may turn out to be fine.
  const selectedProviderLiquidity = useMemo<bigint | null>(() => {
    if (!selectedProvider) return null;
    const entry = liquidityData.find(d => d.provider === selectedProvider.providerEnum);
    return entry ? entry.liquidity : null;
  }, [liquidityData, selectedProvider]);

  // Liquidity-derived leverage cap. Solves `flashAmount = totalEquity × (L−1) ≤ liquidity`
  // ⇒ `L ≤ 1 + liquidity/totalEquity`. Includes a 1% safety buffer so we don't size right up
  // to the limit (Balancer V3's `_reservesOf -= amount` underflows on equality due to other
  // accounting concurrent with the same vault).
  const liquidityMaxLeverage = useMemo(() => {
    const totalEquity = existingEquityCollateral + marginRaw;
    if (totalEquity === 0n || selectedProviderLiquidity === null) return MAX_LEVERAGE;
    const liq = Number(formatUnits(selectedProviderLiquidity, market.underlyingDecimals));
    const eq = Number(formatUnits(totalEquity, market.underlyingDecimals));
    if (eq <= 0) return MAX_LEVERAGE;
    return Math.max(1, 1 + (liq * 0.99) / eq);
  }, [selectedProviderLiquidity, existingEquityCollateral, marginRaw, market.underlyingDecimals]);

  // Final cap = min(LTV cap, liquidity cap, hardcoded MAX_LEVERAGE).
  const cappedLeverage = useMemo(
    () => Math.max(1, Math.min(ltvBoundedLeverage, liquidityMaxLeverage, MAX_LEVERAGE)),
    [ltvBoundedLeverage, liquidityMaxLeverage],
  );

  // Flash + flashRepay are derived from cappedLeverage × equity, with the selected provider's fee.
  const flashShape = useMemo(() => {
    if (cappedLeverage <= 1) return null;
    const totalEquity = existingEquityCollateral + marginRaw;
    if (totalEquity === 0n) return null;

    const leverageMultiplier = BigInt(Math.round((cappedLeverage - 1) * 10000));
    const flashAmountCollateral = (totalEquity * leverageMultiplier) / 10000n;
    if (flashAmountCollateral === 0n) return null;

    const feeBps = BigInt(selectedProvider?.feeBps ?? 0);
    const flashRepayCollateral = flashAmountCollateral + (flashAmountCollateral * feeBps) / 10000n;

    return { flashAmountCollateral, flashRepayCollateral, feeBps };
  }, [cappedLeverage, existingEquityCollateral, marginRaw, selectedProvider]);

  // Final borrow amount in debt-decimals. Uses the discovered probe rate (via borrowFactor)
  // rather than assuming 1:1 peg. Falls back to the 5% conservative buffer until probe lands.
  const finalBorrowAmount = useMemo<bigint | null>(() => {
    if (!flashShape) return null;
    // borrow_collateral = flashRepay × borrowFactor (in collateral-units, then scale to debt)
    // Use bigint math: borrow_debt_raw = flashRepay × scale × factor_bps / 10000
    const factorBps = BigInt(Math.max(10000, Math.round(borrowFactor * 10000)));
    return (flashShape.flashRepayCollateral * collateralToDebtScale * factorBps) / 10000n;
  }, [flashShape, borrowFactor, collateralToDebtScale]);

  // Stage 2: re-quote with the actual final amount so the aggregator's swapData matches what
  // the router will use as input. The winning aggregator may differ between probe and final
  // (different sizes ⇒ different optimal routes), so we read it off this response.
  const { data: finalQuote, isLoading: isFinalQuoteLoading } = use1inchQuote({
    chainId,
    src: market.debtToken,
    dst: market.underlying,
    amount: finalBorrowAmount?.toString() ?? "0",
    from: fallbackAdapterAddress,
    slippage,
    enabled: isOpen && aggregatorAvailable && (finalBorrowAmount ?? 0n) > 0n,
    preferredRouter: "best",
  });

  const swapData = (finalQuote as { tx?: { data?: string } })?.tx?.data ?? "0x";
  const quotedOut = (finalQuote as { dstAmount?: string })?.dstAmount;
  const quotedOutRaw = quotedOut ? BigInt(quotedOut) : 0n;
  const quoteSatisfiesFlash = flashShape ? quotedOutRaw >= flashShape.flashRepayCollateral : false;
  const isQuoteLoading = isProbeLoading || isFinalQuoteLoading;
  // Aggregator that won the final-stage race — drives both the build-flow swapRouter (which
  // adapter approves+executes the swap on-chain) and ensures swapData matches that adapter's
  // expected calldata format. Pendle is included for completeness (last-resort fallback).
  const winningAggregator = (finalQuote as { aggregator?: "1inch" | "kyber" | "pendle" })?.aggregator;
  const winningSwapRouter: "oneinch" | "kyber" | "pendle" =
    winningAggregator === "kyber" ? "kyber" : winningAggregator === "pendle" ? "pendle" : "oneinch";

  // Aggregate computed params (replaces the old computedParams; targets are derived from
  // the final quote-sized borrow so the displayed numbers reflect what'll actually execute).
  const computedParams = useMemo(() => {
    if (!flashShape || !finalBorrowAmount) return null;
    const targetCollateralRaw = collateralUnderlying + marginRaw + flashShape.flashAmountCollateral;
    const targetDebtRaw = existingDebt + finalBorrowAmount;
    const targetCollateralAsDebt = targetCollateralRaw * collateralToDebtScale;
    const targetLtvPct = targetCollateralAsDebt > 0n
      ? Number((targetDebtRaw * 10000n) / targetCollateralAsDebt) / 100
      : 0;
    return {
      flashAmountCollateral: flashShape.flashAmountCollateral,
      flashRepayCollateral: flashShape.flashRepayCollateral,
      borrowAmountDebt: finalBorrowAmount,
      targetCollateralRaw,
      targetDebtRaw,
      targetLtvPct,
    };
  }, [flashShape, finalBorrowAmount, collateralUnderlying, marginRaw, existingDebt, collateralToDebtScale]);

  // ============ Cost breakdown (USD) ============
  // Underlying USD price drives the dollar-denominated fee + impact display. Cached/shared via
  // tanstack-query so opening the modal re-uses prices fetched elsewhere.
  const { price: underlyingUsd } = useTokenPrice(market.underlyingSymbol, { enabled: isOpen });

  const costBreakdown = useMemo(() => {
    if (!flashShape || !finalBorrowAmount) {
      return {
        flashFeeUsd: 0,
        priceImpactUsd: 0,
        priceImpactPct: 0,
        maxSlippageUsd: 0,
        slippagePct: slippage,
        totalCostUsd: 0,
      };
    }
    // Flash-loan fee in underlying (Balancer V2/V3 + Morpho = 0; Aave = 5 bps).
    const flashFeeRaw = flashShape.flashRepayCollateral - flashShape.flashAmountCollateral;
    const flashFeeUnderlying = Number(formatUnits(flashFeeRaw, market.underlyingDecimals));
    const flashFeeUsd = flashFeeUnderlying * underlyingUsd;

    // Swap price impact = how much underlying we lose vs the small-size probe rate at the
    // actual borrow size. Comparing same-direction quotes at two sizes isolates the *rate
    // degradation*, which is what the user actually pays beyond the displayed slippage knob.
    let priceImpactUnderlying = 0;
    let priceImpactPct = 0;
    if (probeOutRaw > 0n && probeAmount > 0n && quotedOutRaw > 0n) {
      const probeRate = Number(probeOutRaw * collateralToDebtScale) / Number(probeAmount); // underlying/alAsset (face)
      const idealOut = Number(finalBorrowAmount) * probeRate / Number(collateralToDebtScale);
      const actualOut = Number(quotedOutRaw);
      if (idealOut > actualOut) {
        const lostRaw = idealOut - actualOut;
        priceImpactUnderlying = lostRaw / 10 ** market.underlyingDecimals;
        priceImpactPct = idealOut > 0 ? (lostRaw / idealOut) * 100 : 0;
      }
    }
    const priceImpactUsd = priceImpactUnderlying * underlyingUsd;

    // Max slippage = upper bound on swap loss within tolerance, sized against expected output
    // value (underlying we expect to receive). The user's worst-case beyond price impact.
    const expectedOutUnderlying = Number(formatUnits(quotedOutRaw, market.underlyingDecimals));
    const expectedOutUsd = expectedOutUnderlying * underlyingUsd;
    const maxSlippageUsd = (slippage / 100) * expectedOutUsd;

    // Worst case = flash + max(realized impact, slippage allowance) — they're alternate
    // ceilings rather than additive. See useClosePositionConfig for the same convention.
    const swapWorstCaseUsd = Math.max(priceImpactUsd, maxSlippageUsd);

    return {
      flashFeeUsd,
      priceImpactUsd,
      priceImpactPct,
      maxSlippageUsd,
      slippagePct: slippage,
      totalCostUsd: flashFeeUsd + swapWorstCaseUsd,
    };
  }, [flashShape, finalBorrowAmount, probeOutRaw, probeAmount, quotedOutRaw, collateralToDebtScale, market.underlyingDecimals, underlyingUsd, slippage]);

  // ============ Build flow ============
  const { buildMultiplyFlow } = useKapanRouterV2();

  const buildFlow = useCallback(() => {
    if (!computedParams || swapData === "0x" || !quoteSatisfiesFlash || !selectedProvider) return [];
    const ctx = encodeAlchemixContext(market.marketId, tokenId);
    return buildMultiplyFlow({
      protocolName: ALCHEMIX_GATEWAY_NAME,
      collateralToken: market.underlying,
      debtToken: market.debtToken,
      initialCollateral: marginAmount || "0",
      flashLoanAmount: formatUnits(computedParams.flashAmountCollateral, market.underlyingDecimals),
      minCollateralOut: formatUnits(computedParams.flashRepayCollateral, market.underlyingDecimals),
      swapData,
      collateralDecimals: market.underlyingDecimals,
      debtDecimals: market.debtDecimals,
      flashLoanProvider: selectedProvider.providerEnum,
      alchemixContext: ctx,
      alchemixBorrowAmount: formatUnits(computedParams.borrowAmountDebt, market.debtDecimals),
      alchemixFlashRepay: formatUnits(computedParams.flashRepayCollateral, market.underlyingDecimals),
      swapRouter: winningSwapRouter,
    });
  }, [computedParams, swapData, quoteSatisfiesFlash, market, tokenId, marginAmount, selectedProvider, buildMultiplyFlow, winningSwapRouter]);

  const { handleConfirm } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    successMessage: "Multiply transaction sent",
    buildFlow: () => buildFlow(),
    emptyFlowErrorMessage: "Failed to build multiply instructions",
  });

  // ============ Render helpers ============
  const fmtCollateral = (raw: bigint) => Number(formatUnits(raw, market.underlyingDecimals)).toFixed(market.underlyingDecimals === 6 ? 2 : 4);
  const fmtDebt = (raw: bigint) => Number(formatUnits(raw, market.debtDecimals)).toFixed(2);

  const handleSetMargin = useCallback((v: string) => setMarginAmount(v), []);
  const handleMaxMargin = useCallback(() => {
    setMarginAmount(formatUnits(walletMargin, market.underlyingDecimals));
  }, [walletMargin, market.underlyingDecimals]);

  // Submit is OK when there's leverage to apply (existing equity > 0 OR new margin) and the
  // quote covers the flash repay. Margin=0 is valid when the user just wants to loop existing
  // collateral without depositing more.
  const totalEquityRaw = existingEquityCollateral + marginRaw;
  const canSubmit =
    !!computedParams &&
    quoteSatisfiesFlash &&
    !isQuoteLoading &&
    totalEquityRaw > 0n &&
    cappedLeverage > 1 &&
    marginRaw <= walletMargin &&
    // Defense-in-depth: even with the slider cap, never let the user submit a tx whose
    // face-value LTV exceeds the protocol's max — the alchemist would revert and burn gas.
    computedParams.targetLtvPct <= effectiveMaxLtvPct;

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center -space-x-2">
              <Image
                src={tokenNameToLogo(market.underlyingSymbol.toLowerCase())}
                alt={market.underlyingSymbol}
                width={24}
                height={24}
                className="ring-base-100 rounded-full ring-2"
              />
              <Image
                src={tokenNameToLogo(market.debtSymbol.toLowerCase())}
                alt={market.debtSymbol}
                width={24}
                height={24}
                className="ring-base-100 rounded-full ring-2"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Loop {market.name}</span>
              <span className="text-base-content/50 text-[10px] uppercase tracking-wider">
                Position #{tokenId.toString()}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
            ✕
          </button>
        </div>

        {/* Margin input */}
        <div className="form-control mb-3">
          <label className="label py-1">
            <span className="label-text text-xs">
              Add {market.underlyingSymbol} margin (optional)
            </span>
            <span className="label-text-alt text-base-content/50 text-[10px]">
              Wallet: {fmtCollateral(walletMargin)}
            </span>
          </label>
          <div className="join">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="0.0"
              value={marginAmount}
              onChange={e => handleSetMargin(e.target.value)}
              className="input input-sm input-bordered join-item w-full font-mono tabular-nums"
            />
            <button type="button" onClick={handleMaxMargin} className="btn btn-sm join-item">
              MAX
            </button>
          </div>
        </div>

        {/* Leverage slider */}
        <div className="form-control mb-3">
          <label className="label py-1">
            <span className="label-text text-xs">Leverage</span>
            <span className="label-text-alt font-mono tabular-nums text-xs">
              {cappedLeverage.toFixed(2)}×
              {cappedLeverage < leverage && <span className="text-warning ml-1">(capped)</span>}
            </span>
          </label>
          <input
            type="range"
            min={1}
            // The slider's hard ceiling is the dynamically-computed max that keeps post-multiply
            // LTV below the protocol cap. Falls back to 1× when there's no equity to leverage
            // (existing position fully levered or no collateral + no margin yet).
            max={Math.max(1.01, dynamicMaxLeverage)}
            step={0.05}
            value={Math.min(leverage, dynamicMaxLeverage)}
            onChange={e => setLeverage(Number(e.target.value))}
            className="range range-xs range-primary"
            disabled={dynamicMaxLeverage <= 1}
          />
          <div className="text-base-content/40 mt-1 flex justify-between text-[10px]">
            <span>1×</span>
            <span>{dynamicMaxLeverage.toFixed(2)}×</span>
          </div>
        </div>

        {/* Slippage */}
        <div className="form-control mb-4">
          <label className="label py-1">
            <span className="label-text text-xs">Slippage tolerance</span>
          </label>
          <div className="join">
            {SLIPPAGE_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setSlippage(opt)}
                className={`btn btn-xs join-item flex-1 ${slippage === opt ? "btn-primary" : "btn-ghost border border-base-300"}`}
              >
                {opt}%
              </button>
            ))}
          </div>
        </div>

        {/* Flash loan provider — auto-picks zero-fee with sufficient liquidity (Aave last) */}
        {flashLoanProviders.length > 0 && (
          <div className="mb-4">
            <FlashLoanProviderSelector
              providers={flashLoanProviders}
              selectedProvider={selectedProvider ?? null}
              onSelectProvider={setSelectedProvider}
              label="Flash loan provider"
            />
            {selectedProvider && selectedProvider.feeBps > 0 && (
              <div className="text-base-content/50 mt-1 text-[10px]">
                {selectedProvider.feeBps} bps fee — zero-fee providers had insufficient liquidity.
              </div>
            )}
          </div>
        )}

        {/* Targets */}
        <div className="bg-base-200/40 mb-4 rounded-lg p-3 text-xs">
          <div className="text-base-content/40 mb-2 text-[10px] uppercase tracking-wider">After multiply</div>
          <div className="space-y-1.5 font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="text-base-content/60">Collateral</span>
              <span>
                {computedParams ? fmtCollateral(computedParams.targetCollateralRaw) : "—"} {market.underlyingSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/60">Debt</span>
              <span>
                {computedParams ? fmtDebt(computedParams.targetDebtRaw) : "—"} {market.debtSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/60">LTV</span>
              <span className={computedParams && computedParams.targetLtvPct > effectiveMaxLtvPct ? "text-error" : "text-success"}>
                {computedParams ? `${computedParams.targetLtvPct.toFixed(1)}%` : "—"} / {maxLtvPct.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/60">Borrow this tx</span>
              <span>{computedParams ? fmtDebt(computedParams.borrowAmountDebt) : "—"} {market.debtSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/60">Flash repay</span>
              <span>{computedParams ? fmtCollateral(computedParams.flashRepayCollateral) : "—"} {market.underlyingSymbol}</span>
            </div>
          </div>

          {/* Cost breakdown — flash fee + swap price impact, in USD. Shared with the close-with-
              collateral modal via CostBreakdownRows so the two views stay consistent. */}
          {computedParams && finalBorrowAmount && underlyingUsd > 0 && (
            <div className="border-base-300/40 mt-3 border-t pt-2">
              <CostBreakdownRows
                flashFeeUsd={costBreakdown.flashFeeUsd}
                priceImpactUsd={costBreakdown.priceImpactUsd}
                priceImpactPct={costBreakdown.priceImpactPct}
                maxSlippageUsd={costBreakdown.maxSlippageUsd}
                slippagePct={costBreakdown.slippagePct}
                totalCostUsd={costBreakdown.totalCostUsd}
              />
            </div>
          )}

          {computedParams && !isQuoteLoading && !quoteSatisfiesFlash && finalQuote && (
            <div className="text-error mt-2 text-[10px]">
              Quote returns {fmtCollateral(quotedOutRaw)} {market.underlyingSymbol} — under flash repay.
              Increase slippage tolerance or reduce leverage.
            </div>
          )}
          {isQuoteLoading && (
            <div className="text-base-content/50 mt-2 flex items-center gap-1 text-[10px]">
              <LoadingSpinner /> Fetching swap quote…
            </div>
          )}
        </div>

        {/* Action */}
        <button
          type="button"
          onClick={() => handleConfirm(marginAmount || "0")}
          disabled={!canSubmit}
          className="btn btn-primary btn-block btn-sm"
        >
          {totalEquityRaw === 0n
            ? "No equity to leverage"
            : marginRaw > walletMargin
              ? "Insufficient balance"
              : cappedLeverage <= 1
                ? "Increase leverage"
                : isQuoteLoading
                  ? "Quote loading…"
                  : !quoteSatisfiesFlash
                    ? "Quote insufficient"
                    : `Loop to ${cappedLeverage.toFixed(2)}×`}
        </button>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};

// Re-export types for callers
export type { AlchemixMarket };
