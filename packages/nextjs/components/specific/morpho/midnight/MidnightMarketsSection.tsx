"use client";

import { useMemo, useState } from "react";
import { maturityLabel } from "./FixedLoanTerms";
import { MidnightActionModal } from "./MidnightActionModal";
import { useAccount } from "wagmi";
import { useMidnightMarkets, useMidnightTokens } from "~~/hooks/midnight/useMidnight";
import { getEffectiveChainId } from "~~/utils/forkChain";
import { matchingMarkets } from "~~/utils/midnight/quotes";
import { type MidnightMarket, supportedMidnightChain } from "~~/utils/midnight/types";

export function MidnightMarketsSection({ chainId, enabled }: { chainId: number; enabled: boolean }) {
  const { address: user } = useAccount(),
    markets = useMidnightMarkets(chainId, undefined, enabled);
  const active = useMemo(
    () => (markets.data ?? []).filter(m => matchingMarkets([m], m.loan_token, []).length > 0),
    [markets.data],
  );
  const addresses = useMemo(
    () => [...new Set(active.flatMap(m => [m.loan_token, ...m.collaterals.map(c => c.token)]))],
    [active],
  );
  const tokens = useMidnightTokens(chainId, addresses),
    [selected, setSelected] = useState<MidnightMarket>();
  if (!supportedMidnightChain(getEffectiveChainId(chainId))) return null;
  return (
    <section className="mt-4 space-y-3 rounded-xl border border-base-300 p-4" aria-label="Fixed loan markets">
      <div>
        <h3 className="text-sm font-semibold">Fixed loans</h3>
        <p className="mt-1 text-xs text-base-content/60">
          Choose a maturity and add collateral to start. You can also refinance an existing position into a fixed loan.
        </p>
      </div>
      {markets.isLoading && (
        <p className="text-xs" role="status">
          Loading fixed markets…
        </p>
      )}
      {(markets.error || tokens.error) && (
        <p role="alert" className="text-xs text-error">
          {markets.error?.message ?? tokens.error?.message}
        </p>
      )}
      {markets.isSuccess && active.length === 0 && (
        <p className="text-xs text-base-content/60">No active fixed markets on this network.</p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {active.map(m => (
          <div key={m.market_id} className="flex items-center justify-between gap-3 rounded-lg bg-base-200/60 p-3">
            <div>
              <p className="text-sm font-medium">
                {tokens.data?.[m.loan_token.toLowerCase()]?.symbol ?? `${m.loan_token.slice(0, 6)}…`} ·{" "}
                {maturityLabel(m.maturity)}
              </p>
              <p className="mt-1 text-[11px] text-base-content/60">
                Collateral:{" "}
                {m.collaterals
                  .map(c => tokens.data?.[c.token.toLowerCase()]?.symbol ?? `${c.token.slice(0, 6)}…`)
                  .join(" / ")}
              </p>
              <p className="mt-1 text-[10px] text-base-content/40 font-mono">
                {m.market_id.slice(0, 10)}…{m.market_id.slice(-6)}
              </p>
            </div>
            <button
              type="button"
              disabled={!user || !tokens.data}
              className="btn btn-outline btn-sm"
              onClick={() => setSelected(m)}
            >
              Add collateral
            </button>
          </div>
        ))}
      </div>
      {!user && <p className="text-xs text-base-content/50">Connect a wallet to open a fixed loan.</p>}
      {selected && tokens.data && (
        <MidnightActionModal
          onClose={() => setSelected(undefined)}
          chainId={chainId}
          market={selected}
          tokens={tokens.data}
          action="deposit"
        />
      )}
    </section>
  );
}
