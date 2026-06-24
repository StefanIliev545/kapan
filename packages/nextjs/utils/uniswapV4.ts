/**
 * Uniswap V4 LP position reader (view-only).
 *
 * V4 re-architected everything: a single PoolManager holds all pools (keyed by `poolId`),
 * positions are NFTs on a periphery PositionManager, and pool state is read through a helper
 * `StateView` contract. Crucially the V4 PositionManager is NOT ERC-721 Enumerable, so we
 * can't list tokenIds on-chain like V3 — we enumerate via the Alchemy NFT API (the app already
 * uses Alchemy), then read everything else on-chain in batched multicalls.
 *
 * The liquidity/amount/fee math is identical to V3 — see utils/uniswapMath.ts.
 */
import { type Abi, type Address, type Hex, type PublicClient, encodeAbiParameters, encodePacked, keccak256, parseAbiParameters } from "viem";
import { type UniswapPosition, asInt24, getTokenAmounts, tickToPrice, uncollectedFee } from "./uniswapMath";

/** Per-chain Uniswap V4 deployment addresses (verified on-chain via poolManager() cross-check). */
export const UNISWAP_V4_CHAINS: Record<number, { positionManager: Address; stateView: Address; alchemyNetwork: string }> = {
  1: { positionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e", stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227", alchemyNetwork: "eth-mainnet" },
  42161: { positionManager: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869", stateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990", alchemyNetwork: "arb-mainnet" },
  10: { positionManager: "0x3c3ea4b57a46241e54610e5f022e5c45859a1017", stateView: "0xc18a3169788f4f75a170290584eca6395c75ecdb", alchemyNetwork: "opt-mainnet" },
  8453: { positionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc", stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71", alchemyNetwork: "base-mainnet" },
  130: { positionManager: "0x4529a01c7a0410167c5740c487a8de60232617bf", stateView: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2", alchemyNetwork: "unichain-mainnet" },
};

const NATIVE = "0x0000000000000000000000000000000000000000";

export function isUniswapV4Supported(chainId: number): boolean {
  return chainId in UNISWAP_V4_CHAINS;
}

export const POSITION_MANAGER_ABI = [
  {
    name: "getPoolAndPositionInfo", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [
      { name: "poolKey", type: "tuple", components: [
        { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" },
      ] },
      { name: "info", type: "uint256" },
    ],
  },
  { name: "getPositionLiquidity", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint128" }] },
] as const satisfies Abi;

export const STATE_VIEW_ABI = [
  { name: "getSlot0", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "protocolFee", type: "uint24" }, { name: "lpFee", type: "uint24" },
  ] },
  { name: "getFeeGrowthGlobals", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { name: "getTickInfo", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "int24" }], outputs: [
    { name: "liquidityGross", type: "uint128" }, { name: "liquidityNet", type: "int128" },
    { name: "feeGrowthOutside0X128", type: "uint256" }, { name: "feeGrowthOutside1X128", type: "uint256" },
  ] },
  { name: "getPositionInfo", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "bytes32" }], outputs: [
    { name: "liquidity", type: "uint128" }, { name: "feeGrowthInside0LastX128", type: "uint256" }, { name: "feeGrowthInside1LastX128", type: "uint256" },
  ] },
] as const satisfies Abi;

const ERC20_META_ABI = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const satisfies Abi;

interface PoolKey { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }

/** poolId = keccak256(abi.encode(PoolKey)). */
function computePoolId(k: PoolKey): Hex {
  return keccak256(encodeAbiParameters(
    parseAbiParameters("address, address, uint24, int24, address"),
    [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
  ));
}

/** V4 position key in the PoolManager: keccak256(abi.encodePacked(owner, tickLower, tickUpper, salt)). */
function computePositionId(owner: Address, tickLower: number, tickUpper: number, tokenId: bigint): Hex {
  const salt = `0x${tokenId.toString(16).padStart(64, "0")}` as Hex;
  return keccak256(encodePacked(["address", "int24", "int24", "bytes32"], [owner, tickLower, tickUpper, salt]));
}

/**
 * Enumerate a user's V4 position NFT token ids via the Alchemy NFT API (V4 PM isn't enumerable).
 * Returns [] if no key / unsupported / on any error (caller falls back to no V4 positions).
 */
async function enumerateV4TokenIds(chainId: number, user: Address, alchemyApiKey: string): Promise<bigint[]> {
  const cfg = UNISWAP_V4_CHAINS[chainId];
  if (!cfg || !alchemyApiKey) return [];
  const ids: bigint[] = [];
  let pageKey: string | undefined;
  try {
    do {
      const url = new URL(`https://${cfg.alchemyNetwork}.g.alchemy.com/nft/v3/${alchemyApiKey}/getNFTsForOwner`);
      url.searchParams.set("owner", user);
      url.searchParams.append("contractAddresses[]", cfg.positionManager);
      url.searchParams.set("withMetadata", "false");
      url.searchParams.set("pageSize", "100");
      if (pageKey) url.searchParams.set("pageKey", pageKey);
      const res = await fetch(url.toString());
      if (!res.ok) break;
      const json = (await res.json()) as { ownedNfts?: { tokenId: string }[]; pageKey?: string };
      (json.ownedNfts ?? []).forEach(n => { try { ids.push(BigInt(n.tokenId)); } catch { /* skip */ } });
      pageKey = json.pageKey;
    } while (pageKey);
  } catch {
    return ids;
  }
  return ids;
}

type Slot0 = readonly [bigint, number, ...unknown[]];
type FeeGlobals = readonly [bigint, bigint];
type TickInfo = readonly [bigint, bigint, bigint, bigint];
type PositionInfo = readonly [bigint, bigint, bigint];

/**
 * Fetch all of `user`'s Uniswap V4 LP positions on `chainId`, resolved for display.
 * Pure (no React) so it can run in Node. Enumeration uses Alchemy; everything else is batched
 * on-chain multicalls. Returns [] on unsupported chains / no positions.
 */
export async function fetchUniswapV4Positions(
  client: PublicClient,
  chainId: number,
  user: Address,
  alchemyApiKey: string,
): Promise<UniswapPosition[]> {
  const cfg = UNISWAP_V4_CHAINS[chainId];
  if (!cfg) return [];

  const tokenIds = await enumerateV4TokenIds(chainId, user, alchemyApiKey);
  if (tokenIds.length === 0) return [];

  // poolKey + info + liquidity per position (1 multicall: 2 calls each)
  const pm = cfg.positionManager;
  const baseRes = await client.multicall({
    contracts: tokenIds.flatMap(id => [
      { address: pm, abi: POSITION_MANAGER_ABI, functionName: "getPoolAndPositionInfo" as const, args: [id] as const },
      { address: pm, abi: POSITION_MANAGER_ABI, functionName: "getPositionLiquidity" as const, args: [id] as const },
    ]),
    allowFailure: true,
  });

  interface Parsed { id: bigint; key: PoolKey; poolId: Hex; positionId: Hex; tickLower: number; tickUpper: number; liquidity: bigint }
  const parsed: Parsed[] = [];
  tokenIds.forEach((id, i) => {
    const ppi = baseRes[i * 2];
    const liq = baseRes[i * 2 + 1];
    if (ppi.status !== "success") return;
    const [key, info] = ppi.result as unknown as [PoolKey, bigint];
    const tickLower = asInt24(info >> 8n);
    const tickUpper = asInt24(info >> 32n);
    parsed.push({
      id, key, poolId: computePoolId(key),
      positionId: computePositionId(pm, tickLower, tickUpper, id),
      tickLower, tickUpper,
      liquidity: liq.status === "success" ? (liq.result as bigint) : 0n,
    });
  });
  if (parsed.length === 0) return [];

  // ONE batched multicall: token metadata (non-native) + per-position StateView reads
  const tokens = [...new Set(parsed.flatMap(p => [p.key.currency0.toLowerCase(), p.key.currency1.toLowerCase()]))]
    .filter(a => a !== NATIVE) as Address[];
  const metaCalls = tokens.flatMap(addr => [
    { address: addr, abi: ERC20_META_ABI, functionName: "decimals" as const },
    { address: addr, abi: ERC20_META_ABI, functionName: "symbol" as const },
  ]);
  const sv = cfg.stateView;
  const stateCalls = parsed.flatMap(p => [
    { address: sv, abi: STATE_VIEW_ABI, functionName: "getSlot0" as const, args: [p.poolId] as const },
    { address: sv, abi: STATE_VIEW_ABI, functionName: "getFeeGrowthGlobals" as const, args: [p.poolId] as const },
    { address: sv, abi: STATE_VIEW_ABI, functionName: "getTickInfo" as const, args: [p.poolId, p.tickLower] as const },
    { address: sv, abi: STATE_VIEW_ABI, functionName: "getTickInfo" as const, args: [p.poolId, p.tickUpper] as const },
    { address: sv, abi: STATE_VIEW_ABI, functionName: "getPositionInfo" as const, args: [p.poolId, p.positionId] as const },
  ]);
  const res = await client.multicall({ contracts: [...metaCalls, ...stateCalls], allowFailure: true });

  const meta = new Map<string, { decimals: number; symbol: string }>();
  meta.set(NATIVE, { decimals: 18, symbol: "ETH" });
  tokens.forEach((addr, i) => {
    const dec = res[i * 2];
    const sym = res[i * 2 + 1];
    meta.set(addr.toLowerCase(), {
      decimals: dec.status === "success" ? Number(dec.result) : 18,
      symbol: sym.status === "success" ? String(sym.result) : "?",
    });
  });

  const stateBase = metaCalls.length;
  const ok = (r: { status: string; result?: unknown }) => (r.status === "success" ? r.result : undefined);

  return parsed.map((p, i) => {
    const { key, tickLower, tickUpper, liquidity } = p;
    const m0 = meta.get(key.currency0.toLowerCase())!;
    const m1 = meta.get(key.currency1.toLowerCase())!;
    const b = stateBase + i * 5;
    const slot = ok(res[b]) as Slot0 | undefined;
    const fgGlobals = ok(res[b + 1]) as FeeGlobals | undefined;
    const lower = ok(res[b + 2]) as TickInfo | undefined;
    const upper = ok(res[b + 3]) as TickInfo | undefined;
    const posInfo = ok(res[b + 4]) as PositionInfo | undefined;

    const sqrtPriceX96 = slot ? slot[0] : 0n;
    const currentTick = slot ? Number(slot[1]) : tickLower;
    const { amount0, amount1 } = getTokenAmounts(liquidity, sqrtPriceX96, tickLower, tickUpper, m0.decimals, m1.decimals);

    // V4 has no per-position tokensOwed accumulator — fees are purely feeGrowthInside delta.
    const fgInside0Last = posInfo ? posInfo[1] : 0n;
    const fgInside1Last = posInfo ? posInfo[2] : 0n;
    const fee0 = fgGlobals && lower && upper
      ? uncollectedFee(fgGlobals[0], lower[2], upper[2], fgInside0Last, 0n, liquidity, currentTick, tickLower, tickUpper) : 0n;
    const fee1 = fgGlobals && lower && upper
      ? uncollectedFee(fgGlobals[1], lower[3], upper[3], fgInside1Last, 0n, liquidity, currentTick, tickLower, tickUpper) : 0n;

    return {
      version: 4,
      chainId,
      tokenId: p.id.toString(),
      fee: key.fee,
      feePercent: key.fee / 1e4,
      token0: { address: key.currency0, symbol: m0.symbol, decimals: m0.decimals, amount: amount0, fees: Number(fee0) / 10 ** m0.decimals },
      token1: { address: key.currency1, symbol: m1.symbol, decimals: m1.decimals, amount: amount1, fees: Number(fee1) / 10 ** m1.decimals },
      tickLower, tickUpper, currentTick,
      priceLower: tickToPrice(tickLower, m0.decimals, m1.decimals),
      priceUpper: tickToPrice(tickUpper, m0.decimals, m1.decimals),
      priceCurrent: tickToPrice(currentTick, m0.decimals, m1.decimals),
      inRange: currentTick >= tickLower && currentTick < tickUpper,
      closed: liquidity === 0n,
      hooks: key.hooks,
    } satisfies UniswapPosition;
  });
}
