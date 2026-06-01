import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, Address, Chain } from "viem";
import { arbitrum } from "viem/chains";
import { getAlchemixMarkets } from "~~/utils/alchemix/markets";
import scaffoldConfig from "~~/scaffold.config";

/**
 * Server-side computation of MYT (Morpho V2 Vault) yield for each Alchemix market on a chain.
 *
 * Method
 * ------
 * The MYT is ERC4626. Its share-price grows monotonically with strategy yield, so we sample
 * `convertToAssets(1e18)` at TWO block heights — the latest finalized block, and a block
 * approximately 7 days ago — and back out the realized APY:
 *
 *   APY = (currentAssets / pastAssets)^(SECONDS_PER_YEAR / actualSeconds) − 1
 *
 * This is real on-chain data, no third-party API dependency. Falls back to a per-market
 * estimate if either read fails (vault deployed < 7 days ago, RPC error, etc.).
 *
 * Cache: 5 min via Next.js route segment config below — APYs don't change minute-to-minute.
 */

// Cache server-side for 60s during the early-launch period when vault rates are still
// settling. Bump back up to 300s once the data stabilizes.
export const revalidate = 60;

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/**
 * Sample windows tried in order from longest to shortest. Alchemix V3 just launched, so the
 * MYTs are days-old at most — a 7-day window will revert at the past block before the contract
 * exists. We progressively shorten until we find a window that lands inside the vault's deploy
 * history. Anything ≥ 1 hour gives meaningful APY math; below that the noise dominates.
 */
const SAMPLE_WINDOW_SECONDS_LIST = [
  7 * 24 * 60 * 60,
  3 * 24 * 60 * 60,
  1 * 24 * 60 * 60,
  12 * 60 * 60,
  6 * 60 * 60,
  1 * 60 * 60,
] as const;

// Build per-chain RPC URLs that hit Alchemy's archive endpoint via the project's existing key.
// Falls back to the public RPC if the env var (or default key from scaffold.config) is missing,
// at which point historical reads >= a few hours back will revert and APY samples will fail open.
const ALCHEMY_KEY = scaffoldConfig.alchemyApiKey;
const CHAIN_CONFIG: Record<number, { chain: Chain; rpcUrl?: string }> = {
  42161: {
    chain: arbitrum,
    rpcUrl: ALCHEMY_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined,
  },
};

const ERC4626_ABI = [
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface VaultYield {
  vaultAddress: string;
  netApyPct: number;
  totalAssets: string | null;
  windowSeconds?: number;
}

type VaultYieldMap = Record<string, VaultYield>;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ chainId: string }> }) {
  const { chainId: chainIdRaw } = await ctx.params;
  const chainId = Number(chainIdRaw);

  const chainConfig = CHAIN_CONFIG[chainId];
  const markets = getAlchemixMarkets(chainId);
  if (!chainConfig || markets.length === 0) {
    return NextResponse.json({ yields: {} satisfies VaultYieldMap });
  }

  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl),
  });

  // Markets only land in `map` when the on-chain rate sample succeeds. Anything missing from
  // the response will surface as 0% in the UI — honest "no data" rather than a guessed number.
  const map: VaultYieldMap = {};

  try {
    const latestBlock = await client.getBlock({ blockTag: "latest" });
    const latestNumber = latestBlock.number;
    const latestTimestamp = Number(latestBlock.timestamp);
    const ONE_SHARE = 10n ** 18n;

    // Read current share-price once per market (independent of past-block sampling). If even
    // the current read reverts, the address isn't a vault we can read — fail open.
    const currentAssetsByMarketId = await Promise.all(
      markets.map(async m => {
        try {
          return await client.readContract({
            address: m.myt as Address,
            abi: ERC4626_ABI,
            functionName: "convertToAssets",
            args: [ONE_SHARE],
            blockNumber: latestNumber,
          });
        } catch {
          return null;
        }
      }),
    );

    // Try sample windows from longest to shortest. The first window where BOTH the past block
    // exists AND the per-market `convertToAssets` reads succeed is what we use. We bail out of
    // the inner loop as soon as we have valid past-readings for every market that had a current
    // reading. This is N markets × W windows worth of RPC calls in the worst case (rare).
    for (const windowSec of SAMPLE_WINDOW_SECONDS_LIST) {
      // Conservative back-walk assuming Arbitrum @ ~4 blocks/sec — actual delta is verified via
      // the past block's timestamp before computing APY.
      const blocksToWalkBack = BigInt(windowSec * 4);
      const pastNumber = latestNumber > blocksToWalkBack ? latestNumber - blocksToWalkBack : 1n;

      let pastTimestamp: number;
      try {
        const pastBlock = await client.getBlock({ blockNumber: pastNumber });
        pastTimestamp = Number(pastBlock.timestamp);
      } catch {
        continue; // past block doesn't exist (very early chain history) — try a shorter window
      }

      const actualWindowSeconds = latestTimestamp - pastTimestamp;
      if (actualWindowSeconds <= 0) continue;

      let allMarketsResolved = true;
      await Promise.all(
        markets.map(async (m, i) => {
          // Skip markets we've already filled in a longer window pass.
          if (map[m.myt.toLowerCase()]) return;

          const currentAssets = currentAssetsByMarketId[i];
          if (currentAssets === null) {
            allMarketsResolved = false;
            return; // current read failed, can't compute APY at all
          }

          let pastAssets: bigint;
          try {
            pastAssets = await client.readContract({
              address: m.myt as Address,
              abi: ERC4626_ABI,
              functionName: "convertToAssets",
              args: [ONE_SHARE],
              blockNumber: pastNumber,
            });
          } catch {
            allMarketsResolved = false; // vault not deployed at past block — try shorter window
            return;
          }

          const cur = Number(currentAssets);
          const past = Number(pastAssets);
          if (past <= 0 || cur <= 0 || cur < past) {
            // Vault was deployed but rate hasn't moved (or moved backward — possible during a
            // strategy rebalance settlement). Skip this window and try a shorter one.
            allMarketsResolved = false;
            return;
          }

          const ratio = cur / past;
          const annualized = Math.pow(ratio, SECONDS_PER_YEAR / actualWindowSeconds) - 1;
          const apyPct = annualized * 100;

          if (apyPct < 0.01 || apyPct > 200) {
            allMarketsResolved = false;
            return;
          }

          map[m.myt.toLowerCase()] = {
            vaultAddress: m.myt.toLowerCase(),
            netApyPct: apyPct,
            totalAssets: currentAssets.toString(),
            windowSeconds: actualWindowSeconds,
          };
        }),
      );

      if (allMarketsResolved) break;
    }
  } catch (err) {
    console.warn(`[alchemix/vault-yields] block resolution failed for chain ${chainId}:`, err);
  }

  return NextResponse.json({ yields: map });
}
