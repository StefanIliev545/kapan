import { NextResponse } from "next/server";

/**
 * Pharos stablecoin safety grades proxy.
 *
 * Joins https://api.pharos.watch/api/report-cards (letter grades) with
 * /api/stablecoins (per-chain contract deployments) into a slim lookup payload
 * consumed by components/common/PharosGradeBadge.tsx via utils/pharos/gradesApi.ts.
 *
 * Requires PHAROS_API_KEY (server-side env, self-serve key from
 * https://pharos.watch/api/ — 30 req/min, expires after 60 days). Pharos CORS
 * only allows their own origin, so this must stay a server-side proxy and the
 * key must never ship to the client.
 *
 * Rate-limit compliance: Pharos asks for >=300s polling on these endpoints and
 * caps self-serve keys at 30 req/min. We batch — the two endpoints return ALL
 * coins in one call each (no per-asset requests) — and cache the joined result
 * in module memory for an hour, serving stale data on upstream failure. A
 * single warm server instance therefore makes at most ~2 upstream calls/hour;
 * the Cache-Control header below additionally lets the CDN absorb client
 * traffic for an hour. Client-side, react-query holds one cache entry per
 * browser session (see usePharosGrades).
 */

export const dynamic = "force-dynamic";

const PHAROS_API = "https://api.pharos.watch";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Chains Kapan renders markets/positions on, in Pharos chain-identifier form.
const SUPPORTED_CHAINS = new Set(["ethereum", "arbitrum", "base", "optimism", "linea", "starknet"]);

/**
 * Tickers shared by several active Pharos coins where the chain filter below
 * cannot disambiguate, resolved manually to the asset our protocols actually
 * list. Each entry was verified by matching Pendle's underlyingAsset.address
 * (api-v2.pendle.finance markets, chains 1/42161/8453/10/59144) against
 * Pharos /api/stablecoins contracts — see scripts note in the PR. Re-verify
 * when adding entries; a wrong grade is worse than none.
 */
const AMBIGUOUS_SYMBOL_OVERRIDES: Record<string, string> = {
  USD3: "usd3-3jane", // Pendle PT-USD3 wraps 3Jane, not Reserve's Web3 Dollar
  REUSD: "reusd-re-protocol", // Pendle reUSD = Re Protocol, not Resupply
  NUSD: "nusd-neutrl", // Pendle nUSD = Neutrl
  USDF: "usdf-falcon", // Falcon (Astherus USDF is BSC-only)
};

interface PharosReportCard {
  id: string;
  symbol: string;
  overallGrade: string; // "A+".."F" | "NR"
  overallScore: number | null;
  isDefunct?: boolean;
}

interface PharosContractDeployment {
  chain: string;
  address: string;
  decimals: number;
}

interface PharosStablecoin {
  id: string;
  contracts?: PharosContractDeployment[];
}

export interface PharosGradeEntry {
  /** Canonical Pharos stablecoin ID — links to https://pharos.watch/stablecoin/{id}/ */
  id: string;
  /** Letter grade "A+" through "F" (NR coins are omitted) */
  grade: string;
  /** Weighted safety score 0-100 */
  score: number | null;
}

export interface PharosGradesPayload {
  /** Unix seconds of the upstream report-card snapshot, null when unavailable */
  updatedAt: number | null;
  /** Uppercase ticker -> grade entry (unambiguous or manually resolved tickers) */
  grades: Record<string, PharosGradeEntry>;
  /** Lowercase token contract address (on SUPPORTED_CHAINS) -> grade entry. Exact — prefer over `grades`. */
  byAddress: Record<string, PharosGradeEntry>;
}

const EMPTY: PharosGradesPayload = { updatedAt: null, grades: {}, byAddress: {} };

/**
 * Canonical address key: lowercase, leading zeros stripped. Starknet felts are
 * zero-padded differently across sources (Pharos publishes unpadded, our hooks
 * pad to 64 hex chars). Keep in sync with the same helper in
 * utils/pharos/gradesApi.ts (not imported to keep server/client bundles apart).
 */
const addressKey = (address: string) => `0x${address.toLowerCase().replace(/^0x0*/, "")}`;

/** Thrown on 429 so the cache layer can honor Retry-After. */
class PharosRateLimitError extends Error {
  retryAfterMs: number;
  constructor(path: string, retryAfterMs: number) {
    super(`Pharos ${path} returned 429`);
    this.retryAfterMs = retryAfterMs;
  }
}

async function fetchPharos<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${PHAROS_API}${path}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    cache: "no-store", // report-cards is ~4MB (over Next's 2MB fetch-cache limit); we cache the joined result ourselves
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new PharosRateLimitError(path, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000);
  }
  if (!response.ok) {
    throw new Error(`Pharos ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Pick the single card a ticker should resolve to. Duplicate tickers use the
 * manual override first, then keep the coin actually deployed on our chains;
 * still-ambiguous ones resolve to nothing — address lookup remains available.
 */
function resolveTickerCard(
  symbol: string,
  cards: PharosReportCard[],
  onSupportedChains: Set<string>,
): PharosReportCard | null {
  if (cards.length === 1) return cards[0];
  const overrideId = AMBIGUOUS_SYMBOL_OVERRIDES[symbol];
  if (overrideId) return cards.find(c => c.id === overrideId) ?? null;
  const local = cards.filter(c => onSupportedChains.has(c.id));
  return local.length === 1 ? local[0] : null;
}

async function buildPayload(apiKey: string): Promise<PharosGradesPayload> {
  const [reportCards, stablecoins] = await Promise.all([
    fetchPharos<{ cards: PharosReportCard[]; updatedAt: number }>("/api/report-cards", apiKey),
    fetchPharos<{ peggedAssets: PharosStablecoin[] }>("/api/stablecoins", apiKey),
  ]);

  const contractsById = new Map<string, PharosContractDeployment[]>();
  const onSupportedChains = new Set<string>();
  for (const coin of stablecoins.peggedAssets ?? []) {
    const local = (coin.contracts ?? []).filter(c => SUPPORTED_CHAINS.has(c.chain));
    if (local.length > 0) {
      contractsById.set(coin.id, local);
      onSupportedChains.add(coin.id);
    }
  }

  const cardsBySymbol = new Map<string, PharosReportCard[]>();
  const entryById = new Map<string, PharosGradeEntry>();
  for (const card of reportCards.cards ?? []) {
    if (card.isDefunct || !card.overallGrade || card.overallGrade === "NR") continue;
    const symbol = card.symbol?.toUpperCase();
    if (!symbol) continue;
    const list = cardsBySymbol.get(symbol) ?? [];
    list.push(card);
    cardsBySymbol.set(symbol, list);
    entryById.set(card.id, { id: card.id, grade: card.overallGrade, score: card.overallScore });
  }

  const grades: Record<string, PharosGradeEntry> = {};
  for (const [symbol, cards] of cardsBySymbol) {
    const card = resolveTickerCard(symbol, cards, onSupportedChains);
    if (!card) continue;
    grades[symbol] = entryById.get(card.id)!;
  }

  const byAddress: Record<string, PharosGradeEntry> = {};
  for (const [id, contracts] of contractsById) {
    const entry = entryById.get(id);
    if (!entry) continue;
    for (const contract of contracts) {
      byAddress[addressKey(contract.address)] = entry;
    }
  }

  return { updatedAt: reportCards.updatedAt ?? null, grades, byAddress };
}

// Module-level cache: one upstream refresh per TTL per server instance, with
// single-flight de-dup, stale-serve on upstream failure, and a backoff window
// after failures (Retry-After-derived on 429) so a burst of requests during a
// Pharos incident can't hammer their API.
let cached: { payload: PharosGradesPayload; fetchedAt: number } | null = null;
let inflight: Promise<PharosGradesPayload> | null = null;
let backoffUntil = 0;

async function getPayload(apiKey: string): Promise<PharosGradesPayload> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload;
  }
  if (Date.now() < backoffUntil) {
    if (cached) return cached.payload;
    throw new Error("Pharos upstream in backoff window");
  }
  if (!inflight) {
    inflight = buildPayload(apiKey)
      .then(payload => {
        cached = { payload, fetchedAt: Date.now() };
        return payload;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch (error) {
    backoffUntil = Date.now() + (error instanceof PharosRateLimitError ? error.retryAfterMs : 60_000);
    console.error("[pharos/grades] upstream refresh failed:", error);
    if (cached) return cached.payload; // serve stale rather than blanking badges
    throw error;
  }
}

export async function GET() {
  const apiKey = process.env.PHAROS_API_KEY;
  if (!apiKey) {
    console.warn("[pharos/grades] PHAROS_API_KEY not set — serving empty grade map");
    return NextResponse.json(EMPTY);
  }

  try {
    const payload = await getPayload(apiKey);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
