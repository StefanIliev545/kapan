import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Address } from "viem";

/**
 * DeFi Llama Yields API for Liquid Staking Token yields
 *
 * Fetches native staking yields for LSTs like wstETH, rETH, weETH, etc.
 * These yields are additive with lending protocol rates.
 */

const DEFILLAMA_YIELDS_API = "https://yields.llama.fi/pools";

// Cache configuration - LST yields change slowly (staking rewards)
const LST_STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes
const LST_GC_TIME_MS = 30 * 60 * 1000; // Keep in cache for 30 minutes
const LST_REFETCH_INTERVAL_MS = 10 * 60 * 1000; // Refetch every 10 minutes

// Minimum TVL to filter out low-liquidity pools (in USD)
const MIN_LST_TVL_USD = 1_000_000;

// Native LST protocol projects on DeFi Llama (not lending protocols)
const LST_PROJECTS = new Set([
  "lido",
  "rocket-pool",
  "ether.fi-stake",
  "coinbase-wrapped-staked-eth",
  "kelp",
  "renzo",
  "stakewise-v2",
  "swell",
  "frax-ether",
  "meth-protocol",
  "binance-staked-eth",
  "stader",
  "ankr",
  "origin-ether",
  "dinero-(pirex-eth)",
]);

// Symbol to canonical symbol mapping (handles variations)
const SYMBOL_ALIASES: Record<string, string> = {
  steth: "steth",
  wsteth: "wsteth",
  reth: "reth",
  cbeth: "cbeth",
  weeth: "weeth",
  rseth: "rseth",
  ezeth: "ezeth",
  oseth: "oseth",
  sweth: "sweth",
  sfrxeth: "sfrxeth",
  frxeth: "frxeth",
  meth: "meth",
  wbeth: "wbeth",
  ethx: "ethx",
  ankreth: "ankreth",
  oeth: "oeth",
  apxeth: "apxeth",
  pxeth: "pxeth",
};

// Known LST token addresses by chain
const LST_ADDRESSES: Record<number, Record<string, Address>> = {
  1: { // Ethereum
    steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    reth: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    cbeth: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    weeth: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
    rseth: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7",
    ezeth: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
    oseth: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38",
    sweth: "0xf951E335afb289353dc249e82926178EaC7DEd78",
    sfrxeth: "0xac3E018457B222d93114458476f3E3416Abbe38F",
    frxeth: "0x5E8422345238F34275888049021821E8E08CAa1f",
    meth: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa",
    wbeth: "0xa2E3356610840701BDf5611a53974510Ae27E2e1",
    oeth: "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3",
  },
  42161: { // Arbitrum
    wsteth: "0x5979D7b546E38E414F7E9822514be443A4800529",
    reth: "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8",
    weeth: "0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe",
    rseth: "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
    ezeth: "0x2416092f143378750bb29b79eD961ab195CcEea5",
    wbeth: "0xa067C0F38A6a6D703f37C6F71f7C0F6254CC8a49",
  },
  10: { // Optimism
    wsteth: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb",
    reth: "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D",
    weeth: "0x346e03f8cce9fe01dcb3d0da3e9d00dc2c0e08f0",
  },
  8453: { // Base
    wsteth: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
    cbeth: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
    weeth: "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A",
    ezeth: "0x2416092f143378750bb29b79eD961ab195CcEea5",
  },
  59144: { // Linea
    wsteth: "0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F",
    weeth: "0x1Bf74C010E6320bab11e2e5A532b5AC15e0b8aA6",
    ezeth: "0x2416092f143378750bb29b79eD961ab195CcEea5",
  },
};

export interface LSTYield {
  address: Address;
  symbol: string;
  name: string;
  /** APY as percentage (e.g., 3.5 for 3.5%) */
  apy: number;
  /** Source project (e.g., "lido", "rocket-pool") */
  project: string;
  /** Chain where yield was sourced */
  sourceChain: string;
  /** TVL in USD (for filtering/sorting) */
  tvlUsd: number;
}

interface DefiLlamaPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  ilRisk: string;
  exposure: string;
  pool: string;
}

/**
 * Check if a token symbol is a known LST
 */
export function isLSTToken(symbol: string): boolean {
  const normalized = symbol.toLowerCase().replace(/-/g, "");
  return SYMBOL_ALIASES[normalized] !== undefined;
}

/**
 * Normalize LST symbol for lookup
 */
function normalizeLSTSymbol(symbol: string): string {
  const normalized = symbol.toLowerCase().replace(/-/g, "");
  return SYMBOL_ALIASES[normalized] || normalized;
}

/**
 * Fetch LST yields from DeFi Llama
 */
async function fetchLSTYields(): Promise<LSTYield[]> {
  try {
    const response = await fetch(DEFILLAMA_YIELDS_API, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.warn(`[useLSTYields] DeFi Llama API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const pools: DefiLlamaPool[] = data.data || [];

    // Filter for native LST yields (not lending protocols)
    const lstPools = pools.filter(pool => {
      // Must be from an LST native project
      if (!LST_PROJECTS.has(pool.project)) return false;
      // Must be single-asset exposure (no LP)
      if (pool.exposure !== "single") return false;
      // Must not have IL risk
      if (pool.ilRisk !== "no") return false;
      // Must have meaningful TVL
      if (pool.tvlUsd < MIN_LST_TVL_USD) return false;
      return true;
    });

    // Deduplicate by symbol, keeping highest TVL pool for each
    const highestTvlBySymbol = new Map<string, DefiLlamaPool>();
    for (const pool of lstPools) {
      const normalizedSymbol = normalizeLSTSymbol(pool.symbol);
      const existing = highestTvlBySymbol.get(normalizedSymbol);
      if (!existing || pool.tvlUsd > existing.tvlUsd) {
        highestTvlBySymbol.set(normalizedSymbol, pool);
      }
    }

    // Convert to LSTYield format
    const yields: LSTYield[] = [];
    for (const [symbol, pool] of highestTvlBySymbol) {
      // Get the Ethereum address (primary) for this symbol
      const ethAddress = LST_ADDRESSES[1]?.[symbol];
      if (!ethAddress) continue; // Skip if we don't know the address

      yields.push({
        address: ethAddress.toLowerCase() as Address,
        symbol: pool.symbol.toUpperCase(),
        name: pool.symbol,
        apy: pool.apy || pool.apyBase || 0,
        project: pool.project,
        sourceChain: pool.chain,
        tvlUsd: pool.tvlUsd,
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[useLSTYields] Loaded ${yields.length} LST yields from DeFi Llama`);
      yields.slice(0, 5).forEach(y => console.log(`  ${y.symbol}: ${y.apy.toFixed(2)}%`));
    }

    return yields;
  } catch (error) {
    console.warn("[useLSTYields] Failed to fetch from DeFi Llama:", error);
    return [];
  }
}

/**
 * Hook to fetch LST yields from DeFi Llama
 */
export function useLSTYields(enabled = true) {
  const query = useQuery({
    queryKey: ["lst-yields"],
    queryFn: fetchLSTYields,
    enabled,
    staleTime: LST_STALE_TIME_MS,
    gcTime: LST_GC_TIME_MS,
    refetchInterval: LST_REFETCH_INTERVAL_MS,
  });

  // Create address lookup map. Maps all chain-specific addresses to the same yield data
  // since LST yields are protocol-wide (e.g., wstETH staking yield is ~2.3% regardless of chain)
  const yieldsByAddress = useMemo(() => {
    const map = new Map<string, LSTYield>();
    query.data?.forEach(y => {
      map.set(y.address.toLowerCase(), y);
      // Map all chain-specific addresses (Arbitrum, Optimism, etc.) to the same yield
      const normalizedSymbol = normalizeLSTSymbol(y.symbol);
      for (const chainAddresses of Object.values(LST_ADDRESSES)) {
        const addr = chainAddresses[normalizedSymbol];
        if (addr) {
          map.set(addr.toLowerCase(), y);
        }
      }
    });
    return map;
  }, [query.data]);

  const yieldsBySymbol = useMemo(() => {
    const map = new Map<string, LSTYield>();
    query.data?.forEach(y => {
      const normalized = normalizeLSTSymbol(y.symbol);
      map.set(normalized, y);
      // Also add the original symbol
      map.set(y.symbol.toLowerCase(), y);
    });
    return map;
  }, [query.data]);

  /**
   * Find yield for a token by address or symbol
   */
  const findYield = useMemo(() => {
    return (address?: string, symbol?: string): LSTYield | undefined => {
      // Try address match first
      if (address) {
        const byAddress = yieldsByAddress.get(address.toLowerCase());
        if (byAddress) return byAddress;
      }

      // Try symbol match
      if (symbol) {
        const normalized = normalizeLSTSymbol(symbol);
        const bySymbol = yieldsBySymbol.get(normalized);
        if (bySymbol) return bySymbol;
      }

      return undefined;
    };
  }, [yieldsByAddress, yieldsBySymbol]);

  return {
    yields: query.data || [],
    yieldsByAddress,
    yieldsBySymbol,
    findYield,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get LST yield for a specific token
 */
export function useLSTYield(
  tokenAddress?: Address,
  tokenSymbol?: string,
  enabled = true
) {
  const { findYield, isLoading } = useLSTYields(enabled && !!(tokenAddress || tokenSymbol));

  const lstYield = useMemo(() => {
    return findYield(tokenAddress, tokenSymbol);
  }, [findYield, tokenAddress, tokenSymbol]);

  return {
    yield: lstYield,
    apy: lstYield?.apy,
    project: lstYield?.project,
    isLoading,
  };
}
