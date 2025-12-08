// app/api/tokenPrice/route.ts
import { NextRequest } from "next/server";

const CG = "https://api.coingecko.com/api/v3";

const ethLikeRe = /\b(w?eth|steth|reth|cbeth|aeth|beth)\b/i;
const usdLikeRe = /\busd\b|usdc|usdt|tusd|susd|fdusd|usde|usdd/i;

type ResolvedCoin = { symbol: string; id: string | null };

const fetchPriceForIds = async (ids: string[], vs: string) => {
  if (ids.length === 0) return {} as Record<string, number>;

  const url = `${CG}/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=${vs}`;
  const r = await fetch(url, { next: { revalidate: 15 } });
  if (!r.ok) return {} as Record<string, number>;

  const j = await r.json();
  const prices: Record<string, number> = {};
  ids.forEach(id => {
    const v = j?.[id]?.[vs];
    if (typeof v === "number") prices[id] = v;
  });
  return prices;
};

const resolveCoinGeckoId = async (symbol: string): Promise<string | null> => {
  const searchRes = await fetch(`${CG}/search?query=${encodeURIComponent(symbol)}`, {
    next: { revalidate: 30 },
  });

  if (!searchRes.ok) return null;

  const searchJson = await searchRes.json();
  const coins: Array<{ id: string; symbol: string; market_cap_rank: number | null }> = searchJson?.coins || [];

  const symLower = symbol.toLowerCase();
  const exact = coins.filter(c => (c.symbol || "").toLowerCase() === symLower);
  const pool = exact.length ? exact : coins;

  if (!pool.length) return null;

  pool.sort((a, b) => {
    const ar = a.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    const br = b.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    return ar - br;
  });

  return pool[0].id || null;
};

const fallbackIdForSymbol = (symbol: string): string | null => {
  if (ethLikeRe.test(symbol)) return "ethereum";
  if (usdLikeRe.test(symbol)) return "usd-coin";
  return null;
};

const resolvePricesForSymbols = async (symbols: string[], vs: string) => {
  const uniqueSymbols = Array.from(new Set(symbols.map(s => s.trim()).filter(Boolean)));
  if (uniqueSymbols.length === 0) return {} as Record<string, number>;

  // Note: This makes concurrent API calls to CoinGecko for each symbol.
  // For large batches, consider implementing rate limiting or batching to avoid
  // hitting API rate limits. CoinGecko's free tier has strict rate limits.
  const resolutions: ResolvedCoin[] = await Promise.all(
    uniqueSymbols.map(async s => ({ symbol: s.toLowerCase(), id: await resolveCoinGeckoId(s) })),
  );

  const fallbackIds = uniqueSymbols
    .map(fallbackIdForSymbol)
    .filter((id): id is string => !!id);
  const ids = Array.from(new Set([...resolutions.map(r => r.id).filter(Boolean), ...fallbackIds] as string[]));
  const pricesById = await fetchPriceForIds(ids, vs);

  const prices: Record<string, number> = {};

  for (const res of resolutions) {
    const fallbackId = fallbackIdForSymbol(res.symbol);
    const priceFromId = res.id ? pricesById[res.id] : undefined;
    const priceFromFallback = fallbackId ? pricesById[fallbackId] : undefined;

    const price = priceFromId ?? priceFromFallback ?? 0;
    prices[res.symbol] = price;
  }

  return prices;
};

const resolvePriceForSymbol = async (symbol: string, vs: string): Promise<number> => {
  const prices = await resolvePricesForSymbols([symbol], vs);
  return prices[symbol.toLowerCase()] ?? 0;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vs = (searchParams.get("vs") || "usd").toLowerCase();
  const symbolRaw = searchParams.get("symbol") || "";
  const symbol = symbolRaw.trim();
  const symbolsParam = searchParams.get("symbols") || "";
  const symbols = symbolsParam
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (!symbol && symbols.length === 0) return Response.json({ price: 0 }, { status: 400 });

  // Batch mode: ?symbols=eth,usdc
  if (symbols.length > 0) {
    try {
      const prices = await resolvePricesForSymbols(symbols, vs);
      return Response.json({ prices }, { status: 200 });
    } catch {
      return Response.json({ prices: {} }, { status: 200 });
    }
  }

  try {
    const price = await resolvePriceForSymbol(symbol, vs);
    return Response.json({ price: price || 0 }, { status: 200 });
  } catch {
    return Response.json({ price: 0 }, { status: 200 });
  }
}