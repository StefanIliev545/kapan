"use client";

import { useMemo, useState } from "react";
import { FixedLoanTerms, maturityLabel } from "./FixedLoanTerms";
import { type Address, type Hex, formatUnits, parseUnits, zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { BaseModal } from "~~/components/modals/BaseModal";
import { BatchingPreference } from "~~/components/modals/common/BatchingPreference";
import {
  type MidnightPositionRow,
  rememberMidnightMarket,
  useMidnightGateway,
  useMidnightMarkets,
  useMidnightRisk,
  useMidnightTokens,
} from "~~/hooks/midnight/useMidnight";
import { useMidnightFinancing } from "~~/hooks/midnight/useMidnightFinancing";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { getKyberAdapterAddress, getOneInchAdapterAddress } from "~~/utils/chainFeatures";
import { getAvailableFlashLoanProviders } from "~~/utils/flashLoan";
import { collateralIndex, encodeMidnightContext, sameAddress } from "~~/utils/midnight/encoding";
import { buildMidnightRepay, buildMidnightSwap } from "~~/utils/midnight/flows";
import { borrowingBounds, matchingMarkets, validateQuote } from "~~/utils/midnight/quotes";
import { MIDNIGHT_PROTOCOL, type MidnightMarket, type MidnightToken } from "~~/utils/midnight/types";

export type MidnightAction =
  | "deposit"
  | "withdraw"
  | "repay"
  | "borrow"
  | "leverage"
  | "deleverage"
  | "collateral"
  | "debt";
const labels: Record<MidnightAction, string> = {
  deposit: "Add collateral",
  withdraw: "Withdraw collateral",
  repay: "Repay fixed debt",
  borrow: "Borrow at a fixed rate",
  leverage: "Increase leverage",
  deleverage: "Repay with collateral",
  collateral: "Swap collateral",
  debt: "Switch fixed debt",
};
function rawAmount(text: string, decimals: number) {
  if (!/^\d+(\.\d*)?$/.test(text) || (text.split(".")[1]?.length ?? 0) > decimals) return 0n;
  try {
    const n = parseUnits(text, decimals);
    return n > 0n && n < 2n ** 128n ? n : 0n;
  } catch {
    return 0n;
  }
}
export function MidnightActionModal({
  onClose,
  chainId,
  market,
  tokens,
  row,
  action,
  initialToken,
}: {
  onClose: () => void;
  chainId: number;
  market: MidnightMarket;
  tokens: Record<string, MidnightToken>;
  row?: MidnightPositionRow;
  action: MidnightAction;
  initialToken?: Address;
}) {
  const { address: user } = useAccount();
  const [input, setInput] = useState("");
  const [selectedCollateral, setSelectedCollateral] = useState(initialToken ?? market.collaterals[0].token);
  const [targetCollateral, setTargetCollateral] = useState(
    market.collaterals.find(c => !sameAddress(c.token, selectedCollateral))?.token ?? selectedCollateral,
  );
  const [newLoan, setNewLoan] = useState<Address>(zeroAddress);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const borrowing = action === "borrow" || action === "leverage" || action === "debt";
  const swapping = action === "leverage" || action === "deleverage" || action === "collateral" || action === "debt";
  const allMarkets = useMidnightMarkets(chainId, undefined, action === "debt");
  const debtMarkets = useMemo(
    () =>
      (allMarkets.data ?? []).filter(
        m =>
          !sameAddress(m.loan_token, market.loan_token) &&
          matchingMarkets(
            [m],
            m.loan_token,
            (row?.collaterals ?? []).filter(c => BigInt(c.amount) > 0n).map(c => c.token),
          ).length > 0,
      ),
    [allMarkets.data, market.loan_token, row],
  );
  const extraTokens = useMidnightTokens(chainId, [...new Set(debtMarkets.map(m => m.loan_token))]);
  const metadata = { ...tokens, ...extraTokens.data };
  const loan = tokens[market.loan_token.toLowerCase()],
    collateral = tokens[selectedCollateral.toLowerCase()];
  const amountToken =
    action === "debt"
      ? metadata[newLoan.toLowerCase()]
      : action === "borrow" || action === "repay" || action === "leverage"
        ? loan
        : collateral;
  const amount = rawAmount(input, amountToken?.decimals ?? 18);
  const debt = BigInt(row?.debt ?? "0");
  const held = row?.collaterals.find(c => sameAddress(c.token, selectedCollateral));
  const heldAmount = BigInt(held?.amount ?? "0");
  const wallet = useTokenBalance({
    tokenAddress: amountToken?.address ?? zeroAddress,
    network: "evm",
    chainId,
    decimalsHint: amountToken?.decimals,
  });
  const providers = useMemo(() => getAvailableFlashLoanProviders(chainId).filter(p => p.feeBps === 0), [chainId]);
  const flashToken = action === "deleverage" ? loan.address : amountToken?.address;
  // A conservative liquidity request until the deleverage quote determines repayment.
  const flash = useFlashLoanSelection({
    chainId,
    flashLoanProviders: providers,
    defaultProvider: providers[0],
    tokenAddress: flashToken,
    amount: swapping ? (action === "deleverage" ? debt : amount) : 0n,
  });
  const src = action === "leverage" ? loan.address : action === "debt" ? newLoan : selectedCollateral;
  const dst = action === "leverage" ? selectedCollateral : action === "collateral" ? targetCollateral : loan.address;
  const swap = use1inchQuote({
    chainId,
    src,
    dst,
    amount: amount.toString(),
    from: getOneInchAdapterAddress(chainId) ?? getKyberAdapterAddress(chainId) ?? zeroAddress,
    slippage: 0.5,
    enabled: swapping && amount > 0n && src !== zeroAddress && !sameAddress(src, dst),
    preferredRouter: "best",
  });
  const swapCurrent =
    swapping &&
    swap.isAmountCurrent &&
    !swap.isFetching &&
    !!swap.data &&
    !swap.error &&
    Date.now() - swap.dataUpdatedAt < 60000 &&
    (!swap.data.srcToken || sameAddress(swap.data.srcToken.address, src)) &&
    (!swap.data.dstToken || sameAddress(swap.data.dstToken.address, dst));
  const minOut = swapCurrent ? (BigInt(swap.data!.dstAmount) * 9950n) / 10000n : 0n;
  const repay = action === "deleverage" ? (minOut < debt ? minOut : debt) : debt;
  const additions = useMemo(
    () =>
      action === "leverage"
        ? [{ address: selectedCollateral, amount: minOut }]
        : action === "debt"
          ? (row?.collaterals ?? [])
              .filter(c => BigInt(c.amount) > 0n)
              .map(c => ({ address: c.token, amount: BigInt(c.amount) }))
          : [],
    [action, selectedCollateral, minOut, row],
  );
  const financing = useMidnightFinancing({
    chainId,
    loan: action === "debt" ? newLoan : loan.address,
    assets: amount,
    collaterals: additions,
    enabled: borrowing && amount > 0n && (!swapping || !!swapCurrent),
    market: action === "debt" ? undefined : market,
  });
  const gateway = useMidnightGateway(chainId);
  const builder = useKapanRouterV2({ chainId });
  const changes = useMemo(
    () =>
      action === "withdraw" || action === "deleverage"
        ? [{ address: selectedCollateral, amount: -amount }]
        : action === "collateral"
          ? [
              { address: selectedCollateral, amount: -amount },
              { address: targetCollateral, amount: minOut },
            ]
          : [],
    [action, selectedCollateral, targetCollateral, amount, minOut],
  );
  const risk = useMidnightRisk(
    chainId,
    market,
    user,
    changes,
    action === "deleverage" ? -repay : 0n,
    amount > 0n && ["withdraw", "deleverage", "collateral"].includes(action),
  );
  const hf = risk.data?.healthFactor;
  const insufficientWallet =
    (action === "deposit" || action === "repay") && (wallet.isLoading || wallet.isError || amount > wallet.balance);
  const insufficientCollateral = ["withdraw", "deleverage", "collateral"].includes(action) && amount > heldAmount;
  const liquid =
    !!flash.selectedProvider &&
    !flash.isLoading &&
    flash.liquidityData.some(
      p =>
        p.provider === flash.selectedProvider?.providerEnum &&
        p.hasLiquidity &&
        p.liquidity >= (action === "deleverage" ? repay : amount),
    );
  const invalidSwap =
    swapping &&
    (!swapCurrent ||
      minOut === 0n ||
      !liquid ||
      sameAddress(src, dst) ||
      (action === "debt" && minOut < debt) ||
      (action === "deleverage" && repay === 0n));
  const healthy = borrowing
    ? financing.ready
    : !!risk.data && !risk.isFetching && !risk.error && risk.data.healthFactor >= 1.05;
  const ready =
    !!user &&
    gateway.ready &&
    amount > 0n &&
    !insufficientWallet &&
    !insufficientCollateral &&
    !invalidSwap &&
    (action === "deposit" || action === "repay" || healthy) &&
    !submitting;
  const buildFlow = async () => {
    if (!ready || !user || !amountToken)
      throw new Error("Check the amount, available offers and position health before continuing.");
    let context = encodeMidnightContext(market.market_id, collateralIndex(market, selectedCollateral));
    if (borrowing) {
      if (!financing.selected || !financing.quote.data || !financing.preview)
        throw new Error("Refresh the fixed loan quote.");
      validateQuote(financing.quote.data, financing.selected, amount);
      borrowingBounds(
        financing.quote.data,
        amount,
        financing.preview.bounds.maxApr,
        50,
        Math.floor(Date.now() / 1000),
        user,
      );
      context = encodeMidnightContext(
        financing.selected.market_id,
        action === "debt" ? 0 : collateralIndex(market, selectedCollateral),
        financing.quote.data,
        financing.preview.bounds,
      );
      rememberMidnightMarket(chainId, user, financing.selected.market_id);
    }
    rememberMidnightMarket(chainId, user, market.market_id);
    if (action === "deposit")
      return builder.buildDepositFlow(MIDNIGHT_PROTOCOL, selectedCollateral, input, collateral.decimals, context);
    if (action === "withdraw")
      return builder.buildWithdrawFlow(
        MIDNIGHT_PROTOCOL,
        selectedCollateral,
        input,
        collateral.decimals,
        false,
        context,
      );
    if (action === "repay") return buildMidnightRepay(user, market, amount);
    if (action === "borrow")
      return builder.buildBorrowFlow(MIDNIGHT_PROTOCOL, loan.address, input, loan.decimals, context);
    if (!swap.data || !flash.selectedProvider || !swapCurrent || Date.now() - swap.dataUpdatedAt >= 60000)
      throw new Error("Refresh the swap quote.");
    const swapRouter = swap.data.aggregator === "1inch" ? "oneinch" : swap.data.aggregator;
    if (action === "leverage")
      return builder.buildMultiplyFlow({
        protocolName: MIDNIGHT_PROTOCOL,
        collateralToken: selectedCollateral,
        debtToken: loan.address,
        initialCollateral: "0",
        flashLoanAmount: input,
        minCollateralOut: minOut.toString(),
        swapData: swap.data.tx.data,
        collateralDecimals: collateral.decimals,
        debtDecimals: loan.decimals,
        flashLoanProvider: flash.selectedProvider.providerEnum,
        morphoContext: context,
        swapRouter,
        includeRefundPush: true,
      });
    return buildMidnightSwap({
      mode: action,
      user,
      market,
      tokenIn: src,
      tokenOut: dst,
      amount,
      minOut,
      repay,
      swapData: swap.data.tx.data as Hex,
      swapRouter,
      provider: flash.selectedProvider.providerEnum,
      collateralsToMove: additions.map(c => c.address as Address),
      destination: action === "debt" && financing.selected ? { market: financing.selected, context } : undefined,
    });
  };
  const flow = useEvmTransactionFlow({
    isOpen: true,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Fixed-loan transaction sent",
    simulateWhenBatching: true,
  });
  const submit = async () => {
    setError(undefined);
    setSubmitting(true);
    try {
      await flow.handleConfirm(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setSubmitting(false);
    }
  };
  const fmt = (n: bigint, t: MidnightToken) =>
    `${Number(formatUnits(n, t.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${t.symbol}`;
  return (
    <BaseModal isOpen onClose={onClose} title={labels[action]} maxWidthClass="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">Morpho · Fixed loan</span>
          <span className="text-base-content/60">Due {maturityLabel(market.maturity)} UTC</span>
        </div>
        {action === "debt" && (
          <label className="block space-y-1 text-sm">
            <span>New debt token</span>
            <select
              aria-label="New debt token"
              className="select select-bordered w-full"
              value={newLoan}
              onChange={e => {
                setNewLoan(e.target.value as Address);
                setInput("");
              }}
            >
              <option value={zeroAddress}>Select a loan token</option>
              {Object.values(extraTokens.data ?? {}).map(t => (
                <option key={t.address} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
            {allMarkets.error && <span className="text-error">{allMarkets.error.message}</span>}
          </label>
        )}
        {!["borrow", "repay", "debt"].includes(action) && (
          <label className="block space-y-1 text-sm">
            <span>{action === "leverage" ? "Collateral to buy" : "Collateral"}</span>
            <select
              aria-label="Collateral"
              value={selectedCollateral}
              onChange={e => {
                setSelectedCollateral(e.target.value as Address);
                if (action !== "leverage") setInput("");
              }}
              className="select select-bordered w-full"
            >
              {market.collaterals.map(c => (
                <option key={c.token} value={c.token}>
                  {tokens[c.token.toLowerCase()]?.symbol ?? c.token}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === "collateral" && (
          <label className="block space-y-1 text-sm">
            <span>Receive as collateral</span>
            <select
              aria-label="Receive as collateral"
              value={targetCollateral}
              onChange={e => setTargetCollateral(e.target.value as Address)}
              className="select select-bordered w-full"
            >
              {market.collaterals.map(c => (
                <option key={c.token} value={c.token}>
                  {tokens[c.token.toLowerCase()]?.symbol ?? c.token}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-2 text-sm">
          <span>
            {action === "leverage"
              ? "Borrow and swap"
              : action === "debt"
                ? "New loan cash to swap"
                : action === "borrow"
                  ? "Cash to receive"
                  : "Amount"}{" "}
            {amountToken?.symbol}
          </span>
          <input
            autoFocus
            aria-label="Amount"
            className="input input-bordered w-full font-mono"
            inputMode="decimal"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="0.00"
          />
        </label>
        {action === "repay" && (
          <div className="flex justify-between text-xs">
            <span>Debt due: {fmt(debt, loan)}</span>
            <button
              type="button"
              className="text-primary"
              onClick={() => setInput(formatUnits(debt < wallet.balance ? debt : wallet.balance, loan.decimals))}
            >
              Max repayment
            </button>
          </div>
        )}
        {action === "repay" && (
          <p className="text-xs text-base-content/60">
            Interest is already included in this balance. Repaying early does not reduce it.
          </p>
        )}
        {insufficientWallet && amount > 0n && (
          <p className="text-xs text-error">
            {wallet.isLoading ? "Checking wallet balance…" : "Insufficient wallet balance, or balance unavailable."}
          </p>
        )}
        {insufficientCollateral && <p className="text-xs text-error">This exceeds your collateral balance.</p>}
        {swapping && (
          <div className="rounded-lg bg-base-200 p-3 text-xs space-y-2">
            <p>Market swap · 0.5% slippage tolerance</p>
            {swap.isFetching || !swap.isAmountCurrent ? (
              <p role="status">Finding the best aggregator quote…</p>
            ) : swap.error ? (
              <p className="text-error">{swap.error.message}</p>
            ) : swapCurrent && metadata[dst.toLowerCase()] ? (
              <p>
                Receive at least {fmt(minOut, metadata[dst.toLowerCase()])} via {swap.data!.aggregator}.
              </p>
            ) : null}
            <p>
              {flash.isLoading
                ? "Checking flash-loan liquidity…"
                : liquid
                  ? `Flash loan: ${flash.selectedProvider?.name} · no fee`
                  : "No zero-fee flash loan with sufficient liquidity is available."}
            </p>
            {action === "deleverage" && <p>Repay {fmt(repay, loan)}. Any surplus is returned to your wallet.</p>}
            {action === "debt" && minOut > 0n && minOut < debt && (
              <p className="text-error">
                Increase the new loan amount to repay the full existing debt and move its collateral.
              </p>
            )}
            <p className="text-base-content/50">Limit orders are not available for fixed loans yet.</p>
          </div>
        )}
        {borrowing && (
          <FixedLoanTerms
            financing={financing}
            symbol={amountToken?.symbol ?? ""}
            decimals={amountToken?.decimals ?? 18}
            selectMarket={action === "debt"}
          />
        )}
        {["withdraw", "deleverage", "collateral"].includes(action) && (
          <p className={`text-xs ${healthy ? "text-base-content/70" : "text-error"}`}>
            Health after repayment / withdrawal:{" "}
            {hf === undefined ? "Checking…" : Number.isFinite(hf) ? hf.toFixed(2) : "No debt"}
            {hf !== undefined && !healthy && ". Keep health at or above 1.05."}
          </p>
        )}
        {!gateway.ready && !borrowing && (
          <p className="text-xs text-base-content/60">Fixed-loan transactions are not enabled on this network yet.</p>
        )}
        {risk.error && (
          <p className="text-xs text-error" role="alert">
            {risk.error.message}
          </p>
        )}
        {error && (
          <p className="break-words text-xs text-error" role="alert">
            {error}
          </p>
        )}
        <BatchingPreference
          enabled={flow.batchingPreference.enabled}
          setEnabled={flow.batchingPreference.setEnabled}
          isLoaded={flow.batchingPreference.isLoaded}
        />
        <button type="button" disabled={!ready} className="btn btn-primary w-full" onClick={submit}>
          {submitting ? "Confirm in wallet…" : labels[action]}
        </button>
      </div>
    </BaseModal>
  );
}
