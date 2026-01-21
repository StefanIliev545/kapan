import { NextRequest, NextResponse } from "next/server";

/**
 * Euler V2 Positions API
 *
 * Fetches user positions from the Euler V2 subgraph.
 * Uses the trackingActiveAccount query to get deposits and borrows.
 *
 * Euler V2 Architecture:
 * - Each address has 256 sub-accounts (via EVC)
 * - Each sub-account can have 1 controller (debt vault) + N collaterals
 * - Positions are grouped by sub-account for display
 */

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

// Query for user positions via trackingActiveAccount
const POSITIONS_QUERY = `
  query Positions($user: ID!) {
    trackingActiveAccount(id: $user) {
      mainAddress
      deposits
      borrows
    }
  }
`;

// Query for vault details (used to enrich position data)
// Note: `asset` is returned as an address string, not an object
const VAULT_DETAILS_QUERY = `
  query VaultDetails($vaultIds: [ID!]!) {
    eulerVaults(where: { id_in: $vaultIds }) {
      id
      name
      symbol
      asset
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
  "0x35751007a407ca6feffe80b3cb397736d2cf4dbe": { symbol: "weETH", decimals: 18 },
  "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8": { symbol: "rETH", decimals: 18 },
};

// Extract token symbol from vault symbol (e.g., "eWETH-1" -> "WETH", "esUSDS-1" -> "sUSDS")
function extractTokenFromVaultSymbol(vaultSymbol: string): string {
  const match = vaultSymbol.match(/^e(.+?)-\d+$/);
  if (match) {
    return match[1];
  }
  return vaultSymbol.startsWith('e') ? vaultSymbol.slice(1) : vaultSymbol;
}

// Vault info for both collateral and debt positions
export interface EulerVaultInfo {
  address: string;
  name: string;
  symbol: string;
  asset: {
    address: string;
    symbol: string;
    decimals: number;
  };
  supplyApy: number;
  borrowApy: number;
}

// A collateral position within a sub-account
export interface EulerCollateralPosition {
  vault: EulerVaultInfo;
  // Note: shares/balance would need separate on-chain query for accuracy
}

// A grouped position representing one sub-account
// Each sub-account has at most 1 debt + N collaterals
export interface EulerPositionGroup {
  subAccount: string; // The sub-account address
  isMainAccount: boolean; // True if this is sub-account 0
  debt: {
    vault: EulerVaultInfo;
  } | null;
  collaterals: EulerCollateralPosition[];
}

// Legacy format for backwards compatibility
export interface EulerPositionResponse {
  vault: {
    address: string;
    name: string;
    symbol: string;
    asset: {
      address: string;
      symbol: string;
      decimals: number;
    };
    supplyApy: number;
    borrowApy: number;
  };
  supplyShares: string;
  borrowShares: string;
}

/**
 * Parse position entries from subgraph response.
 * Entries are formatted as `${subAccountAddress}${vaultAddress}` (42 + 40 hex chars)
 */
function parsePositionEntries(entries: string[]): { subAccount: string; vault: string }[] {
  return entries
    .filter(entry => entry && entry.length >= 82) // 0x + 40 + 40
    .map(entry => ({
      subAccount: entry.slice(0, 42), // First 42 chars (0x + 40)
      vault: "0x" + entry.slice(42),  // Last 40 chars with 0x prefix
    }));
}

/**
 * Check if a sub-account is the main account (sub-account 0)
 * In EVC, sub-accounts have the same first 19 bytes, with last byte being the index
 */
function isMainAccount(subAccount: string, mainAddress: string): boolean {
  // Main account has last byte = 0x00
  return subAccount.toLowerCase() === mainAddress.toLowerCase();
}

/**
 * Create vault info from subgraph vault data
 */
function createVaultInfo(vault: any): EulerVaultInfo {
  // Asset is returned as an address string, not an object
  const assetAddr = (vault.asset || "").toLowerCase();
  const knownToken = KNOWN_TOKENS[assetAddr];

  // Try to get symbol from known tokens, then from vault symbol extraction
  let assetSymbol = knownToken?.symbol;
  if (!assetSymbol && vault.symbol) {
    assetSymbol = extractTokenFromVaultSymbol(vault.symbol);
  }
  assetSymbol = assetSymbol || "???";

  const decimals = knownToken?.decimals ?? 18;

  return {
    address: vault.id,
    name: vault.name || "Unknown",
    symbol: vault.symbol || "???",
    asset: {
      address: assetAddr,
      symbol: assetSymbol,
      decimals,
    },
    supplyApy: parseFloat(vault.state?.supplyApy || "0") / 1e27, // RAY to decimal
    borrowApy: parseFloat(vault.state?.borrowApy || "0") / 1e27,
  };
}

/**
 * Create a position response object from vault data (legacy format)
 */
function createPositionFromVault(vault: any, hasSupply: boolean, hasDebt: boolean): EulerPositionResponse {
  // Asset is returned as an address string, not an object
  const assetAddr = (vault.asset || "").toLowerCase();
  const knownToken = KNOWN_TOKENS[assetAddr];

  // Try to get symbol from known tokens, then from vault symbol extraction
  let assetSymbol = knownToken?.symbol;
  if (!assetSymbol && vault.symbol) {
    assetSymbol = extractTokenFromVaultSymbol(vault.symbol);
  }
  assetSymbol = assetSymbol || "???";

  const decimals = knownToken?.decimals ?? 18;

  return {
    vault: {
      address: vault.id,
      name: vault.name || "Unknown",
      symbol: vault.symbol || "???",
      asset: {
        address: assetAddr,
        symbol: assetSymbol,
        decimals,
      },
      supplyApy: parseFloat(vault.state?.supplyApy || "0") / 1e27, // RAY to decimal
      borrowApy: parseFloat(vault.state?.borrowApy || "0") / 1e27,
    },
    supplyShares: hasSupply ? "1" : "0", // Placeholder - actual shares would need separate query
    borrowShares: hasDebt ? "1" : "0",
  };
}

/**
 * Build grouped positions from deposit and borrow entries
 * Groups by sub-account: each group has 1 debt + N collaterals
 */
function buildPositionGroups(
  depositEntries: { subAccount: string; vault: string }[],
  borrowEntries: { subAccount: string; vault: string }[],
  vaultMap: Map<string, any>,
  mainAddress: string
): EulerPositionGroup[] {
  // Group by sub-account
  const subAccountMap = new Map<string, { deposits: string[]; borrows: string[] }>();

  for (const entry of depositEntries) {
    const key = entry.subAccount.toLowerCase();
    if (!subAccountMap.has(key)) {
      subAccountMap.set(key, { deposits: [], borrows: [] });
    }
    subAccountMap.get(key)!.deposits.push(entry.vault.toLowerCase());
  }

  for (const entry of borrowEntries) {
    const key = entry.subAccount.toLowerCase();
    if (!subAccountMap.has(key)) {
      subAccountMap.set(key, { deposits: [], borrows: [] });
    }
    subAccountMap.get(key)!.borrows.push(entry.vault.toLowerCase());
  }

  // Build position groups
  const groups: EulerPositionGroup[] = [];

  for (const [subAccount, { deposits, borrows }] of subAccountMap) {
    // Each sub-account can only have 1 borrow (controller)
    const borrowVaultAddr = borrows[0]; // Should only be one
    const borrowVault = borrowVaultAddr ? vaultMap.get(borrowVaultAddr) : null;

    // All deposits in this sub-account are collaterals
    const collaterals: EulerCollateralPosition[] = deposits
      .map(addr => vaultMap.get(addr))
      .filter(Boolean)
      .map(vault => ({ vault: createVaultInfo(vault) }));

    // Only include groups that have either debt or collateral
    if (borrowVault || collaterals.length > 0) {
      groups.push({
        subAccount,
        isMainAccount: isMainAccount(subAccount, mainAddress),
        debt: borrowVault ? { vault: createVaultInfo(borrowVault) } : null,
        collaterals,
      });
    }
  }

  // Sort: main account first, then by sub-account address
  groups.sort((a, b) => {
    if (a.isMainAccount && !b.isMainAccount) return -1;
    if (!a.isMainAccount && b.isMainAccount) return 1;
    return a.subAccount.localeCompare(b.subAccount);
  });

  return groups;
}

/**
 * Build positions from deposit and borrow entries with vault data (legacy format)
 */
function buildPositions(
  depositEntries: { subAccount: string; vault: string }[],
  borrowEntries: { subAccount: string; vault: string }[],
  vaultMap: Map<string, any>
): EulerPositionResponse[] {
  const positions: EulerPositionResponse[] = [];
  const processedVaults = new Set<string>();

  // Process deposits
  for (const entry of depositEntries) {
    const vault = vaultMap.get(entry.vault.toLowerCase());
    if (!vault) continue;

    const vaultKey = entry.vault.toLowerCase();
    if (!processedVaults.has(vaultKey)) {
      processedVaults.add(vaultKey);
      positions.push(createPositionFromVault(vault, true, false));
    }
  }

  // Process borrows (update existing or create new)
  for (const entry of borrowEntries) {
    const vault = vaultMap.get(entry.vault.toLowerCase());
    if (!vault) continue;

    const vaultKey = entry.vault.toLowerCase();
    const existingIdx = positions.findIndex(p => p.vault.address.toLowerCase() === vaultKey);

    if (existingIdx >= 0) {
      positions[existingIdx].borrowShares = "1";
    } else {
      positions.push(createPositionFromVault(vault, false, true));
    }
  }

  return positions;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  const { chainId: chainIdStr } = await params;
  const chainId = parseInt(chainIdStr, 10);

  const searchParams = request.nextUrl.searchParams;

  // For hardhat (31337), use forkChainId param to determine which chain's subgraph to query
  const forkChainId = chainId === 31337
    ? parseInt(searchParams.get("forkChainId") || "42161", 10) // Default to Arbitrum
    : chainId;

  const subgraphUrl = EULER_SUBGRAPH_URLS[forkChainId];
  if (!subgraphUrl) {
    return NextResponse.json(
      { error: `Chain ${forkChainId} not supported for Euler V2` },
      { status: 400 }
    );
  }

  const userAddress = searchParams.get("user")?.toLowerCase();

  if (!userAddress) {
    return NextResponse.json(
      { error: "Missing user address parameter" },
      { status: 400 }
    );
  }

  try {
    // Fetch user's active account data
    const positionsResponse = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: POSITIONS_QUERY,
        variables: { user: userAddress },
      }),
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!positionsResponse.ok) {
      console.error(`[euler/positions] Subgraph error: ${positionsResponse.status}`);
      return NextResponse.json(
        { error: "Failed to fetch positions from subgraph" },
        { status: 502 }
      );
    }

    const positionsData = await positionsResponse.json();

    if (positionsData.errors) {
      console.error("[euler/positions] Positions query GraphQL errors:", JSON.stringify(positionsData.errors));
      return NextResponse.json(
        { error: "GraphQL query failed", details: positionsData.errors },
        { status: 500 }
      );
    }

    console.log("[euler/positions] Positions query response:", JSON.stringify(positionsData.data));

    const account = positionsData.data?.trackingActiveAccount;

    // If no account found, return empty positions
    if (!account) {
      return NextResponse.json({ positions: [], positionGroups: [] });
    }

    const mainAddress = account.mainAddress || userAddress;

    // Parse deposit and borrow entries
    const depositEntries = parsePositionEntries(account.deposits || []);
    const borrowEntries = parsePositionEntries(account.borrows || []);

    // Collect unique vault addresses (keep original case for query, subgraph may require it)
    const vaultAddresses = new Set<string>();
    depositEntries.forEach(e => vaultAddresses.add(e.vault));
    borrowEntries.forEach(e => vaultAddresses.add(e.vault));

    if (vaultAddresses.size === 0) {
      return NextResponse.json({ positions: [], positionGroups: [] });
    }

    console.log("[euler/positions] Querying vault details for:", Array.from(vaultAddresses));

    // Fetch vault details
    const vaultDetailsResponse = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: VAULT_DETAILS_QUERY,
        variables: { vaultIds: Array.from(vaultAddresses) },
      }),
    });

    const vaultDetailsData = await vaultDetailsResponse.json();

    if (vaultDetailsData.errors) {
      console.error("[euler/positions] Vault details GraphQL errors:", vaultDetailsData.errors);
    }

    const vaults = vaultDetailsData.data?.eulerVaults || [];
    console.log("[euler/positions] Found", vaults.length, "vaults from query");

    // Create vault lookup map
    const vaultMap = new Map<string, any>();
    vaults.forEach((v: any) => vaultMap.set(v.id.toLowerCase(), v));

    // Build legacy positions format (for backwards compatibility)
    const positions = buildPositions(depositEntries, borrowEntries, vaultMap);

    // Build grouped positions (new format: 1 debt + N collaterals per sub-account)
    const positionGroups = buildPositionGroups(depositEntries, borrowEntries, vaultMap, mainAddress);

    return NextResponse.json({ positions, positionGroups });
  } catch (error) {
    console.error("[euler/positions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
