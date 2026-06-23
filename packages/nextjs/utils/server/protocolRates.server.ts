/**
 * Server-side (viem, no wallet) reader for Aave/Spark/Compound/Venus lending rates.
 *
 * This is the SSR/ISR counterpart of the client hook `hooks/useAllProtocolRates.ts`: it reads the
 * same deployed gateway VIEW contracts using a dummy zero address for the `user` arg, so no wallet
 * connection is needed. It powers the programmatic /rates/[chain]/[token] pages (server-rendered so
 * crawlers see real rate content in the initial HTML).
 *
 * NOTE (deliberate scope): this returns the RAW on-chain supply/borrow APYs only. The client hook
 * additionally layers external supply-side yields (Pendle PT / Maple / LST) via React hooks that
 * hit browser-only APIs — those are NOT ported here. Off-chain protocols (Morpho/Euler/Pendle) also
 * aren't included yet; their fetchers use relative `/api/...` URLs that throw in a Server Component.
 * Adding them server-side is a follow-up (export the fetchers + use absolute URLs). See the SEO plan.
 */
import { cache } from "react";
import { createPublicClient, http, type Abi, type Address, type Chain } from "viem";
import { arbitrum, base, linea, mainnet, optimism } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import scaffoldConfig from "~~/scaffold.config";
import { aaveRateToAPY, compoundRateToAPR, venusRateToAPY } from "~~/utils/protocolRates";
import { canonicalizeTokenName } from "~~/utils/tokenSymbols";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
// Probe (caller) address for the user-scoped view calls. Aave's getAllTokensInfo PANICS for the
// zero address on some chains (its user-account math assumes a real account), so we read rates as a
// non-zero account that holds nothing — balances come back 0, rates are unaffected.
const PROBE_USER = "0x0000000000000000000000000000000000000001" as Address;
const ALCHEMY_KEY = scaffoldConfig.alchemyApiKey;

export type RatesProtocol = "aave" | "spark" | "compound" | "venus";

export interface ProtocolRateRow {
  protocol: RatesProtocol;
  symbol: string;
  tokenAddress: string;
  /** Supply APY as a percentage, e.g. 4.2 for 4.2%. */
  supplyApy: number;
  /** Borrow APR/APY as a percentage. */
  borrowApy: number;
}

// Only chains that have at least one gateway view deployed. http(undefined) falls back to the
// chain's public RPC if no Alchemy key is set (fine for current-rate reads — no historical block).
const CHAIN_RPC: Record<number, { chain: Chain; rpcUrl?: string }> = {
  1: { chain: mainnet, rpcUrl: ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined },
  10: { chain: optimism, rpcUrl: ALCHEMY_KEY ? `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined },
  8453: { chain: base, rpcUrl: ALCHEMY_KEY ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined },
  42161: { chain: arbitrum, rpcUrl: ALCHEMY_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined },
  59144: { chain: linea, rpcUrl: ALCHEMY_KEY ? `https://linea-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined },
};

type ViemClient = ReturnType<typeof createPublicClient>;

function getClient(chainId: number): ViemClient | null {
  const cfg = CHAIN_RPC[chainId];
  if (!cfg) return null;
  return createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
}

type GatewayName = "AaveGatewayView" | "SparkGatewayView" | "VenusGatewayView" | "CompoundGatewayView";

function getGateway(chainId: number, name: GatewayName): { address: Address; abi: Abi } | null {
  const c = (deployedContracts as any)?.[chainId]?.[name];
  if (!c?.address || !c?.abi) return null;
  return { address: c.address as Address, abi: c.abi as Abi };
}

/** Run a per-protocol reader, swallowing failures so one bad protocol can't blank the page. */
async function safe(label: string, fn: () => Promise<ProtocolRateRow[]>): Promise<ProtocolRateRow[]> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[protocolRates.server] ${label} failed:`, error);
    return [];
  }
}

// Aave V3 and Spark share the same gateway interface: getAllTokensInfo(user) -> TokenInfo[]
async function readAaveLike(
  client: ViemClient,
  gateway: { address: Address; abi: Abi },
  protocol: RatesProtocol,
): Promise<ProtocolRateRow[]> {
  const data = (await client.readContract({
    address: gateway.address,
    abi: gateway.abi,
    functionName: "getAllTokensInfo",
    args: [PROBE_USER],
  })) as any[];

  return (data ?? [])
    .map(t => ({
      protocol,
      symbol: String(t.symbol ?? ""),
      tokenAddress: String(t.token ?? "").toLowerCase(),
      supplyApy: aaveRateToAPY(BigInt(t.supplyRate ?? 0)),
      borrowApy: aaveRateToAPY(BigInt(t.borrowRate ?? 0)),
    }))
    .filter(r => r.tokenAddress && r.tokenAddress !== ZERO);
}

// Venus: getAllVenusMarkets() -> [vTokens, tokens, symbols, ...]; getMarketRates(vTokens) -> [prices, supply, borrow]
async function readVenus(client: ViemClient, gateway: { address: Address; abi: Abi }): Promise<ProtocolRateRow[]> {
  const markets = (await client.readContract({
    address: gateway.address,
    abi: gateway.abi,
    functionName: "getAllVenusMarkets",
    args: [],
  })) as any[];

  const vTokens = (markets?.[0] ?? []) as Address[];
  const tokens = (markets?.[1] ?? []) as Address[];
  const symbols = (markets?.[2] ?? []) as string[];
  if (!vTokens.length) return [];

  const rates = (await client.readContract({
    address: gateway.address,
    abi: gateway.abi,
    functionName: "getMarketRates",
    args: [vTokens],
  })) as any[];
  const supplyRates = (rates?.[1] ?? []) as bigint[];
  const borrowRates = (rates?.[2] ?? []) as bigint[];

  const rows: ProtocolRateRow[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = String(tokens[i] ?? "").toLowerCase();
    if (!token || token === ZERO) continue;
    rows.push({
      protocol: "venus",
      symbol: String(symbols[i] ?? ""),
      tokenAddress: token,
      supplyApy: venusRateToAPY(BigInt(supplyRates[i] ?? 0)),
      borrowApy: venusRateToAPY(BigInt(borrowRates[i] ?? 0)),
    });
  }
  return rows;
}

// Compound: allActiveBaseTokens() -> address[]; getCompoundData(token, user) -> [supplyRate, borrowRate, ...]
// Compound's output carries no symbol, so we backfill from the Aave/Venus symbol map.
async function readCompound(
  client: ViemClient,
  gateway: { address: Address; abi: Abi },
  symbolByAddress: Map<string, string>,
): Promise<ProtocolRateRow[]> {
  const baseTokens = (await client.readContract({
    address: gateway.address,
    abi: gateway.abi,
    functionName: "allActiveBaseTokens",
    args: [],
  })) as Address[];
  if (!baseTokens?.length) return [];

  const results = await client.multicall({
    contracts: baseTokens.map(token => ({
      address: gateway.address,
      abi: gateway.abi,
      functionName: "getCompoundData",
      args: [token, PROBE_USER],
    })),
    allowFailure: true,
  });

  const rows: ProtocolRateRow[] = [];
  results.forEach((res, i) => {
    if (res.status !== "success" || !res.result) return;
    const r = res.result as any[]; // [supplyRate, borrowRate, ...]
    const token = String(baseTokens[i]).toLowerCase();
    rows.push({
      protocol: "compound",
      symbol: symbolByAddress.get(token) ?? "",
      tokenAddress: token,
      supplyApy: compoundRateToAPR(BigInt(r[0] ?? 0)),
      borrowApy: compoundRateToAPR(BigInt(r[1] ?? 0)),
    });
  });
  return rows;
}

/**
 * Read all on-chain protocol rates for a chain. Wrapped in React `cache()` so a single request
 * (generateMetadata + the page render) shares one set of RPC calls.
 */
export const getChainRates = cache(async (chainId: number): Promise<ProtocolRateRow[]> => {
  const client = getClient(chainId);
  if (!client) return [];

  const rows: ProtocolRateRow[] = [];

  const aaveGw = getGateway(chainId, "AaveGatewayView");
  if (aaveGw) rows.push(...(await safe("aave", () => readAaveLike(client, aaveGw, "aave"))));

  const sparkGw = getGateway(chainId, "SparkGatewayView");
  if (sparkGw) rows.push(...(await safe("spark", () => readAaveLike(client, sparkGw, "spark"))));

  const venusGw = getGateway(chainId, "VenusGatewayView");
  if (venusGw) rows.push(...(await safe("venus", () => readVenus(client, venusGw))));

  // Backfill Compound symbols from what Aave/Venus already resolved for the same addresses.
  const symbolByAddress = new Map(rows.filter(r => r.symbol).map(r => [r.tokenAddress, r.symbol]));
  const compoundGw = getGateway(chainId, "CompoundGatewayView");
  if (compoundGw) rows.push(...(await safe("compound", () => readCompound(client, compoundGw, symbolByAddress))));

  return rows;
});

/** Rows for a single canonical token on a chain (e.g. "usdc", "eth"). */
export const getTokenRates = cache(async (chainId: number, tokenSlug: string): Promise<ProtocolRateRow[]> => {
  const all = await getChainRates(chainId);
  const target = tokenSlug.toLowerCase();
  return all.filter(r => r.symbol && canonicalizeTokenName(r.symbol).toLowerCase() === target);
});
