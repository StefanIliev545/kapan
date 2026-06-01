import type { Address } from "viem";

/**
 * A single PT (or LP / YT) position as surfaced by Pendle's dashboard API.
 *
 * The upstream Pendle payload is large and not fully documented; we extract
 * only the fields we actually need and parse defensively so schema drift
 * upstream doesn't break the UI.
 */
export interface PendlePortfolioPosition {
  chainId: number;
  marketAddress: Address;
  ptAddress: Address;
  /** Raw PT balance (string, in PT decimals — usually 18). */
  ptBalance: string;
  /** Current position valuation in USD (market price * balance). */
  valuationUsd: number;
  /** APY the user locked in at entry (percentage, e.g. 15.5 for 15.5%). */
  entryApyPercent: number | null;
  /** PT price at entry, in underlying-asset units. */
  entryPriceInAsset: number | null;
  /** Unrealized P&L in USD relative to cost basis. */
  unrealizedPnlUsd: number | null;
}

export type PendlePortfolioResponse = {
  positions: PendlePortfolioPosition[];
  /** Raw response preserved for debugging / future fields. */
  raw?: unknown;
};

const toNumber = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const pickAddress = (v: unknown): Address | null => {
  if (typeof v !== "string") return null;
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? (v.toLowerCase() as Address) : null;
};

/**
 * Defensive parse of Pendle's `dashboard/positions/database/{address}` response.
 * We tolerate minor shape changes (field renames, missing blocks) and skip
 * entries we can't interpret rather than throwing.
 */
function parsePendlePortfolio(data: unknown): PendlePortfolioPosition[] {
  if (!data || typeof data !== "object") return [];

  // The top-level shape Pendle returns at the time of writing nests groups
  // under various keys (`positions`, `chains[].markets[]`, etc.). Check the
  // common ones and flatten.
  const candidateArrays: unknown[] = [];
  const root = data as Record<string, unknown>;

  if (Array.isArray(root.positions)) candidateArrays.push(...(root.positions as unknown[]));
  if (Array.isArray(root.openPositions)) candidateArrays.push(...(root.openPositions as unknown[]));
  // Some shapes: { chains: [{ chainId, markets: [ { marketAddress, openPositions: [...] } ] }] }
  if (Array.isArray(root.chains)) {
    for (const chain of root.chains as unknown[]) {
      const c = chain as Record<string, unknown>;
      const chainId = toNumber(c.chainId);
      if (chainId == null) continue;
      const markets = Array.isArray(c.markets) ? (c.markets as unknown[]) : [];
      for (const market of markets) {
        const m = market as Record<string, unknown>;
        const marketAddress = pickAddress(m.marketAddress ?? m.address);
        const positionBlocks: unknown[] = [];
        if (Array.isArray(m.openPositions)) positionBlocks.push(...(m.openPositions as unknown[]));
        if (Array.isArray(m.positions)) positionBlocks.push(...(m.positions as unknown[]));
        for (const p of positionBlocks) {
          candidateArrays.push({ ...(p as Record<string, unknown>), _chainId: chainId, _marketAddress: marketAddress });
        }
      }
    }
  }

  const out: PendlePortfolioPosition[] = [];

  for (const entry of candidateArrays) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const chainId = toNumber(e.chainId ?? e._chainId);
    if (chainId == null) continue;

    const marketAddress = pickAddress(e.marketAddress ?? e.market ?? e._marketAddress);
    const ptBlock = (e.pt ?? e.PT) as Record<string, unknown> | undefined;
    const ptAddress = pickAddress(ptBlock?.address);
    if (!ptAddress) continue;

    const ptBalance = typeof ptBlock?.balance === "string" ? (ptBlock.balance as string) : String(ptBlock?.balance ?? "0");
    const valuationUsd = toNumber(ptBlock?.valuation ?? ptBlock?.valueUsd ?? e.valuation) ?? 0;

    // Entry APY lives under various keys depending on the Pendle release.
    const entryApyRaw = toNumber(
      e.impliedApyAtEntry ??
        e.entryApy ??
        e.entryImpliedApy ??
        (e.pnl as Record<string, unknown> | undefined)?.entryImpliedApy ??
        (e.pnl as Record<string, unknown> | undefined)?.impliedApy
    );
    const entryApyPercent = entryApyRaw != null ? entryApyRaw * 100 : null;

    const entryPriceInAsset = toNumber(
      (e.pnl as Record<string, unknown> | undefined)?.entryPrice ?? e.entryPrice ?? e.costBasisAsset
    );

    const unrealizedPnlUsd = toNumber(
      (e.pnl as Record<string, unknown> | undefined)?.pnl ?? e.unrealizedPnl ?? e.pnlUsd
    );

    out.push({
      chainId,
      marketAddress: (marketAddress ?? ("0x0000000000000000000000000000000000000000" as Address)),
      ptAddress,
      ptBalance,
      valuationUsd,
      entryApyPercent,
      entryPriceInAsset,
      unrealizedPnlUsd,
    });
  }

  return out;
}

export async function fetchPendlePortfolio(
  address: string,
  signal?: AbortSignal,
): Promise<PendlePortfolioResponse> {
  const response = await fetch(`/api/pendle/portfolio/${address}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Pendle portfolio fetch failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    positions: parsePendlePortfolio(data),
    raw: data,
  };
}
