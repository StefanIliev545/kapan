/**
 * Uniswap V3 LP position reader (view-only).
 *
 * Enumerates a user's position NFTs from the NonfungiblePositionManager — which is
 * ERC-721 Enumerable, so `balanceOf` + `tokenOfOwnerByIndex` lists every position with
 * no Transfer-log scraping — then reads pool state and derives the displayable shape via
 * the shared math in utils/uniswapMath.ts.
 *
 * On-chain only (no subgraph / API key) and RPC-frugal: every per-position read is batched
 * through multicall3, pool addresses are computed locally (CREATE2 — no getPool calls), and
 * uncollected fees are derived from the pool's feeGrowth accumulators (view reads) instead of
 * N separate `collect` simulations. A wallet resolves in ~4 RPC round-trips: balanceOf →
 * tokenIds → positions → one batched (metadata + pool state).
 */
import { type Abi, type Address, type PublicClient, encodeAbiParameters, getCreate2Address, keccak256, parseAbiParameters } from "viem";
import { type UniswapPosition, getTokenAmounts, tickToPrice, uncollectedFee } from "./uniswapMath";

/** Per-chain Uniswap V3 deployment addresses (verified on-chain). NPM + factory differ on Base. */
export const UNISWAP_V3_CHAINS: Record<number, { npm: Address; factory: Address }> = {
  1: { npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984" },
  42161: { npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984" },
  10: { npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984" },
  // Base uses a distinct deployment
  8453: { npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" },
};

/** keccak256 of the UniswapV3Pool creation bytecode — constant across standard V3 deployments. */
const POOL_INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

export function isUniswapV3Supported(chainId: number): boolean {
  return chainId in UNISWAP_V3_CHAINS;
}

export const NPM_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "tokenOfOwnerByIndex", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    name: "positions", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" }, { name: "operator", type: "address" },
      { name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" }, { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" }, { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const satisfies Abi;

export const POOL_ABI = [
  { name: "slot0", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "observationIndex", type: "uint16" },
    { name: "observationCardinality", type: "uint16" }, { name: "observationCardinalityNext", type: "uint16" },
    { name: "feeProtocol", type: "uint8" }, { name: "unlocked", type: "bool" },
  ] },
  { name: "feeGrowthGlobal0X128", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "feeGrowthGlobal1X128", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "ticks", type: "function", stateMutability: "view", inputs: [{ type: "int24" }], outputs: [
    { name: "liquidityGross", type: "uint128" }, { name: "liquidityNet", type: "int128" },
    { name: "feeGrowthOutside0X128", type: "uint256" }, { name: "feeGrowthOutside1X128", type: "uint256" },
    { name: "tickCumulativeOutside", type: "int56" }, { name: "secondsPerLiquidityOutsideX128", type: "uint160" },
    { name: "secondsOutside", type: "uint32" }, { name: "initialized", type: "bool" },
  ] },
] as const satisfies Abi;

export const ERC20_META_ABI = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const satisfies Abi;

/** Compute a pool address locally (CREATE2) so we don't spend an RPC call on factory.getPool. */
export function computePoolAddress(factory: Address, token0: Address, token1: Address, fee: number): Address {
  const salt = keccak256(encodeAbiParameters(parseAbiParameters("address, address, uint24"), [token0, token1, fee]));
  return getCreate2Address({ from: factory, salt, bytecodeHash: POOL_INIT_CODE_HASH });
}

type RawPosition = readonly [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint];
type Slot0 = readonly [bigint, number, ...unknown[]];
type TickInfo = readonly [bigint, bigint, bigint, bigint, ...unknown[]];

/**
 * Fetch all of `user`'s Uniswap V3 LP positions on `chainId`, resolved for display.
 * Pure (no React) so it can run in Node. Returns [] on unsupported chains / no positions.
 */
export async function fetchUniswapV3Positions(
  client: PublicClient,
  chainId: number,
  user: Address,
): Promise<UniswapPosition[]> {
  const cfg = UNISWAP_V3_CHAINS[chainId];
  if (!cfg) return [];

  const balance = await client.readContract({ address: cfg.npm, abi: NPM_ABI, functionName: "balanceOf", args: [user] });
  const count = Number(balance);
  if (count === 0) return [];

  // tokenIds (1 multicall)
  const tokenIds = (await client.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: cfg.npm, abi: NPM_ABI, functionName: "tokenOfOwnerByIndex" as const, args: [user, BigInt(i)] as const,
    })),
    allowFailure: true,
  })).map(r => (r.status === "success" ? (r.result as bigint) : null)).filter((v): v is bigint => v !== null);

  // position structs (1 multicall)
  const positions = (await client.multicall({
    contracts: tokenIds.map(id => ({ address: cfg.npm, abi: NPM_ABI, functionName: "positions" as const, args: [id] as const })),
    allowFailure: true,
  })).map((r, i) => (r.status === "success" ? { id: tokenIds[i], p: r.result as unknown as RawPosition } : null))
    .filter((v): v is { id: bigint; p: RawPosition } => v !== null);
  if (positions.length === 0) return [];

  // pool addresses computed locally (no RPC)
  const pools = positions.map(({ p }) => computePoolAddress(cfg.factory, p[2], p[3], p[4]));

  // ONE batched multicall: token metadata + per-position pool state (slot0, feeGrowthGlobal0/1, ticks(lower/upper))
  const tokens = [...new Set(positions.flatMap(({ p }) => [p[2].toLowerCase(), p[3].toLowerCase()]))] as Address[];
  const metaCalls = tokens.flatMap(addr => [
    { address: addr, abi: ERC20_META_ABI, functionName: "decimals" as const },
    { address: addr, abi: ERC20_META_ABI, functionName: "symbol" as const },
  ]);
  const poolCalls = positions.flatMap(({ p }, i) => [
    { address: pools[i], abi: POOL_ABI, functionName: "slot0" as const },
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
    const [, , token0, token1, fee, tickLower, tickUpper, liquidity, fg0Last, fg1Last, owed0, owed1] = p;
    const m0 = meta.get(token0.toLowerCase())!;
    const m1 = meta.get(token1.toLowerCase())!;
    const b = poolBase + i * 5;
    const slot = ok(res[b]) as Slot0 | undefined;
    const fgGlobal0 = (ok(res[b + 1]) as bigint) ?? 0n;
    const fgGlobal1 = (ok(res[b + 2]) as bigint) ?? 0n;
    const lower = ok(res[b + 3]) as TickInfo | undefined;
    const upper = ok(res[b + 4]) as TickInfo | undefined;

    const sqrtPriceX96 = slot ? slot[0] : 0n;
    const currentTick = slot ? Number(slot[1]) : tickLower;
    const { amount0, amount1 } = getTokenAmounts(liquidity, sqrtPriceX96, tickLower, tickUpper, m0.decimals, m1.decimals);

    const fee0 = lower && upper
      ? uncollectedFee(fgGlobal0, lower[2], upper[2], fg0Last, owed0, liquidity, currentTick, tickLower, tickUpper)
      : owed0;
    const fee1 = lower && upper
      ? uncollectedFee(fgGlobal1, lower[3], upper[3], fg1Last, owed1, liquidity, currentTick, tickLower, tickUpper)
      : owed1;

    return {
      version: 3,
      chainId,
      tokenId: id.toString(),
      fee: Number(fee),
      feePercent: Number(fee) / 1e4,
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
