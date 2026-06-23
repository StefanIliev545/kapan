/**
 * Shared config for the programmatic /rates pages (leaf + chain index + root index + sitemap).
 * Single source of truth so the route tree, internal links, and sitemap never drift.
 */
import { CHAIN_ID_TO_NETWORK } from "~~/utils/protocolRates";
import type { RatesProtocol } from "~~/utils/server/protocolRates.server";

export const SITE_URL = "https://kapan.finance";

export const CHAIN_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
  optimism: "Optimism",
  linea: "Linea",
};

export interface RatesChain {
  chainId: number;
  slug: string;
  label: string;
}

/** Chains we generate rate pages for — exactly those with a markets network slug. */
export const RATES_CHAINS: RatesChain[] = Object.entries(CHAIN_ID_TO_NETWORK).map(([id, slug]) => ({
  chainId: Number(id),
  slug,
  label: CHAIN_LABELS[slug] ?? slug,
}));

export const SLUG_TO_CHAIN_ID: Record<string, number> = Object.fromEntries(
  RATES_CHAINS.map(c => [c.slug, c.chainId]),
);

export interface RatesToken {
  /** URL slug (lowercase). Must equal canonicalizeTokenName(symbol).toLowerCase(). */
  slug: string;
  /** Display label with proper casing. */
  label: string;
}

/** Curated token allowlist driving generated pages — keeps crawl budget on real demand. */
export const RATES_TOKENS: RatesToken[] = [
  { slug: "usdc", label: "USDC" },
  { slug: "usdt", label: "USDT" },
  { slug: "dai", label: "DAI" },
  { slug: "eth", label: "ETH" },
  { slug: "wbtc", label: "WBTC" },
  { slug: "wsteth", label: "wstETH" },
  { slug: "weeth", label: "weETH" },
  { slug: "usde", label: "USDe" },
  { slug: "gho", label: "GHO" },
];

const RATES_TOKEN_SLUGS = new Set(RATES_TOKENS.map(t => t.slug));

export const PROTOCOL_LABELS: Record<RatesProtocol, string> = {
  aave: "Aave V3",
  spark: "Spark",
  compound: "Compound V3",
  venus: "Venus",
};

export const isValidChainSlug = (slug: string): boolean => slug in SLUG_TO_CHAIN_ID;
export const isValidTokenSlug = (slug: string): boolean => RATES_TOKEN_SLUGS.has(slug.toLowerCase());
export const tokenLabel = (slug: string): string =>
  RATES_TOKENS.find(t => t.slug === slug.toLowerCase())?.label ?? slug.toUpperCase();

export const fmtPct = (n: number): string => `${n.toFixed(2)}%`;
