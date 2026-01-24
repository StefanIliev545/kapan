import { describe, it, expect } from "vitest";

// This test fetches real data from Pendle API to see what symbols are available
// Run with: npx vitest run hooks/__tests__/pendleApi.test.ts

const PENDLE_API = "https://api-v2.pendle.finance/core/v1";
const CHAINS = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};

async function fetchPendleMarketsPage(chainId: number, skip: number, limit: number) {
  const response = await fetch(
    `${PENDLE_API}/${chainId}/markets?order_by=name%3A1&skip=${skip}&limit=${limit}`,
    { headers: { Accept: "application/json" } }
  );
  if (!response.ok) return [];
  const data = await response.json();
  return data.results || data || [];
}

async function fetchPendleMarkets(chainId: number) {
  const allMarkets: any[] = [];
  const pageSize = 100;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchPendleMarketsPage(chainId, skip, pageSize);
    allMarkets.push(...page);
    if (page.length < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
      if (skip > 1000) hasMore = false;
    }
  }

  return allMarkets;
}

describe("Pendle API - Real Data", () => {
  it("fetches Ethereum markets and lists PT symbols", async () => {
    const markets = await fetchPendleMarkets(CHAINS.ethereum);
    const ptSymbols = markets
      .filter((m: any) => m.pt?.symbol)
      .map((m: any) => m.pt.symbol);

    console.log(`\n[Ethereum] ${ptSymbols.length} PT tokens:`);
    ptSymbols.forEach((s: string) => console.log(`  - ${s}`));

    expect(markets.length).toBeGreaterThan(0);
  });

  it("fetches Arbitrum markets and lists PT symbols", async () => {
    const markets = await fetchPendleMarkets(CHAINS.arbitrum);
    const ptSymbols = markets
      .filter((m: any) => m.pt?.symbol)
      .map((m: any) => m.pt.symbol);

    console.log(`\n[Arbitrum] ${ptSymbols.length} PT tokens:`);
    ptSymbols.forEach((s: string) => console.log(`  - ${s}`));

    // Check if reUSD is in Arbitrum
    const hasReUSD = ptSymbols.some((s: string) =>
      s.toLowerCase().includes("reusd")
    );
    console.log(`\n[Arbitrum] Has reUSD: ${hasReUSD}`);

    expect(markets.length).toBeGreaterThan(0);
  });

  it("fetches all chains and searches for reUSD", async () => {
    const allSymbols: string[] = [];

    for (const [name, chainId] of Object.entries(CHAINS)) {
      const markets = await fetchPendleMarkets(chainId);
      const ptSymbols = markets
        .filter((m: any) => m.pt?.symbol)
        .map((m: any) => m.pt.symbol);

      console.log(`\n[${name}] ${ptSymbols.length} PT tokens`);
      allSymbols.push(...ptSymbols);
    }

    // Search for reUSD across all chains
    const reUSDMatches = allSymbols.filter((s: string) =>
      s.toLowerCase().includes("reusd") ||
      s.toLowerCase().includes("re-usd") ||
      s.toLowerCase().includes("reunified")
    );

    console.log(`\n=== reUSD matches across all chains ===`);
    if (reUSDMatches.length > 0) {
      reUSDMatches.forEach(s => console.log(`  - ${s}`));
    } else {
      console.log("  No reUSD tokens found!");
      console.log("\n  All symbols containing 'usd':");
      allSymbols
        .filter(s => s.toLowerCase().includes("usd"))
        .forEach(s => console.log(`    - ${s}`));
    }

    expect(allSymbols.length).toBeGreaterThan(0);
  });
});
