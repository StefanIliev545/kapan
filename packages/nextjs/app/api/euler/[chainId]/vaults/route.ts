import { NextRequest, NextResponse } from "next/server";

/**
 * Euler V2 Vaults API
 *
 * Fetches available Euler V2 vaults from the Goldsky subgraph.
 * Vaults are ERC-4626 compliant with borrowing extensions.
 *
 * IMPORTANT: Collaterals are filtered by on-chain LTV check.
 * Only collaterals with LTVBorrow > 0 are included.
 */

// RPC endpoints for on-chain LTV checks
const RPC_ENDPOINTS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  130: "https://mainnet.unichain.org",
  8453: "https://mainnet.base.org",
  9745: "https://rpc.plasma.io/l2",
  42161: "https://arb1.arbitrum.io/rpc",
  59144: "https://rpc.linea.build",
  31337: "http://127.0.0.1:8545", // Hardhat local node
};

// Euler subgraph endpoints by chain
const EULER_SUBGRAPH_URLS: Record<number, string> = {
  // Ethereum Mainnet
  1: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn",
  // Optimism
  10: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-optimism/latest/gn",
  // Unichain
  130: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-unichain/latest/gn",
  // Base
  8453: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-base/latest/gn",
  // Plasma
  9745: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-plasma/latest/gn",
  // Arbitrum
  42161: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-arbitrum/latest/gn",
  // Linea
  59144: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-linea/latest/gn",
};

// Lightweight query to get all vault id->symbol->asset mappings for collateral resolution
const VAULT_SYMBOLS_QUERY = `
  query VaultSymbols {
    eulerVaults(first: 1000) {
      id
      symbol
      asset
    }
  }
`;

const VAULTS_QUERY = `
  query Vaults($first: Int!, $skip: Int!) {
    eulerVaults(
      first: $first
      skip: $skip
    ) {
      id
      name
      symbol
      asset
      borrowCap
      supplyCap
      collaterals
      creator
      governonAdmin
      state {
        totalShares
        totalBorrows
        supplyApy
        borrowApy
        cash
      }
    }
  }
`;

// Common token metadata for known assets on Arbitrum
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { symbol: "WETH", decimals: 18 },
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { symbol: "WBTC", decimals: 8 },
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": { symbol: "DAI", decimals: 18 },
  "0x912ce59144191c1204e64559fe8253a0e49e6548": { symbol: "ARB", decimals: 18 },
  "0x5979d7b546e38e414f7e9822514be443a4800529": { symbol: "wstETH", decimals: 18 },
  "0xddb46999f8891663a8f2828d25298f70416d7610": { symbol: "sUSDS", decimals: 18 },
  "0x35751007a407ca6feffe80b3cb397736d2cf4dbe": { symbol: "weETH", decimals: 18 },
  "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8": { symbol: "rETH", decimals: 18 },
};

export interface CollateralInfo {
  vaultAddress: string;
  vaultSymbol: string;
  tokenSymbol: string; // Extracted from vault symbol (e.g., "eWETH-1" -> "WETH")
  tokenAddress: string; // Underlying asset address of the collateral vault
}

export interface EulerVaultResponse {
  id: string;
  address: string;
  name: string;
  symbol: string;
  asset: {
    address: string;
    symbol: string;
    decimals: number;
  };
  totalSupply: string;
  totalBorrows: string;
  /** Borrow cap in human-readable units (null = no cap) */
  borrowCap: string | null;
  /** Available borrow capacity = borrowCap - totalBorrows (null = unlimited) */
  availableBorrowCapacity: string | null;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
  collateralCount: number;
  collaterals: CollateralInfo[];
  creator: string;
}

// Extract token symbol from vault symbol (e.g., "eWETH-1" -> "WETH", "esUSDS-1" -> "sUSDS")
function extractTokenFromVaultSymbol(vaultSymbol: string): string {
  const match = vaultSymbol.match(/^e(.+?)-\d+$/);
  if (match) {
    return match[1];
  }
  return vaultSymbol.startsWith('e') ? vaultSymbol.slice(1) : vaultSymbol;
}

// LTVList function selector: 0x6a16ef84 - returns address[] of collaterals with LTV > 0
const LTV_LIST_SELECTOR = "0x6a16ef84";

/** Decode an ABI-encoded address[] from a raw hex RPC result. */
function decodeAddressArray(hexResult: string): string[] {
  const data = hexResult.slice(2); // Remove 0x
  const length = parseInt(data.slice(64, 128), 16); // Second 32 bytes = array length
  const addresses: string[] = [];
  for (let k = 0; k < length; k++) {
    const offset = 128 + k * 64;
    const addrPadded = data.slice(offset, offset + 64);
    addresses.push("0x" + addrPadded.slice(24).toLowerCase());
  }
  return addresses;
}

/**
 * Get valid collaterals for multiple vaults using LTVList() calls.
 * LTVList() returns all collaterals with configured (non-zero) LTV.
 * Returns a Set of "vaultAddr:collateralAddr" pairs.
 */
async function getValidCollaterals(
  chainId: number,
  vaultAddresses: string[]
): Promise<Set<string>> {
  const rpcUrl = RPC_ENDPOINTS[chainId];
  if (!rpcUrl || vaultAddresses.length === 0) {
    return new Set();
  }

  const validPairs = new Set<string>();
  const BATCH_SIZE = 20;

  for (let i = 0; i < vaultAddresses.length; i += BATCH_SIZE) {
    const batch = vaultAddresses.slice(i, i + BATCH_SIZE);
    const calls = batch.map((vaultAddr, idx) => ({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: vaultAddr, data: LTV_LIST_SELECTOR }, "latest"],
      id: i + idx,
    }));

    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calls),
      });

      if (!response.ok) {
        console.error(`[euler/vaults] LTVList batch RPC error: ${response.status}`);
        continue;
      }

      const results = await response.json();

      for (let j = 0; j < batch.length; j++) {
        const result = Array.isArray(results) ? results[j] : results;
        const vaultAddr = batch[j].toLowerCase();

        if (!result?.result || result.result === "0x" || result.error || result.result.length <= 66) {
          continue;
        }

        try {
          for (const collateralAddr of decodeAddressArray(result.result)) {
            validPairs.add(`${vaultAddr}:${collateralAddr}`);
          }
        } catch (decodeError) {
          console.error(`[euler/vaults] Failed to decode LTVList for ${vaultAddr}:`, decodeError);
        }
      }
    } catch (error) {
      console.error(`[euler/vaults] LTVList batch check error:`, error);
    }
  }

  return validPairs;
}

/** Fetch vault symbol/asset lookup map from the subgraph. */
async function fetchVaultInfoLookup(
  subgraphUrl: string,
): Promise<Map<string, { symbol: string; asset: string }>> {
  const lookup = new Map<string, { symbol: string; asset: string }>();
  const symbolsResponse = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: VAULT_SYMBOLS_QUERY }),
    next: { revalidate: 300 },
  });
  if (!symbolsResponse.ok) return lookup;

  const symbolsData = await symbolsResponse.json();
  for (const v of symbolsData.data?.eulerVaults || []) {
    if (v.id && v.symbol) {
      lookup.set(v.id.toLowerCase(), {
        symbol: v.symbol,
        asset: (v.asset || "").toLowerCase(),
      });
    }
  }
  return lookup;
}

/** Resolve asset symbol from known tokens or vault symbol fallback. */
function resolveAssetSymbol(assetAddr: string, vaultSymbol?: string): { symbol: string; decimals: number } {
  const tokenMeta = KNOWN_TOKENS[assetAddr] || { symbol: "???", decimals: 18 };
  if (tokenMeta.symbol !== "???" || !vaultSymbol) return tokenMeta;

  const match = vaultSymbol.match(/^e([A-Z]+)/i);
  return {
    symbol: match ? match[1].toUpperCase() : tokenMeta.symbol,
    decimals: tokenMeta.decimals,
  };
}

/** Resolve collateral list for a vault, filtering by on-chain LTV validity. */
function resolveCollaterals(
  rawCollaterals: string[] | undefined,
  vaultAddr: string,
  validLtvPairs: Set<string>,
  vaultInfoLookup: Map<string, { symbol: string; asset: string }>,
): CollateralInfo[] {
  if (!Array.isArray(rawCollaterals)) return [];

  return rawCollaterals
    .filter((collateralAddr: string) =>
      validLtvPairs.has(`${vaultAddr}:${collateralAddr.toLowerCase()}`),
    )
    .map((collateralAddr: string) => {
      const addr = collateralAddr.toLowerCase();
      const vaultInfo = vaultInfoLookup.get(addr);
      const vaultSymbol = vaultInfo?.symbol || "???";
      return {
        vaultAddress: addr,
        vaultSymbol,
        tokenSymbol: extractTokenFromVaultSymbol(vaultSymbol),
        tokenAddress: vaultInfo?.asset || "",
      };
    });
}

/** Normalize a single raw subgraph vault into the API response shape. */
function normalizeVault(
  v: any,
  validLtvPairs: Set<string>,
  vaultInfoLookup: Map<string, { symbol: string; asset: string }>,
): EulerVaultResponse {
  const assetAddr = (v.asset || "").toLowerCase();
  const { symbol: assetSymbol, decimals } = resolveAssetSymbol(assetAddr, v.symbol);
  const divisor = Math.pow(10, decimals);

  const totalBorrows = parseFloat(v.state?.totalBorrows || "0") / divisor;
  const cash = parseFloat(v.state?.cash || "0") / divisor;
  const totalSupply = cash + totalBorrows;
  const utilization = totalSupply > 0 ? totalBorrows / totalSupply : 0;

  const vaultAddr = (v.id || "").toLowerCase();
  const collaterals = resolveCollaterals(v.collaterals, vaultAddr, validLtvPairs, vaultInfoLookup);

  const borrowCapRaw = parseFloat(v.borrowCap || "0");
  const borrowCap = borrowCapRaw > 0 ? borrowCapRaw : null;
  const availableBorrowCapacity = borrowCap !== null ? Math.max(0, borrowCap - totalBorrows) : null;

  return {
    id: v.id,
    address: v.id,
    name: v.name || "Unknown Vault",
    symbol: v.symbol || "???",
    asset: { address: assetAddr, symbol: assetSymbol, decimals },
    totalSupply: totalSupply.toString(),
    totalBorrows: totalBorrows.toString(),
    borrowCap: borrowCap?.toString() ?? null,
    availableBorrowCapacity: availableBorrowCapacity?.toString() ?? null,
    // APY values are in RAY format (1e27) - convert to decimal (0.05 = 5%)
    supplyApy: parseFloat(v.state?.supplyApy || "0") / 1e27,
    borrowApy: parseFloat(v.state?.borrowApy || "0") / 1e27,
    utilization,
    collateralCount: collaterals.length,
    collaterals,
    creator: v.creator || "",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  const { chainId: chainIdStr } = await params;
  const chainId = parseInt(chainIdStr, 10);

  const searchParams = request.nextUrl.searchParams;

  // For hardhat (31337), use forkChainId param to determine which chain's subgraph to query
  // RPC calls go to localhost, but subgraph data comes from the forked chain
  const forkChainId = chainId === 31337
    ? parseInt(searchParams.get("forkChainId") || "42161", 10)
    : chainId;

  const subgraphUrl = EULER_SUBGRAPH_URLS[forkChainId];
  if (!subgraphUrl) {
    return NextResponse.json(
      { error: `Chain ${forkChainId} not supported for Euler V2` },
      { status: 400 }
    );
  }

  const first = Math.min(parseInt(searchParams.get("first") || "100"), 500);
  const skip = parseInt(searchParams.get("skip") || "0");
  const search = searchParams.get("search")?.toLowerCase();

  try {
    const vaultInfoLookup = await fetchVaultInfoLookup(subgraphUrl);

    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: VAULTS_QUERY, variables: { first, skip } }),
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.error(`[euler/vaults] Subgraph error: ${response.status}`);
      return NextResponse.json({ error: "Failed to fetch vaults from subgraph" }, { status: 502 });
    }

    const data = await response.json();
    if (data.errors) {
      console.error("[euler/vaults] GraphQL errors:", data.errors);
      return NextResponse.json({ error: "GraphQL query failed", details: data.errors }, { status: 500 });
    }

    const vaults = (data.data?.eulerVaults || []).filter(
      (v: any) => parseFloat(v.state?.totalShares || "0") > 0,
    );

    const vaultAddresses = vaults.map((v: any) => (v.id || "").toLowerCase());
    const validLtvPairs = await getValidCollaterals(chainId, vaultAddresses);
    console.log(`[euler/vaults] LTV check: ${validLtvPairs.size} valid (vault:collateral) pairs found`);

    const normalized = vaults.map((v: any) => normalizeVault(v, validLtvPairs, vaultInfoLookup));

    let filteredVaults = normalized;
    if (search) {
      filteredVaults = normalized.filter((v: EulerVaultResponse) =>
        v.name.toLowerCase().includes(search) ||
        v.symbol.toLowerCase().includes(search) ||
        v.asset.symbol.toLowerCase().includes(search)
      );
    }

    filteredVaults.sort((a: EulerVaultResponse, b: EulerVaultResponse) =>
      parseFloat(b.totalSupply) - parseFloat(a.totalSupply),
    );

    return NextResponse.json({ vaults: filteredVaults });
  } catch (error) {
    console.error("[euler/vaults] Error:", error);
    return NextResponse.json({ error: "Failed to fetch vaults" }, { status: 500 });
  }
}
