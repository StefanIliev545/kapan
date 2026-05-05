#!/usr/bin/env node
// Quick probe: read MYT.convertToAssets(1e18) at the latest block AND a recent block,
// see what we actually get back.  Helps debug why the API route returns 0% APY.
//
// Usage:
//   node scripts/probe-alchemix-myt-rate.mjs
//   ALCHEMY_KEY=... node scripts/probe-alchemix-myt-rate.mjs

import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";

const MARKETS = [
  { id: "alUSD", myt: "0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651" },
  { id: "alETH", myt: "0xfe8F223F3d81462F55bf8609897B8cEcfA4B195C" },
];

const ABI = [
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const WINDOWS = [
  ["7d", 7 * 86400],
  ["3d", 3 * 86400],
  ["1d", 1 * 86400],
  ["12h", 12 * 3600],
  ["6h", 6 * 3600],
  ["1h", 1 * 3600],
];

const client = createPublicClient({
  chain: arbitrum,
  transport: http(
    process.env.ALCHEMY_KEY
      ? `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
      : "https://arb1.arbitrum.io/rpc",
  ),
});

const ONE = 10n ** 18n;

const latest = await client.getBlock({ blockTag: "latest" });
const latestNumber = latest.number;
const latestTs = Number(latest.timestamp);
console.log(`latest block ${latestNumber} (ts ${latestTs} = ${new Date(latestTs * 1000).toISOString()})`);

for (const m of MARKETS) {
  console.log(`\n--- ${m.id} (${m.myt}) ---`);
  let currentAssets;
  try {
    currentAssets = await client.readContract({
      address: m.myt,
      abi: ABI,
      functionName: "convertToAssets",
      args: [ONE],
      blockNumber: latestNumber,
    });
    console.log(`  current convertToAssets(1e18) = ${currentAssets} (= ${Number(currentAssets) / 1e18} underlying per share)`);
  } catch (e) {
    console.log(`  current convertToAssets reverted: ${e.shortMessage ?? e.message}`);
    continue;
  }

  for (const [label, sec] of WINDOWS) {
    const back = BigInt(sec * 4);
    const past = latestNumber > back ? latestNumber - back : 1n;
    let pastBlock;
    try {
      pastBlock = await client.getBlock({ blockNumber: past });
    } catch (e) {
      console.log(`  [${label}] block ${past} not retrievable: ${e.shortMessage ?? e.message}`);
      continue;
    }
    const pastTs = Number(pastBlock.timestamp);
    const actualSec = latestTs - pastTs;
    let pastAssets;
    try {
      pastAssets = await client.readContract({
        address: m.myt,
        abi: ABI,
        functionName: "convertToAssets",
        args: [ONE],
        blockNumber: past,
      });
    } catch (e) {
      console.log(`  [${label}] past convertToAssets at block ${past} reverted: ${e.shortMessage ?? e.message}`);
      continue;
    }

    const cur = Number(currentAssets);
    const p = Number(pastAssets);
    if (p <= 0 || cur <= 0) {
      console.log(`  [${label}] degenerate: cur=${cur} past=${p}`);
      continue;
    }
    const ratio = cur / p;
    const apy = (Math.pow(ratio, SECONDS_PER_YEAR / actualSec) - 1) * 100;
    console.log(
      `  [${label}] block ${past} (window=${actualSec}s = ${(actualSec / 3600).toFixed(1)}h): ` +
        `pastAssets=${pastAssets}, ratio=${ratio.toFixed(8)}, APY=${apy.toFixed(3)}%`,
    );
  }
}
