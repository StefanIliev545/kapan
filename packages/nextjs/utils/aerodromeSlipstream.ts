/**
 * Aerodrome (Base) / Velodrome (Optimism) "Slipstream" concentrated-liquidity position reader.
 *
 * Slipstream is a Uniswap V3 fork, so this is structurally identical to utils/uniswapV3.ts and
 * shares all the math (utils/uniswapMath.ts). The only differences:
 *   - the position NFT's `positions()` returns `tickSpacing` instead of `fee`
 *   - pools are keyed by (token0, token1, tickSpacing) and resolved via `CLFactory.getPool`
 *     (one multicall) rather than a CREATE2 init-code hash
 *
 * Like the Uniswap V3 reader it enumerates on-chain (ERC-721 Enumerable) and batches every read
 * through multicall — ~5 round-trips per wallet, no API key.
 *
 * SCOPE: this covers UNSTAKED CL positions (NFTs held in the wallet). Positions staked in a CL
 * gauge for AERO/VELO emissions are owned by the gauge, not the user, so they aren't enumerable
 * this way — surfacing those needs the Sugar lens (chunked) or an indexer. TODO(future): add
 * staked positions via LpSugar.positions() with chunked pagination over the voter pool list.
 */
import { type Abi, type Address, type PublicClient } from "viem";
import { type UniswapPosition, getTokenAmounts, tickToPrice, uncollectedFee } from "./uniswapMath";

interface SlipstreamChain {
  npm: Address;
  factory: Address;
  protocol: "aerodrome" | "velodrome";
  /** Slug for the protocol app deep-link. */
  app: string;
}

/** Verified on-chain (NPM.factory() / pool reads). Aerodrome = Base, Velodrome = Optimism. */
export const SLIPSTREAM_CHAINS: Record<number, SlipstreamChain> = {
  // Aerodrome (Base)
  8453: {
    npm: "0x827922686190790b37229fd06084350E74485b72",
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
    protocol: "aerodrome",
    app: "https://aerodrome.finance/positions",
  },
  // Velodrome (Optimism) — Slipstream Position NFT v1.2
  10: {
    npm: "0x416b433906b1B72FA758e166e239c43d68dC6F29",
    factory: "0xCc0bDDB707055e04e497aB22a59c2aF4391cd12F",
    protocol: "velodrome",
    app: "https://velodrome.finance/positions",
  },
};

export function isSlipstreamSupported(chainId: number): boolean {
  return chainId in SLIPSTREAM_CHAINS;
}

const NPM_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "tokenOfOwnerByIndex", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    name: "positions", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" }, { name: "operator", type: "address" },
      { name: "token0", type: "address" }, { name: "token1", type: "address" },
      { name: "tickSpacing", type: "int24" }, // Slipstream: tickSpacing, not fee
      { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" }, { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" }, { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const satisfies Abi;

const FACTORY_ABI = [
  { name: "getPool", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "int24" }], outputs: [{ type: "address" }] },
] as const satisfies Abi;

const POOL_ABI = [
  { name: "slot0", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "observationIndex", type: "uint16" },
    { name: "observationCardinality", type: "uint16" }, { name: "observationCardinalityNext", type: "uint16" }, { name: "unlocked", type: "bool" },
  ] },
  { name: "fee", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { name: "feeGrowthGlobal0X128", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "feeGrowthGlobal1X128", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "ticks", type: "function", stateMutability: "view", inputs: [{ type: "int24" }], outputs: [
    { name: "liquidityGross", type: "uint128" }, { name: "liquidityNet", type: "int128" },
    { name: "feeGrowthOutside0X128", type: "uint256" }, { name: "feeGrowthOutside1X128", type: "uint256" },
    { name: "tickCumulativeOutside", type: "int56" }, { name: "secondsPerLiquidityOutsideX128", type: "uint160" },
    { name: "secondsOutside", type: "uint32" }, { name: "initialized", type: "bool" },
  ] },
] as const satisfies Abi;

const ERC20_META_ABI = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const satisfies Abi;

type RawPosition = readonly [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint];
type Slot0 = readonly [bigint, number, ...unknown[]];
type TickInfo = readonly [bigint, bigint, bigint, bigint, ...unknown[]];

/**
 * Fetch a user's UNSTAKED Aerodrome/Velodrome Slipstream CL positions on `chainId`.
 * Pure (no React). Returns [] on unsupported chains / no positions.
 */
export async function fetchSlipstreamPositions(
  client: PublicClient,
  chainId: number,
  user: Address,
): Promise<UniswapPosition[]> {
  const cfg = SLIPSTREAM_CHAINS[chainId];
  if (!cfg) return [];

  const balance = await client.readContract({ address: cfg.npm, abi: NPM_ABI, functionName: "balanceOf", args: [user] });
  const count = Number(balance);
  if (count === 0) return [];

  const tokenIds = (await client.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: cfg.npm, abi: NPM_ABI, functionName: "tokenOfOwnerByIndex" as const, args: [user, BigInt(i)] as const,
    })),
    allowFailure: true,
  })).map(r => (r.status === "success" ? (r.result as bigint) : null)).filter((v): v is bigint => v !== null);

  const positions = (await client.multicall({
    contracts: tokenIds.map(id => ({ address: cfg.npm, abi: NPM_ABI, functionName: "positions" as const, args: [id] as const })),
    allowFailure: true,
  })).map((r, i) => (r.status === "success" ? { id: tokenIds[i], p: r.result as unknown as RawPosition } : null))
    .filter((v): v is { id: bigint; p: RawPosition } => v !== null);
  if (positions.length === 0) return [];

  // Resolve pool addresses via the factory (Slipstream has no stable CREATE2 init hash) — 1 multicall.
  const pools = (await client.multicall({
    contracts: positions.map(({ p }) => ({
      address: cfg.factory, abi: FACTORY_ABI, functionName: "getPool" as const, args: [p[2], p[3], p[4]] as const,
    })),
    allowFailure: true,
  })).map(r => (r.status === "success" ? (r.result as Address) : ("0x0000000000000000000000000000000000000000" as Address)));

  // ONE batched multicall: token metadata + per-position pool state.
  const tokens = [...new Set(positions.flatMap(({ p }) => [p[2].toLowerCase(), p[3].toLowerCase()]))] as Address[];
  const metaCalls = tokens.flatMap(addr => [
    { address: addr, abi: ERC20_META_ABI, functionName: "decimals" as const },
    { address: addr, abi: ERC20_META_ABI, functionName: "symbol" as const },
  ]);
  const poolCalls = positions.flatMap(({ p }, i) => [
    { address: pools[i], abi: POOL_ABI, functionName: "slot0" as const },
    { address: pools[i], abi: POOL_ABI, functionName: "fee" as const },
    { address: pools[i], abi: POOL_ABI, functionName: "feeGrowthGlobal0X128" as const },
    { address: pools[i], abi: POOL_ABI, functionName: "feeGrowthGlobal1X128" as const },
    { address: pools[i], abi: POOL_ABI, functionName: "ticks" as const, args: [p[5]] as const },
    { address: pools[i], abi: POOL_ABI, functionName: "ticks" as const, args: [p[6]] as const },
  ]);
  const res = await client.multicall({ contracts: [...metaCalls, ...poolCalls], allowFailure: true });

  const meta = new Map<string, { decimals: number; symbol: string }>();
  tokens.forEach((addr, i) => {
    const dec = res[i * 2];
    const sym = res[i * 2 + 1];
    meta.set(addr.toLowerCase(), {
      decimals: dec.status === "success" ? Number(dec.result) : 18,
      symbol: sym.status === "success" ? String(sym.result) : "?",
    });
  });

  const poolBase = metaCalls.length;
  const ok = (r: { status: string; result?: unknown }) => (r.status === "success" ? r.result : undefined);

  return positions.map(({ id, p }, i) => {
    const [, , token0, token1, , tickLower, tickUpper, liquidity, fg0Last, fg1Last, owed0, owed1] = p;
    const m0 = meta.get(token0.toLowerCase())!;
    const m1 = meta.get(token1.toLowerCase())!;
    const b = poolBase + i * 6;
    const slot = ok(res[b]) as Slot0 | undefined;
    const feeRaw = ok(res[b + 1]) as number | undefined; // Slipstream pool fee (hundredths of a bip)
    const fgGlobal0 = (ok(res[b + 2]) as bigint) ?? 0n;
    const fgGlobal1 = (ok(res[b + 3]) as bigint) ?? 0n;
    const lower = ok(res[b + 4]) as TickInfo | undefined;
    const upper = ok(res[b + 5]) as TickInfo | undefined;

    const sqrtPriceX96 = slot ? slot[0] : 0n;
    const currentTick = slot ? Number(slot[1]) : tickLower;
    const fee = Number(feeRaw ?? 0);
    const { amount0, amount1 } = getTokenAmounts(liquidity, sqrtPriceX96, tickLower, tickUpper, m0.decimals, m1.decimals);

    const fee0 = lower && upper
      ? uncollectedFee(fgGlobal0, lower[2], upper[2], fg0Last, owed0, liquidity, currentTick, tickLower, tickUpper) : owed0;
    const fee1 = lower && upper
      ? uncollectedFee(fgGlobal1, lower[3], upper[3], fg1Last, owed1, liquidity, currentTick, tickLower, tickUpper) : owed1;

    return {
      protocol: cfg.protocol,
      versionLabel: "CL",
      url: `${cfg.app}/${id.toString()}`,
      version: 3,
      chainId,
      tokenId: id.toString(),
      fee,
      feePercent: fee / 1e4,
      token0: { address: token0, symbol: m0.symbol, decimals: m0.decimals, amount: amount0, fees: Number(fee0) / 10 ** m0.decimals },
      token1: { address: token1, symbol: m1.symbol, decimals: m1.decimals, amount: amount1, fees: Number(fee1) / 10 ** m1.decimals },
      tickLower, tickUpper, currentTick,
      priceLower: tickToPrice(tickLower, m0.decimals, m1.decimals),
      priceUpper: tickToPrice(tickUpper, m0.decimals, m1.decimals),
      priceCurrent: tickToPrice(currentTick, m0.decimals, m1.decimals),
      inRange: currentTick >= tickLower && currentTick < tickUpper,
      closed: liquidity === 0n,
    } satisfies UniswapPosition;
  });
}
