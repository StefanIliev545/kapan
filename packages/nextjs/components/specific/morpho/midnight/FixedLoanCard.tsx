"use client";

import { maturityDeadlineLabel } from "./FixedLoanTerms";
import type { MidnightAction } from "./MidnightActionModal";
import { ArrowUpRight, CalendarClock, LockKeyhole } from "lucide-react";
import { type Address, formatUnits } from "viem";
import type { MidnightPositionRow } from "~~/hooks/midnight/useMidnight";
import type { MidnightToken } from "~~/utils/midnight/types";

export function FixedLoanCard({
  row,
  tokens,
  onAction,
  onRefinance,
  now = Math.floor(Date.now() / 1000),
}: {
  row: MidnightPositionRow;
  tokens: Record<string, MidnightToken>;
  onAction: (action: MidnightAction, token?: Address) => void;
  onRefinance: () => void;
  now?: number;
}) {
  const loan = tokens[row.loan_token.toLowerCase()],
    debt = BigInt(row.debt),
    matured = now >= row.maturity;
  const hf = debt ? Number((row.capacity * 10000n) / debt) / 10000 : Infinity;
  const fmt = (amount: bigint, token: MidnightToken) =>
    Number(formatUnits(amount, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const active = row.collaterals.filter(c => BigInt(c.amount) > 0n);
  return (
    <article
      className="overflow-hidden rounded-xl border border-base-300 bg-base-100"
      aria-label={`${loan.symbol} fixed loan`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300/70 bg-base-200/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">
            {active.map(c => tokens[c.token.toLowerCase()].symbol).join(" + ") || "Collateral"}{" "}
            <span className="text-base-content/40">/</span> {loan.symbol}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
            <LockKeyhole size={12} />
            Fixed loan
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 text-xs ${matured && debt > 0n ? "text-error" : "text-base-content/60"}`}
        >
          <CalendarClock size={14} />
          {matured ? "Matured" : "Repay by"} {maturityDeadlineLabel(row.maturity)} UTC
        </div>
      </header>
      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-base-content/50">Debt due</dt>
            <dd className="mt-1 font-mono text-base font-semibold">
              {fmt(debt, loan)} <span className="text-xs font-normal text-base-content/60">{loan.symbol}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-base-content/50">Fixed APR</dt>
            <dd className="mt-1 font-mono text-base font-semibold">
              {row.effective_rate_wad != null ? `${(Number(row.effective_rate_wad) / 1e16).toFixed(2)}%` : "—"}
            </dd>
            {row.effective_rate_wad == null && (
              <span className="text-[10px] text-base-content/50">Entry rate unavailable</span>
            )}
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-base-content/50">Health factor</dt>
            <dd className={`mt-1 font-mono text-base font-semibold ${hf < 1.1 ? "text-error" : "text-success"}`}>
              {debt ? hf.toFixed(2) : "No debt"}
            </dd>
          </div>
        </dl>
        {matured && debt > 0n && (
          <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            This loan has matured. Repay or refinance the outstanding debt.
          </p>
        )}
        <div className="space-y-2">
          {marketCollateralRows(row, tokens).map(({ token, amount }) => (
            <div
              key={token.address}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base-200/50 px-3 py-2"
            >
              <div className="text-sm">
                <span className="font-medium">{token.symbol}</span>
                <span className="ml-3 font-mono text-xs text-base-content/60">{fmt(amount, token)} collateral</span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => onAction("deposit", token.address)}
                >
                  Add
                </button>
                {amount > 0n && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onAction("withdraw", token.address)}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!matured && (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction("borrow")}>
                Borrow
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onAction("leverage")}>
                Leverage
              </button>
            </>
          )}
          {debt > 0n && (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onAction("repay")}>
                Repay
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction("deleverage")}>
                Repay with collateral
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRefinance}>
                Refinance <ArrowUpRight size={13} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction("debt")}>
                Switch debt
              </button>
            </>
          )}
          {row.market.collaterals.length > 1 && active.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction("collateral")}>
              Swap collateral
            </button>
          )}
        </div>
        <p className="text-[10px] leading-relaxed text-base-content/50">
          Interest is included in debt due. Early repayment does not reduce this balance. · Market{" "}
          {row.market_id.slice(0, 10)}…{row.market_id.slice(-6)}
        </p>
      </div>
    </article>
  );
}
function marketCollateralRows(row: MidnightPositionRow, tokens: Record<string, MidnightToken>) {
  return row.market.collaterals.map(c => ({
    token: tokens[c.token.toLowerCase()],
    amount: BigInt(row.collaterals.find(b => b.token.toLowerCase() === c.token.toLowerCase())?.amount ?? "0"),
  }));
}
