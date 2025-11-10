// app/api/tokenPrice/route.ts
import { NextRequest } from "next/server";

const CG = "https://api.coingecko.com/api/v3";

const ethLikeRe = /\b(w?eth|steth|reth|cbeth|aeth|beth)\b/i;
const usdLikeRe = /\busd\b|usdc|usdt|tusd|susd|fdusd|usde|usdd/i;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolRaw = searchParams.get("symbol") || "";
  const symbol = symbolRaw.trim();
  const vs = (searchParams.get("vs") || "usd").toLowerCase();

  if (!symbol) return Response.json({ price: 0 }, { status: 400 });

  try {
    // --- 1) Try to resolve the *specific token* by symbol first ---
    let resolvedId: string | null = null;

    // Search CoinGecko by symbol
    const searchRes = await fetch(`${CG}/search?query=${encodeURIComponent(symbol)}`, {
      next: { revalidate: 30 },
    });

    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const coins: Array<{ id: string; symbol: string; market_cap_rank: number | null }> =
        searchJson?.coins || [];

      const symLower = symbol.toLowerCase();
      const exact = coins.filter(c => (c.symbol || "").toLowerCase() === symLower);
      const pool = exact.length ? exact : coins;

      if (pool.length) {
        pool.sort((a, b) => {
          const ar = a.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
          const br = b.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
          return ar - br;
        });
        resolvedId = pool[0].id || null;
      }
    }

    // Try to fetch the *specific* token's price
    let price = 0;
    if (resolvedId) {
      const url = `${CG}/simple/price?ids=${encodeURIComponent(resolvedId)}&vs_currencies=${vs}`;
      const r = await fetch(url, { next: { revalidate: 15 } });
      if (r.ok) {
        const j = await r.json();
        const v = j?.[resolvedId]?.[vs];
        if (typeof v === "number") price = v;
      }
    }

    // --- 2) If specific token failed or returned 0 — regex fallback (no hard-coded otherwise) ---
    if (!price) {
      let fallbackId: string | null = null;
      if (ethLikeRe.test(symbol)) fallbackId = "ethereum";
      else if (usdLikeRe.test(symbol)) fallbackId = "usd-coin";

      if (fallbackId) {
        const url = `${CG}/simple/price?ids=${encodeURIComponent(fallbackId)}&vs_currencies=${vs}`;
        const r = await fetch(url, { next: { revalidate: 15 } });
        if (r.ok) {
          const j = await r.json();
          const v = j?.[fallbackId]?.[vs];
          if (typeof v === "number") price = v;
        }
      }
    }

    return Response.json({ price: price || 0 }, { status: 200 });
  } catch {
    return Response.json({ price: 0 }, { status: 200 });
  }
}