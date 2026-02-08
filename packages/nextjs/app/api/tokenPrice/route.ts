// app/api/tokenPrice/route.ts
import { NextRequest } from "next/server";

const CG = "https://api.coingecko.com/api/v3";

const ethLikeRe = /\b(w?eth|steth|reth|cbeth|aeth|beth)\b/i;
const usdLikeRe = /\busd\b|usdc|usdt|tusd|susd|fdusd|usde|usdd/i;

type ResolvedCoin = { symbol: string; id: string | null };

// Map EVM chain IDs to CoinGecko platform identifiers
const CHAIN_TO_PLATFORM: Record<number, string> = {
  1: "ethereum",
  42161: "arbitrum-one",
  8453: "base",
  10: "optimistic-ethereum",
  59144: "linea",
  56: "binance-smart-chain",
};

// ── In-memory price cache ──────────────────────────────────────────
// Survives CoinGecko outages by serving stale data when the API is
// rate-limited or down. Keyed per-address ("platform:addr") for maximum
// cache-hit rate and independence from request batching.
const _addressPriceCache = new Map<string, { price: number; ts: number }>();
const STALE_CACHE_TTL = 10 * 60 * 1000; // 10 min — max age for stale fallback

/**
 * Fetch the USD price for a single token contract address on a specific chain.
 * CoinGecko free tier limits to 1 contract address per request.
 * On failure, returns stale cached data if available (never throws).
 */
const fetchSingleAddressPrice = async (
  platformId: string,
  addr: string,
  vs: string,
): Promise<number | null> => {
  const lower = addr.toLowerCase();
  const cacheKey = `${platformId}:${lower}`;
  const url = `${CG}/simple/token_price/${platformId}?contract_addresses=${lower}&vs_currencies=${vs}`;

  try {
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);

    const j = await r.json();
    const v = j?.[lower]?.[vs];
    if (typeof v === "number") {
      _addressPriceCache.set(cacheKey, { price: v, ts: Date.now() });
      return v;
    }
    return null;
  } catch {
    // CoinGecko down/rate-limited — serve stale cached data if available
    const cached = _addressPriceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < STALE_CACHE_TTL) {
      return cached.price;
    }
    return null;
  }
};

/**
 * Fetch USD prices for multiple token contract addresses on a specific chain.
 * Sends individual requests per address (CoinGecko free tier: 1 addr/request).
 * Results are merged and per-address cached for stale fallback.
 */
const fetchPricesByAddress = async (
  platformId: string,
  addresses: string[],
  vs: string,
): Promise<Record<string, number>> => {
  if (addresses.length === 0) return {};

  const lowerAddresses = addresses.map(a => a.toLowerCase());

  // Separate addresses into cached (fresh) vs needs-fetch
  const prices: Record<string, number> = {};
  const toFetch: string[] = [];
  const now = Date.now();

  for (const addr of lowerAddresses) {
    const cached = _addressPriceCache.get(`${platformId}:${addr}`);
    if (cached && now - cached.ts < 60_000) {
      // Fresh cache hit (< 60s) — skip the network call
      prices[addr] = cached.price;
    } else {
      toFetch.push(addr);
    }
  }

  if (toFetch.length > 0) {
    // Fetch uncached addresses in parallel
    const results = await Promise.all(
      toFetch.map(addr => fetchSingleAddressPrice(platformId, addr, vs)),
    );
    for (let i = 0; i < toFetch.length; i++) {
      if (results[i] !== null) {
        prices[toFetch[i]] = results[i]!;
      }
    }
  }

  return prices;
};

const fetchPriceForIds = async (ids: string[], vs: string) => {
  if (ids.length === 0) return {} as Record<string, number>;

  const url = `${CG}/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=${vs}`;
  const r = await fetch(url, { next: { revalidate: 60 } });
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
    next: { revalidate: 120 },
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

  // Contract address mode: ?chainId=42161&addresses=0x...,0x...
  // Preferred mode — no symbol ambiguity, individual per-address CoinGecko calls
  const chainIdParam = searchParams.get("chainId");
  const addressesParam = searchParams.get("addresses") || "";
  const addresses = addressesParam.split(",").map(s => s.trim()).filter(Boolean);

  if (chainIdParam && addresses.length > 0) {
    const chainId = Number(chainIdParam);
    const platformId = CHAIN_TO_PLATFORM[chainId];
    if (!platformId) {
      return Response.json({ prices: {} }, { status: 200 });
    }
    // fetchPricesByAddress handles errors internally (returns stale cache on failure)
    const prices = await fetchPricesByAddress(platformId, addresses, vs);
    return Response.json({ prices }, { status: 200 });
  }

  if (!symbol && symbols.length === 0) return Response.json({ price: 0 }, { status: 400 });

  // Batch symbol mode: ?symbols=eth,usdc (legacy — prefer address mode)
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