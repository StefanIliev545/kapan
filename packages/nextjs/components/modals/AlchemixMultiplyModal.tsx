"use client";

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Address, formatUnits, parseUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { getOneInchAdapterInfo, is1inchSupported, isAaveV3Supported, isBalancerV2Supported } from "~~/utils/chainFeatures";
import { FlashLoanProvider } from "~~/utils/flashLoan";
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
  const [provider, setProvider] = useState<FlashLoanProvider>(FlashLoanProvider.BalancerV3);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMarginAmount("");
      setLeverage(2);
      setSlippage(DEFAULT_SLIPPAGE);
    }
  }, [isOpen]);

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
  // discovery doesn't create a circular dep with leverage capping. 1inch quotes are roughly
  // linear over the size ranges relevant here, so a 1-alUSD probe gives us the rate we need.
  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const oneInchAvailable = is1inchSupported(chainId);

  const probeAmount = useMemo(() => 1n * 10n ** BigInt(market.debtDecimals), [market.debtDecimals]);

  const { data: probeQuote, isLoading: isProbeLoading } = use1inchQuote({
    chainId,
    src: market.debtToken,
    dst: market.underlying,
    amount: probeAmount.toString(),
    from: (oneInchAdapter?.address as Address) ?? ZERO_ADDRESS,
    slippage,
    enabled: isOpen && oneInchAvailable && !!oneInchAdapter && probeAmount > 0n,
    preferredRouter: "1inch",
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

  // The leverage actually used downstream: clamped by the dynamic ceiling.
  const cappedLeverage = useMemo(() => Math.max(1, Math.min(leverage, dynamicMaxLeverage)), [leverage, dynamicMaxLeverage]);

  // Flash + flashRepay are derived from existing equity + new margin × cappedLeverage.
  const flashShape = useMemo(() => {
    if (cappedLeverage <= 1) return null;
    const totalEquity = existingEquityCollateral + marginRaw;
    if (totalEquity === 0n) return null;

    const leverageMultiplier = BigInt(Math.round((cappedLeverage - 1) * 10000));
    const flashAmountCollateral = (totalEquity * leverageMultiplier) / 10000n;
    if (flashAmountCollateral === 0n) return null;

    const feeBps = provider === FlashLoanProvider.Aave ? 5n : 0n;
    const flashRepayCollateral = flashAmountCollateral + (flashAmountCollateral * feeBps) / 10000n;

    return { flashAmountCollateral, flashRepayCollateral };
  }, [cappedLeverage, existingEquityCollateral, marginRaw, provider]);

  // Final borrow amount in debt-decimals. Uses the discovered probe rate (via borrowFactor)
  // rather than assuming 1:1 peg. Falls back to the 5% conservative buffer until probe lands.
  const finalBorrowAmount = useMemo<bigint | null>(() => {
    if (!flashShape) return null;
    // borrow_collateral = flashRepay × borrowFactor (in collateral-units, then scale to debt)
    // Use bigint math: borrow_debt_raw = flashRepay × scale × factor_bps / 10000
    const factorBps = BigInt(Math.max(10000, Math.round(borrowFactor * 10000)));
    return (flashShape.flashRepayCollateral * collateralToDebtScale * factorBps) / 10000n;
  }, [flashShape, borrowFactor, collateralToDebtScale]);

  // Stage 2: re-quote with the actual final amount so 1inch's swapData matches what the
  // router will use as input. This is the swap that actually executes on-chain.
  const { data: finalQuote, isLoading: isFinalQuoteLoading } = use1inchQuote({
    chainId,
    src: market.debtToken,
    dst: market.underlying,
    amount: finalBorrowAmount?.toString() ?? "0",
    from: (oneInchAdapter?.address as Address) ?? ZERO_ADDRESS,
    slippage,
    enabled: isOpen && oneInchAvailable && !!oneInchAdapter && (finalBorrowAmount ?? 0n) > 0n,
    preferredRouter: "1inch",
  });

  const swapData = (finalQuote as { tx?: { data?: string } })?.tx?.data ?? "0x";
  const quotedOut = (finalQuote as { dstAmount?: string })?.dstAmount;
  const quotedOutRaw = quotedOut ? BigInt(quotedOut) : 0n;
  const quoteSatisfiesFlash = flashShape ? quotedOutRaw >= flashShape.flashRepayCollateral : false;
  const isQuoteLoading = isProbeLoading || isFinalQuoteLoading;

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

  // ============ Provider availability ============
  const availableProviders = useMemo(() => {
    const out: Array<{ value: FlashLoanProvider; label: string }> = [];
    if (isBalancerV2Supported(chainId)) {
      out.push({ value: FlashLoanProvider.BalancerV3, label: "Balancer V3 (0% fee)" });
      out.push({ value: FlashLoanProvider.BalancerV2, label: "Balancer V2 (0% fee)" });
    }
    if (isAaveV3Supported(chainId)) {
      out.push({ value: FlashLoanProvider.Aave, label: "Aave V3 (5bps fee)" });
    }
    return out;
  }, [chainId]);

  useEffect(() => {
    if (availableProviders.length > 0 && !availableProviders.some(p => p.value === provider)) {
      setProvider(availableProviders[0].value);
    }
  }, [availableProviders, provider]);

  // ============ Build flow ============
  const { buildMultiplyFlow } = useKapanRouterV2();

  const buildFlow = useCallback(() => {
    if (!computedParams || swapData === "0x" || !quoteSatisfiesFlash) return [];
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
      flashLoanProvider: provider,
      alchemixContext: ctx,
      alchemixBorrowAmount: formatUnits(computedParams.borrowAmountDebt, market.debtDecimals),
      alchemixFlashRepay: formatUnits(computedParams.flashRepayCollateral, market.underlyingDecimals),
      swapRouter: "oneinch",
    });
  }, [computedParams, swapData, quoteSatisfiesFlash, market, tokenId, marginAmount, provider, buildMultiplyFlow]);

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

        {/* Flash loan provider */}
        {availableProviders.length > 1 && (
          <div className="form-control mb-4">
            <label className="label py-1">
              <span className="label-text text-xs">Flash loan provider</span>
            </label>
            <select
              className="select select-sm select-bordered text-xs"
              value={provider}
              onChange={e => setProvider(Number(e.target.value) as FlashLoanProvider)}
            >
              {availableProviders.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
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
