/**
 * Pharos stablecoin safety grades — client fetch + symbol resolution.
 *
 * Data flows from app/api/pharos/grades/route.ts (server-side proxy that holds
 * the PHAROS_API_KEY) into a single react-query cache entry shared by every
 * PharosGradeBadge on the page. PT (Pendle) tokens resolve to their underlying
 * stablecoin's grade — a PT carries the credit risk of what it redeems into.
 */
import { useQuery } from "@tanstack/react-query";
import type { PharosGradeEntry, PharosGradesPayload } from "~~/app/api/pharos/grades/route";
import { parsePTToken } from "~~/hooks/usePendlePTYields";
import { qk } from "~~/lib/queryKeys";

export type { PharosGradeEntry, PharosGradesPayload };

/**
 * Where a grade badge links out to — the coin's Pharos report page.
 * UTM-tagged (and the badge link keeps its Referer) so Pharos can attribute
 * the traffic we send them.
 */
export const pharosStablecoinUrl = (id: string) =>
  `https://pharos.watch/stablecoin/${id}/?utm_source=kapan.finance&utm_medium=grade-badge`;

/**
 * Wrapped/bridged variants that inherit the canonical coin's grade.
 * Deliberately short — only aliases where the peg/issuer risk is identical.
 */
const SYMBOL_ALIASES: Record<string, string> = {
  "USDC.E": "USDC", // bridged USDC
  USDT0: "USDT", // LayerZero OFT USDT
  "USD₮0": "USDT",
  "USD₮": "USDT",
};

/**
 * Canonical address key: lowercase, leading zeros stripped (Starknet felts are
 * zero-padded differently across sources). Mirror of the helper in
 * app/api/pharos/grades/route.ts — keep in sync.
 */
const addressKey = (address: string) => `0x${address.toLowerCase().replace(/^0x0*/, "")}`;

export interface ResolvedPharosGrade extends PharosGradeEntry {
  /** The symbol the grade was found under (for PT tokens: the underlying) */
  resolvedSymbol: string;
  /** True when this came from a PT token's underlying asset */
  viaPtUnderlying: boolean;
}

/**
 * Resolve a display symbol (as rendered in markets/positions rows) to a Pharos
 * grade entry. The token's contract address, when the caller has one, is the
 * exact match (disambiguates duplicate tickers like reUSD/USD3); otherwise we
 * fall back to the symbol map, handling PT tokens ("PT-sUSDE-25SEP2025" ->
 * "SUSDE") and the alias map above. Returns null for anything Pharos doesn't
 * grade — callers render nothing in that case.
 */
export function resolvePharosGrade(
  data: PharosGradesPayload | undefined,
  symbol: string,
  address?: string,
): ResolvedPharosGrade | null {
  if (!data || !symbol) return null;

  const parsed = parsePTToken(symbol);
  const viaPtUnderlying = parsed.isPT;
  const base = parsed.isPT ? parsed.baseToken : symbol;

  const upper = base.replace("₮", "T").trim().toUpperCase();
  const resolvedSymbol = SYMBOL_ALIASES[upper] ?? upper;

  // PT addresses are the PT contract itself (not tracked by Pharos), so the
  // address path only applies to regular tokens.
  if (!parsed.isPT && address) {
    const byAddress = data.byAddress?.[addressKey(address)];
    if (byAddress) return { ...byAddress, resolvedSymbol, viaPtUnderlying: false };
  }

  const entry = data.grades[resolvedSymbol];
  return entry ? { ...entry, resolvedSymbol, viaPtUnderlying } : null;
}

async function fetchPharosGrades(): Promise<PharosGradesPayload> {
  const response = await fetch("/api/pharos/grades");
  if (!response.ok) {
    console.error(`[pharos/gradesApi] grades API error: ${response.status}`);
    return { updatedAt: null, grades: {}, byAddress: {} };
  }
  return response.json();
}

/** One hour — the server route itself only refreshes upstream hourly. */
const GRADES_STALE_TIME = 60 * 60 * 1000;

/**
 * Global Pharos grade map. Mounted by every badge; react-query dedupes to a
 * single request per page load.
 */
export function usePharosGrades() {
  return useQuery({
    queryKey: qk.pharos.grades(),
    queryFn: fetchPharosGrades,
    staleTime: GRADES_STALE_TIME,
    gcTime: GRADES_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}
