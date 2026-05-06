"use client";

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { BaseProtocolHeader, type HeaderMetric } from "../common";
import { CollapsibleSection } from "~~/components/common/CollapsibleSection";
import { LoadingSpinner } from "~~/components/common/Loading";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { useAlchemixLendingPositions, type AlchemixPosition } from "~~/hooks/useAlchemixLendingPositions";
import { useAlchemixTransmuterPositions } from "~~/hooks/useAlchemixTransmuterPositions";
import { useAlchemixVaultYields } from "~~/hooks/useAlchemixVaultYields";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { encodeAlchemixContext, getAlchemixMarkets } from "~~/utils/alchemix/markets";
import { ALCHEMIX_GATEWAY_NAME } from "~~/utils/alchemix/protocolConstants";
import { AlchemixMarketsSection } from "./AlchemixMarketsSection";
import { AlchemixTransmuterSection } from "./AlchemixTransmuterSection";
import { AlchemixMultiplyModal } from "~~/components/modals/AlchemixMultiplyModal";
import type { SwapAsset } from "~~/components/modals/SwapModalShell";
import { useModal } from "~~/hooks/useModal";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { LTVAutomationModal } from "~~/components/modals/LTVAutomationModal";
import { formatUnits } from "viem";
import { PositionManager } from "~~/utils/position";
import { useGlobalState } from "~~/services/store/store";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { MetricColors } from "~~/utils/protocolMetrics";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { formatSignedPercent } from "../utils";

interface AlchemixProtocolViewProps {
  chainId?: number;
}

/**
 * Alchemix V3 protocol view (read-only MVP).
 *
 * Shows each user position NFT (one alchemist instance + tokenId per row) with:
 *   - Collateral (MYT shares, displayed as the underlying USDC/WETH)
 *   - Debt (alAsset)
 *   - Current LTV vs max LTV (90% on V3 by design)
 *
 * Action modals (deposit/withdraw/borrow/repay) are not wired in this PR — the gateway is
 * deployed and tested, but the user-facing modals can come in a follow-up. All positions
 * pass `availableActions={{}}` to disable buttons.
 */
export const AlchemixProtocolView: FC<AlchemixProtocolViewProps> = ({ chainId: propChainId }) => {
  const { address: connectedAddress, chainId: walletChainId } = useAccount();
  const chainId = propChainId ?? walletChainId ?? 42161;
  const effectiveChainId = getEffectiveChainId(chainId);

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMarketsOpen, setIsMarketsOpen] = useState(false);

  // Reset collapsed/markets state when chain changes
  useEffect(() => {
    setIsCollapsed(true);
    setIsMarketsOpen(false);
  }, [effectiveChainId]);

  const hasMarketsOnChain = useMemo(() => getAlchemixMarkets(effectiveChainId).length > 0, [effectiveChainId]);

  const { positions, isLoading, hasLoadedOnce } = useAlchemixLendingPositions(
    effectiveChainId,
    connectedAddress,
  );

  // Fetch the underlying Morpho V2 Vault yield for each MYT on this chain.
  // Refreshes every 5 min — APYs don't move fast and Morpho's API has rate limits.
  const { data: vaultYields } = useAlchemixVaultYields(effectiveChainId);

  // Fetch USD prices for the underlying + debt assets across all positions
  const tokenAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const p of positions) {
      set.add(p.market.underlying.toLowerCase());
      set.add(p.market.debtToken.toLowerCase());
    }
    return Array.from(set);
  }, [positions]);

  const { pricesRaw } = useTokenPricesByAddress(effectiveChainId, tokenAddresses, {
    enabled: tokenAddresses.length > 0,
  });

  const getPriceRaw = useCallback(
    (address: string): bigint => pricesRaw[address.toLowerCase()] ?? 0n,
    [pricesRaw],
  );

  // Resolve a price for a debt token (alUSD / alETH). Many price feeds don't list synthetics;
  // when missing, fall back to the underlying-token price for the same market — Alchemix V3
  // synthetics peg 1:1 to their underlying by transmuter design, so this is a faithful proxy.
  const getDebtPriceRaw = useCallback(
    (debtAddr: string, underlyingAddr: string): bigint => {
      const direct = getPriceRaw(debtAddr);
      if (direct > 0n) return direct;
      return getPriceRaw(underlyingAddr);
    },
    [getPriceRaw],
  );

  // Convert balance + price into USD value (price has 8 decimals)
  const usdValue = useCallback((balance: bigint, decimals: number, priceRaw: bigint): number => {
    if (balance <= 0n || priceRaw <= 0n) return 0;
    return (Number(balance) / 10 ** decimals) * (Number(priceRaw) / 1e8);
  }, []);

  // Aggregate metrics across all positions
  const metrics = useMemo(() => {
    if (positions.length === 0) {
      return { netBalance: 0, netYield30d: 0, netApyPercent: null as number | null, positionCount: 0, totalSupplied: 0, totalBorrowed: 0 };
    }

    // Alchemix V3 specifics:
    //  - Supply rate = MYT (Morpho V2 Vault) APY pulled live from `vaultYields` per market.
    //  - Borrow rate = 0% — alAssets are self-repaying via the transmuter, no traditional
    //    interest. Net APY = (collateralUSD × supplyApy) / equity which calculateNetYieldMetrics
    //    captures correctly via its supplied/borrowed weighting.
    const supplied: Array<{ balance: number; currentRate: number }> = [];
    const borrowed: Array<{ balance: number; currentRate: number }> = [];
    let totalSupplied = 0;
    let totalBorrowed = 0;

    for (const p of positions) {
      const collUsd = usdValue(p.collateralUnderlying, p.market.underlyingDecimals, getPriceRaw(p.market.underlying));
      const debtUsd = usdValue(p.debt, p.market.debtDecimals, getDebtPriceRaw(p.market.debtToken, p.market.underlying));
      // Earmarked debt has had its collateral allocated to the transmuter and is being settled
      // passively from yield — it doesn't act as a leverage burden, so we exclude it from the
      // APY/equity math here (matches per-row `unearmarkedDebtUsd`).
      const unearmarkedRaw = p.debt > p.earmarked ? p.debt - p.earmarked : 0n;
      const unearmarkedUsd = usdValue(unearmarkedRaw, p.market.debtDecimals, getDebtPriceRaw(p.market.debtToken, p.market.underlying));
      const apy = vaultYields?.[p.market.myt.toLowerCase()]?.netApyPct ?? 0;
      totalSupplied += collUsd;
      totalBorrowed += debtUsd;
      if (collUsd > 0) supplied.push({ balance: collUsd, currentRate: apy });
      if (unearmarkedUsd > 0) borrowed.push({ balance: unearmarkedUsd, currentRate: 0 });
    }

    const yieldMetrics = calculateNetYieldMetrics(supplied, borrowed);
    return {
      netBalance: totalSupplied - totalBorrowed,
      netYield30d: yieldMetrics.netYield30d,
      netApyPercent: yieldMetrics.netApyPercent,
      positionCount: positions.length,
      totalSupplied,
      totalBorrowed,
    };
  }, [positions, getPriceRaw, getDebtPriceRaw, usdValue, vaultYields]);

  // Report totals to global dashboard balance
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);
  useEffect(() => {
    if (!hasLoadedOnce) return;
    setProtocolTotals("Alchemix", metrics.totalSupplied, metrics.totalBorrowed);
  }, [hasLoadedOnce, metrics.totalSupplied, metrics.totalBorrowed, setProtocolTotals, effectiveChainId]);

  const hasPositions = positions.length > 0;

  // Probe transmuter positions for both markets at the parent level so auto-collapse can
  // factor them in. React-query dedupes against AlchemixTransmuterSection's identical
  // queries via shared queryKey — no double fetch. Markets list is stable on Arbitrum
  // (alUSD + alETH); call the hook for slot 0 and slot 1 unconditionally.
  const marketsForChain = useMemo(() => getAlchemixMarkets(effectiveChainId), [effectiveChainId]);
  const transmuterQ0 = useAlchemixTransmuterPositions({
    alchemist: marketsForChain[0]?.alchemist as `0x${string}` | undefined,
    marketId: marketsForChain[0]?.marketId ?? -1,
    chainId: effectiveChainId,
    enabled: !!marketsForChain[0] && !!connectedAddress,
  });
  const transmuterQ1 = useAlchemixTransmuterPositions({
    alchemist: marketsForChain[1]?.alchemist as `0x${string}` | undefined,
    marketId: marketsForChain[1]?.marketId ?? -1,
    chainId: effectiveChainId,
    enabled: !!marketsForChain[1] && !!connectedAddress,
  });
  const hasTransmuterPositions = transmuterQ0.positions.length + transmuterQ1.positions.length > 0;

  // Auto-expand when *either* CDP positions or transmuter stakes load. A user can have a
  // transmuter redemption open without an active alchemist NFT (after burning all debt) —
  // collapsing the panel in that case would hide the only data they have.
  const hasAnyPositions = hasPositions || hasTransmuterPositions;
  useEffect(() => {
    if (!hasLoadedOnce) return;
    setIsCollapsed(!hasAnyPositions);
  }, [hasLoadedOnce, hasAnyPositions]);

  const toggleCollapsed = useCallback(() => setIsCollapsed(prev => !prev), []);

  // Toggle the markets section. Same pattern as Morpho/Euler: opening markets while collapsed
  // also expands the protocol pane so the user can see what they're toggling.
  const toggleMarketsOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsMarketsOpen(prev => {
        const next = !prev;
        if (next && isCollapsed) setIsCollapsed(false);
        return next;
      });
    },
    [isCollapsed],
  );

  const headerMetrics: HeaderMetric[] = useMemo(
    () => [
      { label: "Balance", value: metrics.netBalance, type: "currency" },
      { label: "30D Yield", mobileLabel: "30D", value: metrics.netYield30d, type: "currency" },
      { label: "Net APY", value: metrics.netApyPercent, type: "apy" },
      {
        label: "Positions",
        value: metrics.positionCount,
        type: "custom",
        customRender: (hasData: boolean) => (
          <span className={`font-mono text-xs font-bold tabular-nums ${hasData ? "text-base-content" : MetricColors.MUTED}`}>
            {hasData ? metrics.positionCount : "—"}
          </span>
        ),
      },
    ],
    [metrics],
  );

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? "p-1" : "space-y-2 py-2 sm:p-3"}`}>
      <BaseProtocolHeader
        protocolName="Alchemix"
        protocolIcon="/logos/alchemix.svg"
        protocolUrl="https://alchemix.fi"
        isCollapsed={isCollapsed}
        isMarketsOpen={isMarketsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleMarkets={toggleMarketsOpen}
        hasPositions={hasPositions}
        metrics={headerMetrics}
      />

      {hasMarketsOnChain && (
        <CollapsibleSection isOpen={isMarketsOpen && !isCollapsed}>
          <AlchemixMarketsSection chainId={effectiveChainId} />
        </CollapsibleSection>
      )}

      <CollapsibleSection isOpen={!isCollapsed}>
        {isLoading && !hasLoadedOnce ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        ) : !hasPositions ? (
          <div className="space-y-2">
            <div className="text-base-content/50 px-3 py-6 text-center text-xs">
              No Alchemix positions on this network.
            </div>
            {/* Transmuter positions can exist independently of borrow positions — a user
                can have alAsset staked for redemption without an open alchemist NFT. Render
                here too so they're visible even when the borrow list is empty. */}
            <AlchemixTransmuterSection chainId={effectiveChainId} pricesRaw={pricesRaw} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
              <div className="card-body p-4">
                <div className="divide-base-content/10 divide-y space-y-2">
                  {positions.map(p => {
                    const yieldEntry = vaultYields?.[p.market.myt.toLowerCase()];
                    const vaultApyPct = yieldEntry?.netApyPct ?? 0;
                    return (
                      <AlchemixPositionRow
                        key={`${p.market.alchemist}-${p.tokenId}`}
                        position={p}
                        chainId={chainId}
                        underlyingPriceRaw={getPriceRaw(p.market.underlying)}
                        debtPriceRaw={getDebtPriceRaw(p.market.debtToken, p.market.underlying)}
                        vaultApyPct={vaultApyPct}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Separate card for transmuter positions — same width treatment, but explicitly
                a different "kind" of position (vesting redemption rather than CDP). */}
            <AlchemixTransmuterSection chainId={effectiveChainId} pricesRaw={pricesRaw} />
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
};

interface AlchemixPositionRowProps {
  position: AlchemixPosition;
  chainId: number;
  underlyingPriceRaw: bigint;
  debtPriceRaw: bigint;
  /** Net APY of the underlying Morpho V2 Vault (MYT), as a percentage. 0 if unindexed. */
  vaultApyPct: number;
}

const AlchemixPositionRow: FC<AlchemixPositionRowProps> = ({ position, chainId, underlyingPriceRaw, debtPriceRaw, vaultApyPct }) => {
  const { market, tokenId, collateralUnderlying, debt, earmarked, currentLtvPct, maxLtvPct } = position;

  const context = useMemo(() => encodeAlchemixContext(market.marketId, tokenId), [market.marketId, tokenId]);
  const loopModal = useModal();
  const automationModal = useModal();

  // The close modal expects the available collaterals as SwapAsset[]; for Alchemix this is
  // always exactly one — the underlying token of the position's market. The modal already
  // routes through `buildCloseWithCollateralFlow`, which now has an alchemix-specific branch
  // (flash collateral → swap to alAsset → burn → withdraw → repay flash).
  const closeCollaterals = useMemo<SwapAsset[]>(() => [
    {
      symbol: market.underlyingSymbol,
      address: market.underlying,
      decimals: market.underlyingDecimals,
      icon: tokenNameToLogo(market.underlyingSymbol.toLowerCase()),
      rawBalance: collateralUnderlying,
      balance: Number(collateralUnderlying) / 10 ** market.underlyingDecimals,
      price: underlyingPriceRaw,
    },
  ], [market.underlying, market.underlyingSymbol, market.underlyingDecimals, collateralUnderlying, underlyingPriceRaw]);

  // Compute USD values from raw token amounts × 8-decimal prices.
  const collateralUsd = useMemo(() => {
    if (collateralUnderlying <= 0n || underlyingPriceRaw <= 0n) return 0;
    return (Number(collateralUnderlying) / 10 ** market.underlyingDecimals) * (Number(underlyingPriceRaw) / 1e8);
  }, [collateralUnderlying, underlyingPriceRaw, market.underlyingDecimals]);

  const debtUsd = useMemo(() => {
    if (debt <= 0n || debtPriceRaw <= 0n) return 0;
    return (Number(debt) / 10 ** market.debtDecimals) * (Number(debtPriceRaw) / 1e8);
  }, [debt, debtPriceRaw, market.debtDecimals]);

  // Burn-able debt for the close-with-collateral path. Alchemix's `burn(alAsset)` only repays
  // unearmarked debt — earmarked debt has had its collateral consumed by the transmuter and
  // can only be repaid via the MYT-side `repay()` (not what our limit-order topology uses).
  // We subtract earmarked AND a 0.5% buffer so the order can survive small earmark growth
  // between signing and settlement without tripping the alchemist's lockedCollateral check.
  const maxRepayableDebt = useMemo(() => {
    if (debt <= earmarked) return 0n;
    const unearmarked = debt - earmarked;
    const buffer = unearmarked / 200n; // 50 bps
    return unearmarked > buffer ? unearmarked - buffer : 0n;
  }, [debt, earmarked]);

  // Position manager so BorrowModal/WithdrawModal can compute "max" from collateral × LTV
  // instead of clamping to the user's wallet balance (which is alAsset dust after a repay).
  // Pass collateralUsd / debtUsd in 8-decimal raw bigints (PositionManager's contract).
  const positionManager = useMemo(() => {
    if (collateralUsd <= 0) return undefined;
    const maxLtvBps = Math.max(1, Math.round(maxLtvPct * 100));
    return new PositionManager(collateralUsd, debtUsd, maxLtvBps);
  }, [collateralUsd, debtUsd, maxLtvPct]);

  const ltvLabel = `${currentLtvPct.toFixed(1)}% / ${maxLtvPct.toFixed(0)}%`;
  const ltvHealthClass =
    maxLtvPct > 0 && currentLtvPct / maxLtvPct > 0.9
      ? "text-error"
      : maxLtvPct > 0 && currentLtvPct / maxLtvPct > 0.75
        ? "text-warning"
        : "text-success";

  // Per-row metrics — same shape as Euler/Morpho rows. Supply earns the live MYT yield;
  // the borrow rate is 0 because alAssets are self-repaying through the transmuter.
  //
  // Earmarked debt is a special case: that portion has already had its collateral allocated
  // to the transmuter and is being passively settled from yield, so it isn't an active
  // leverage burden on the user's net position. Counting it in the APY denominator would
  // wrongly inflate the displayed APY for what the user perceives as an unleveraged stack
  // (e.g. on a "pure" position with only earmarked dust the numbers should equal vaultApyPct,
  // not vaultApyPct × C / (C − earmarked)). We use unearmarked debt only for both the netAPY
  // denominator and the displayed netBalance.
  const unearmarkedDebtUsd = useMemo(() => {
    if (debt <= earmarked || debtPriceRaw <= 0n) return 0;
    const unearmarkedRaw = debt - earmarked;
    return (Number(unearmarkedRaw) / 10 ** market.debtDecimals) * (Number(debtPriceRaw) / 1e8);
  }, [debt, earmarked, debtPriceRaw, market.debtDecimals]);

  const rowMetrics = useMemo(() => {
    const supplied = collateralUsd > 0 ? [{ balance: collateralUsd, currentRate: vaultApyPct }] : [];
    const borrowed = unearmarkedDebtUsd > 0 ? [{ balance: unearmarkedDebtUsd, currentRate: 0 }] : [];
    return calculateNetYieldMetrics(supplied, borrowed);
  }, [collateralUsd, unearmarkedDebtUsd, vaultApyPct]);

  const TEXT_SUCCESS = "text-success";
  const TEXT_ERROR = "text-error";

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base-content/40 text-[10px] font-medium uppercase tracking-wider">
            {market.name}
          </span>
          <span className="text-base-content/50 font-mono">#{tokenId.toString()}</span>
          <span className="text-base-content/60 ml-1 font-mono tabular-nums">
            Balance:{" "}
            <span className={`font-semibold ${rowMetrics.netBalance >= 0 ? TEXT_SUCCESS : TEXT_ERROR}`}>
              {formatCurrencyCompact(rowMetrics.netBalance)}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 font-mono tabular-nums">
          {earmarked > 0n && (
            <span
              className="text-warning/80"
              title={`${market.debtSymbol} reserved for transmuter redemption — repaid automatically from yield. Only the unearmarked portion can be repaid via burn().`}
            >
              Redeeming:{" "}
              <span className="font-semibold">
                {(Number(earmarked) / 10 ** market.debtDecimals).toFixed(2)} {market.debtSymbol}
              </span>
            </span>
          )}
          <span className="text-base-content/60">
            APY:{" "}
            <span
              className={`font-semibold ${
                rowMetrics.netApyPercent == null
                  ? "text-base-content/40"
                  : rowMetrics.netApyPercent >= 0
                    ? TEXT_SUCCESS
                    : TEXT_ERROR
              }`}
            >
              {rowMetrics.netApyPercent != null ? formatSignedPercent(rowMetrics.netApyPercent) : "—"}
            </span>
          </span>
          <span
            className="text-base-content/60 group relative cursor-help"
            title={`Estimated 30-day yield at the current MYT APY. Annual estimate: ${formatCurrencyCompact(rowMetrics.netAnnualYield)}.`}
          >
            30D:{" "}
            <span className={`font-semibold ${rowMetrics.netYield30d >= 0 ? TEXT_SUCCESS : TEXT_ERROR}`}>
              {formatCurrencyCompact(rowMetrics.netYield30d)}
            </span>
          </span>
          <span className="text-base-content/60">
            LTV: <span className={`font-semibold ${ltvHealthClass}`}>{ltvLabel}</span>
          </span>
          {/* AL / ADL automation cogwheel disabled for alchemix until the watch-tower / orderbook
              path stops dropping our pre-hook-funded orders. CoW's OrderBook API runs a balance
              simulation against the order owner that DOES include pre-interactions
              (`shared/src/order_validation.rs::simulate_token_transfer` passes
              `interactions: app_data.interactions.pre.clone()`), but our chain — adapter funds
              router, manager pre-hook deposits + borrows + pushes — is too elaborate / private
              for a generic simulator to reason about, so the alchemix AL order never makes it
              into the orderbook. Re-enable once we either (a) ship a dedicated solver bot that
              calls `flashLoanAndSettle` directly and bypasses the orderbook validation, or
              (b) restructure the topology so the manager genuinely owns the sellToken before
              the orderbook simulates the trade. */}
          <button
            type="button"
            onClick={loopModal.open}
            className="btn btn-xs btn-ghost gap-1 normal-case"
            title="Multiply / Loop this position"
          >
            <ArrowsRightLeftIcon className="size-3.5" />
            Loop
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <SupplyPosition
          icon={tokenNameToLogo(market.underlyingSymbol.toLowerCase())}
          name={market.underlyingSymbol}
          tokenSymbol={market.underlyingSymbol}
          balance={collateralUsd}
          tokenBalance={collateralUnderlying}
          // Live MYT (Morpho V2 Vault) yield. Leverage on top of this is implicit from the
          // collateral/debt ratio shown elsewhere in the row.
          currentRate={vaultApyPct}
          tokenAddress={market.underlying}
          tokenDecimals={market.underlyingDecimals}
          tokenPrice={underlyingPriceRaw}
          protocolName={ALCHEMIX_GATEWAY_NAME}
          networkType="evm"
          chainId={chainId}
          protocolContext={context}
          position={positionManager}
          availableActions={{ deposit: true, withdraw: true, move: false, swap: false }}
        />
        <BorrowPosition
          icon={tokenNameToLogo(market.debtSymbol.toLowerCase())}
          name={market.debtSymbol}
          tokenSymbol={market.debtSymbol}
          balance={debtUsd}
          tokenBalance={debt}
          currentRate={0}
          tokenAddress={market.debtToken}
          tokenDecimals={market.debtDecimals}
          tokenPrice={debtPriceRaw}
          protocolName={ALCHEMIX_GATEWAY_NAME}
          networkType="evm"
          chainId={chainId}
          protocolContext={context}
          position={positionManager}
          availableActions={{ borrow: true, repay: true, move: false, close: debt > 0n, swap: false }}
          // BorrowPosition mounts its own internal CloseWithCollateralEvmModal for EVM protocols
          // — we just feed it `availableAssets` and it routes through `buildCloseWithCollateralFlow`
          // (which now has an alchemix-specific branch).
          availableAssets={closeCollaterals}
          // Cap the close-with-collateral max at the burn-able portion: total debt minus earmarked
          // (which alchemist.burn cannot clear via the alAsset path) minus a 0.5% leeway in case
          // the transmuter earmarks more between order signing and settlement. Without this,
          // selecting "Max" tries to repay all `debt`, the post-hook burn refunds the earmarked
          // excess back to the router, and WithdrawCollateral reverts because lockedCollateral
          // isn't fully released.
          closeDebtBalanceOverride={maxRepayableDebt}
        />
      </div>

      {/* Loop / Multiply modal — operates on the existing tokenId so we never have to predict
          the position id. For brand-new positions, user supplies first to mint the NFT, then
          Loop appears on the next render. */}
      <AlchemixMultiplyModal
        isOpen={loopModal.isOpen}
        onClose={loopModal.close}
        position={position}
        chainId={chainId}
      />

      {/* LTV automation modal — drives auto-leverage and ADL via the same shared modal Morpho/
          Aave/Euler/Compound use. Alchemix-specific context (marketId + tokenId) is passed via
          `alchemixContext`; the modal forwards it to `encodeProtocolContext` which produces the
          `(uint256,uint256)` blob the gateway and view both decode. */}
      <LTVAutomationModal
        isOpen={automationModal.isOpen}
        onClose={automationModal.close}
        protocolName={ALCHEMIX_GATEWAY_NAME}
        chainId={chainId}
        currentLtvBps={Math.max(0, Math.round(currentLtvPct * 100))}
        liquidationLtvBps={Math.max(1, Math.round(maxLtvPct * 100))}
        collateralTokens={[
          {
            symbol: market.underlyingSymbol,
            address: market.underlying,
            decimals: market.underlyingDecimals,
            icon: tokenNameToLogo(market.underlyingSymbol.toLowerCase()),
            rawBalance: collateralUnderlying,
            balance: Number(formatUnits(collateralUnderlying, market.underlyingDecimals)),
            price: underlyingPriceRaw,
            usdValue: collateralUsd,
          },
        ]}
        debtToken={{
          address: market.debtToken,
          symbol: market.debtSymbol,
          decimals: market.debtDecimals,
          balance: debt,
        }}
        totalCollateralUsd={BigInt(Math.round(collateralUsd * 1e8))}
        totalDebtUsd={BigInt(Math.round(debtUsd * 1e8))}
        alchemixContext={{ marketId: market.marketId, tokenId }}
      />
    </div>
  );
};

// Re-export the brand wordmark so callers (e.g. the markets page) can drop in the wide logo.
// Width:height is 978:196 — render with `style={{ width: "auto", height: 24 }}` or similar.
export const ALCHEMIX_BRAND_LOGO_SRC = "/logos/alchemix-full.svg";
export const AlchemixBrandLogo: FC<{ height?: number; className?: string }> = ({ height = 24, className }) => (
  <Image
    src={ALCHEMIX_BRAND_LOGO_SRC}
    alt="Alchemix"
    width={Math.round(height * (978 / 196))}
    height={height}
    className={className}
  />
);
