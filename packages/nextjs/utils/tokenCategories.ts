/**
 * Token-type categories used for market filtering (ETH-like / BTC-like / stables / Pendle PT).
 *
 * Extracted from MorphoMarketsSection so the markets page and per-protocol sections share one
 * source of truth. Matching is substring-based on the token symbol (lowercased).
 */
export type TokenCategory = "all" | "eth" | "btc" | "stables" | "pt";

export const TOKEN_CATEGORIES: Record<TokenCategory, { label: string; patterns: string[] }> = {
  all: { label: "All", patterns: [] },
  eth: {
    label: "ETH",
    patterns: ["eth", "weth", "steth", "wsteth", "cbeth", "reth", "weeth", "ezeth", "rseth", "meth", "oeth", "sweth", "sfrxeth", "frxeth", "eeth", "lseth", "bsdeth"],
  },
  btc: { label: "BTC", patterns: ["btc", "wbtc", "cbbtc", "lbtc", "tbtc", "sbtc", "renbtc", "hbtc"] },
  stables: {
    label: "Stables",
    patterns: ["usdc", "usdt", "dai", "usde", "frax", "lusd", "gusd", "tusd", "usdp", "susd", "mim", "eurc", "eur", "cusd", "pyusd", "gho", "dola", "usd", "aprusr", "cusdo"],
  },
  pt: { label: "PT", patterns: ["pt-"] },
};

export const TOKEN_CATEGORY_ORDER: TokenCategory[] = ["all", "stables", "eth", "btc", "pt"];

/** True if a token symbol belongs to a category (always true for "all"). */
export function matchesCategory(symbol: string, category: TokenCategory): boolean {
  if (category === "all") return true;
  const lowerSymbol = symbol.toLowerCase();
  return TOKEN_CATEGORIES[category].patterns.some(pattern => lowerSymbol.includes(pattern));
}
