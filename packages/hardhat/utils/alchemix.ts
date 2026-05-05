/**
 * Alchemix V3 on-chain address registry (Hardhat side).
 *
 * Mirrored shape lives at `packages/nextjs/utils/alchemix/markets.ts` for the frontend.
 * Keep the two in sync when adding markets — the AlchemixGatewayWrite contract has no
 * knowledge of these addresses; they are passed at call time via `context`.
 *
 * Each entry is one (alchemist, debtToken, underlying) tuple. The MYT (yieldToken) is
 * an ERC4626 vault that wraps the underlying. The position NFT (`positionNft`) is per
 * alchemist — different markets do NOT share an NFT contract.
 */

export interface AlchemixMarket {
  /** Stable identifier — used for logging, frontend keys, and cross-package matching. */
  id: string;
  /** Human-readable label for UI / logs. */
  name: string;
  /** AlchemistV3 instance (one per debt-token market). */
  alchemist: `0x${string}`;
  /** ERC4626 Meta-Yield Token wrapping the underlying. */
  myt: `0x${string}`;
  /** Raw underlying ERC20 — what users actually deposit. */
  underlying: `0x${string}`;
  underlyingSymbol: string;
  underlyingDecimals: number;
  /** Synthetic debt token (alAsset). */
  debtToken: `0x${string}`;
  debtSymbol: string;
  debtDecimals: number;
  /** ERC721 position token — `alchemist.alchemistPositionNFT()`. Cached here for off-chain enumeration. */
  positionNft: `0x${string}`;
  /** Transmuter address — informational; not called by the gateway. */
  transmuter: `0x${string}`;
}

/** chainId → markets */
export const ALCHEMIX_MARKETS: Record<number, AlchemixMarket[]> = {
  // Arbitrum One
  42161: [
    {
      id: "arb-alusd",
      name: "alUSD (mixUSDC)",
      alchemist: "0x930750a3510E703535e943E826ABa3c364fFC1De",
      myt: "0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651",
      underlying: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC native
      underlyingSymbol: "USDC",
      underlyingDecimals: 6,
      debtToken: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
      debtSymbol: "alUSD",
      debtDecimals: 18,
      positionNft: "0x4bd4Faad509c4Bc5BA6D68A15C8b1b54A10288B4",
      transmuter: "0x693b7594Ae0633d9c5574D0da46a040f92F5b281", // Aave V3 USDC adaptor (per FE list)
    },
    {
      id: "arb-aleth",
      name: "alETH (mixWETH)",
      alchemist: "0xDeD3A04612FF12b57317abE38e68026Fc9D28114",
      myt: "0xDeD3A04612FF12b57317abE38e68026Fc9D28114", // mixWETH MYT (same as alchemist label per FE — verify on first run)
      underlying: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH on Arbitrum
      underlyingSymbol: "WETH",
      underlyingDecimals: 18,
      debtToken: "0xfe8F223F3d81462F55bf8609897B8cEcfA4B195C",
      debtSymbol: "alETH",
      debtDecimals: 18,
      positionNft: "0x5aa8e010912763d28a2019E3F0A89Ed194d60de2",
      transmuter: "0x17573150d67d820542EFb24210371545a4868B03",
    },
  ],
};

/** Returns the markets for a chain (resolving forked chainId), or `[]` if unsupported. */
export function getAlchemixMarkets(chainId: number): AlchemixMarket[] {
  return ALCHEMIX_MARKETS[chainId] ?? [];
}

/** Returns the chainIds that have Alchemix V3 markets defined. */
export function getAlchemixSupportedChainIds(): number[] {
  return Object.keys(ALCHEMIX_MARKETS)
    .map(Number)
    .filter(id => (ALCHEMIX_MARKETS[id]?.length ?? 0) > 0);
}

/**
 * Encode the AlchemixGatewayWrite `context` blob: (alchemist, myt, underlying, debtToken, tokenId).
 * This MUST match `AlchemixGatewayWrite._decodeContext`.
 *
 * Pass `tokenId == 0n` for fresh-position deposits; everything else requires an existing tokenId.
 */
export function encodeAlchemixContext(
  market: Pick<AlchemixMarket, "alchemist" | "myt" | "underlying" | "debtToken">,
  tokenId: bigint,
  abiCoderEncode: (types: string[], values: unknown[]) => string,
): string {
  return abiCoderEncode(
    ["address", "address", "address", "address", "uint256"],
    [market.alchemist, market.myt, market.underlying, market.debtToken, tokenId],
  );
}
