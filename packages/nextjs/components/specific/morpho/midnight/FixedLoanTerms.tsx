"use client";

import { formatUnits } from "viem";
import type { MidnightFinancing } from "~~/hooks/midnight/useMidnightFinancing";
import { WAD, YEAR } from "~~/utils/midnight/types";

export function maturityLabel(maturity: number) {
  return new Date(maturity * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function maturityDeadlineLabel(maturity: number) {
  return new Date(maturity * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}
export function FixedLoanTerms({
  financing: f,
  symbol,
  decimals,
  selectMarket = true,
}: {
  financing: MidnightFinancing;
  symbol: string;
  decimals: number;
  selectMarket?: boolean;
}) {
  const amount = (n: bigint) =>
    `${Number(formatUnits(n, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`;
  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Fixed loan terms">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Morpho · Fixed loan</h3>
        <span className="text-xs text-base-content/60">Choose when you repay</span>
      </div>
      {selectMarket && (
        <>
          {f.markets.isLoading ? (
            <p className="text-sm" role="status">
              Finding matching fixed markets…
            </p>
          ) : f.candidates.length === 0 ? (
            <p className="text-sm text-base-content/70">
              No active fixed market accepts this loan token and all selected collateral. Try another collateral or
              network.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {f.candidates.map(m => {
                const p = BigInt(m.bids[0]?.price ?? "0"),
                  ttm = BigInt(Math.max(1, m.maturity - Math.floor(Date.now() / 1000)));
                const indicative = p > 0n ? Number(((WAD - p) * YEAR * 10000n) / (p * ttm)) / 100 : null;
                return (
                  <button
                    key={m.market_id}
                    type="button"
                    onClick={() => f.setSelectedId(m.market_id)}
                    aria-pressed={m.market_id === f.selected?.market_id}
                    className={`rounded-lg border p-3 text-left transition-colors ${m.market_id === f.selected?.market_id ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/50"}`}
                  >
                    <span className="block text-sm font-medium">{maturityLabel(m.maturity)}</span>
                    <span className="mt-1 block text-xs text-base-content/60">
                      {indicative === null ? "No current bids" : `From ${indicative.toFixed(2)}% APR · indicative`}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] text-base-content/40">
                      {m.market_id.slice(0, 10)}…{m.market_id.slice(-6)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <label className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>Maximum fixed APR</span>
        <span className="flex items-center gap-2">
          <input
            aria-label="Maximum fixed APR"
            type="text"
            inputMode="decimal"
            value={f.maxAprInput}
            onChange={e => f.setMaxAprInput(e.target.value)}
            className="input input-bordered input-sm w-24 text-right font-mono"
          />
          %
        </span>
      </label>
      {f.selected && (
        <>
          {f.quote.isFetching && (
            <p className="text-xs text-base-content/60" role="status">
              Checking lender offers for this amount…
            </p>
          )}
          {f.preview && f.quote.data && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-base-content/60">Quoted fixed APR</dt>
              <dd className="text-right font-mono">{(Number(f.preview.apr) / 1e16).toFixed(3)}%</dd>
              <dt className="text-base-content/60">Repay by (UTC)</dt>
              <dd className="text-right">{maturityDeadlineLabel(f.selected.maturity)}</dd>
              <dt className="text-base-content/60">Cash received</dt>
              <dd className="text-right font-mono">{amount(f.preview.assets)}</dd>
              <dt className="text-base-content/60">Debt due at maturity</dt>
              <dd className="text-right font-mono">{amount(f.preview.units)}</dd>
              <dt className="text-base-content/60">Quoted lender liquidity</dt>
              <dd className="text-right font-mono">{amount(BigInt(f.quote.data.available_assets))}</dd>
              <dt className="text-base-content/60">Maximum new debt</dt>
              <dd className="text-right font-mono">{amount(f.preview.bounds.maxUnits)}</dd>
              <dt className="text-base-content/60">Health after financing</dt>
              <dd
                className={`text-right font-mono ${f.risk.data && f.risk.data.healthFactor < 1.05 ? "text-error" : "text-success"}`}
              >
                {f.risk.isFetching ? "Checking…" : (f.risk.data?.healthFactor.toFixed(2) ?? "—")}
              </dd>
            </dl>
          )}
          <p className="text-[11px] leading-relaxed text-base-content/60">
            Interest is included in the debt due. Early repayment pays that full debt. Offers refresh every 15 seconds;
            financing price tolerance is 0.5%.
          </p>
          {f.risk.data && f.risk.data.healthFactor < 1.05 && (
            <p className="text-xs text-error" role="alert">
              Add collateral or reduce borrowing to keep health at or above 1.05.
            </p>
          )}
        </>
      )}
      {f.error && (
        <div className="flex items-center justify-between gap-2 text-xs text-error" role="alert">
          <span>{f.error}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              void f.markets.refetch();
              if (f.selected) void f.quote.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!f.gateway.ready && (
        <p className="text-xs text-base-content/60">
          {f.gateway.isLoading
            ? "Checking fixed-loan availability…"
            : "Fixed-loan transactions are not enabled on this network yet. You can browse available terms."}
        </p>
      )}
    </section>
  );
}
