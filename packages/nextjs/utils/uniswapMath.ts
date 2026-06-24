/**
 * Shared Uniswap concentrated-liquidity math + position types, used by both the V3 and V4
 * readers (utils/uniswapV3.ts, utils/uniswapV4.ts). V3 and V4 differ only in plumbing — the
 * liquidity/amount/fee math is identical.
 *
 * Amount/price math is floating point (sqrtPrice ≈ 1.0001^(tick/2)) — display-precision,
 * accurate to well under a cent, NOT for on-chain accounting. Fee math is exact bigint
 * (mirrors the pool's feeGrowthInside computation, incl. uint256 wraparound).
 */

const Q96 = 2 ** 96;
const Q128 = 1n << 128n;
const Q256 = 1n << 256n;
const MASK_256 = Q256 - 1n;

/** Solidity-style uint256 subtraction with wraparound — feeGrowth accumulators rely on it. */
export const sub256 = (a: bigint, b: bigint): bigint => (a - b) & MASK_256;

/** sqrt(price) at a tick, as a float. Display-precision only. */
function sqrtRatioAtTick(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

/** price of token1 per token0 at a tick, decimal-adjusted. */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);
}

/** token0/token1 amounts (human units) at the current price — standard V3/V4 LiquidityAmounts formula. */
export function getTokenAmounts(
  liquidity: bigint, sqrtPriceX96: bigint, tickLower: number, tickUpper: number, decimals0: number, decimals1: number,
): { amount0: number; amount1: number } {
  const L = Number(liquidity);
  const sqrtCur = Number(sqrtPriceX96) / Q96;
  const sqrtA = sqrtRatioAtTick(tickLower);
  const sqrtB = sqrtRatioAtTick(tickUpper);
  let amount0 = 0;
  let amount1 = 0;
  if (sqrtCur <= sqrtA) {
    amount0 = L * (1 / sqrtA - 1 / sqrtB);
  } else if (sqrtCur >= sqrtB) {
    amount1 = L * (sqrtB - sqrtA);
  } else {
    amount0 = L * (1 / sqrtCur - 1 / sqrtB);
    amount1 = L * (sqrtCur - sqrtA);
  }
  return { amount0: amount0 / 10 ** decimals0, amount1: amount1 / 10 ** decimals1 };
}

/** Uncollected fee for one side (raw token units), mirroring the pool's feeGrowthInside math. */
export function uncollectedFee(
  feeGrowthGlobal: bigint, lowerOutside: bigint, upperOutside: bigint, feeGrowthInsideLast: bigint,
  tokensOwed: bigint, liquidity: bigint, currentTick: number, tickLower: number, tickUpper: number,
): bigint {
  const below = currentTick >= tickLower ? lowerOutside : sub256(feeGrowthGlobal, lowerOutside);
  const above = currentTick < tickUpper ? upperOutside : sub256(feeGrowthGlobal, upperOutside);
  const inside = sub256(sub256(feeGrowthGlobal, below), above);
  const delta = sub256(inside, feeGrowthInsideLast);
  return tokensOwed + (liquidity * delta) / Q128;
}

/** Sign-extend a 24-bit two's-complement value packed in a bigint (V4 PositionInfo tick fields). */
export function asInt24(v: bigint): number {
  const masked = v & 0xffffffn;
  return Number(masked >= 0x800000n ? masked - 0x1000000n : masked);
}

export interface UniToken {
  address: string;
  symbol: string;
  decimals: number;
  /** amount of this token currently in the position (human units) */
  amount: number;
  /** uncollected fees owed in this token (human units) */
  fees: number;
}

/** A unified Uniswap LP position (V3 or V4), resolved for display. */
export interface UniswapPosition {
  version: 3 | 4;
  chainId: number;
  tokenId: string;
  fee: number; // 500 / 3000 / 10000 …
  feePercent: number; // fee / 1e4
  token0: UniToken;
  token1: UniToken;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  /** token1-per-token0 prices at range bounds + current, decimal-adjusted */
  priceLower: number;
  priceUpper: number;
  priceCurrent: number;
  inRange: boolean;
  closed: boolean; // liquidity == 0 (fully withdrawn, may still hold fees)
  hooks?: string; // V4 only — non-zero means the pool has a hook
}
