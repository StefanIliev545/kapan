import { encodeAbiParameters } from "viem";

/**
 * Frontend mirror of the AlchemixGatewayWrite on-chain market registry.
 *
 * The gateway stores `(alchemist, myt, underlying, debtToken, positionNft)` per `marketId`.
 * This object is the source of truth the frontend uses to:
 *   1. enumerate user positions per market (NFT lookup → CDP fetch)
 *   2. encode the `context` blob the router passes to the gateway: `(marketId, tokenId)`
 *
 * `marketId` here MUST match the on-chain registration order in
 * `packages/hardhat/deploy/v2/20_deploy_alchemix_gateway.ts`. Both markets are registered
 * in the same deploy run, so they get sequential ids starting at 1.
 */

export interface AlchemixMarket {
  id: string;
  /** 1-indexed market id assigned by `registerMarket` on the gateway. */
  marketId: number;
  name: string;
  alchemist: `0x${string}`;
  myt: `0x${string}`;
  underlying: `0x${string}`;
  underlyingSymbol: string;
  underlyingDecimals: number;
  debtToken: `0x${string}`;
  debtSymbol: string;
  debtDecimals: number;
  positionNft: `0x${string}`;
}

export const ALCHEMIX_MARKETS: Record<number, AlchemixMarket[]> = {
  // Arbitrum One
  42161: [
    {
      id: "arb-alusd",
      marketId: 1,
      name: "alUSD / mixUSDC",
      alchemist: "0x930750a3510E703535e943E826ABa3c364fFC1De",
      myt: "0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651",
      underlying: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      underlyingSymbol: "USDC",
      underlyingDecimals: 6,
      debtToken: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
      debtSymbol: "alUSD",
      debtDecimals: 18,
      positionNft: "0x4bd4Faad509c4Bc5BA6D68A15C8b1b54A10288B4",
    },
    {
      id: "arb-aleth",
      marketId: 2,
      name: "alETH / mixWETH",
      alchemist: "0xDeD3A04612FF12b57317abE38e68026Fc9D28114",
      myt: "0xfe8F223F3d81462F55bf8609897B8cEcfA4B195C",
      underlying: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      underlyingSymbol: "WETH",
      underlyingDecimals: 18,
      debtToken: "0x17573150d67d820542EFb24210371545a4868B03",
      debtSymbol: "alETH",
      debtDecimals: 18,
      positionNft: "0x763F5d567403add750e13234DB896CFe6b423059",
    },
  ],
};

export function getAlchemixMarkets(chainId: number): AlchemixMarket[] {
  return ALCHEMIX_MARKETS[chainId] ?? [];
}

export function getAlchemixMarket(chainId: number, marketId: number): AlchemixMarket | undefined {
  return getAlchemixMarkets(chainId).find(m => m.marketId === marketId);
}

export function isAlchemixSupported(chainId: number): boolean {
  return getAlchemixMarkets(chainId).length > 0;
}

/** Encode the AlchemixGatewayWrite context: `(marketId, tokenId)`. Mirrors `_decodeContext`. */
export function encodeAlchemixContext(marketId: number | bigint, tokenId: bigint): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: "marketId", type: "uint256" },
      { name: "tokenId", type: "uint256" },
    ],
    [BigInt(marketId), tokenId],
  );
}
