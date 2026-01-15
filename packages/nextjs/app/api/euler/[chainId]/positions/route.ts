import { NextRequest, NextResponse } from "next/server";

/**
 * Euler V2 Positions API
 *
 * Fetches user positions from the Euler V2 subgraph.
 * Uses the trackingActiveAccount query to get deposits and borrows.
 */

// Euler subgraph endpoints by chain
const EULER_SUBGRAPH_URLS: Record<number, string> = {
  // Ethereum Mainnet
  1: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn",
  // Arbitrum
  42161: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-arbitrum/latest/gn",
  // Base
  8453: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-base/latest/gn",
  // Optimism
  10: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-optimism/latest/gn",
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
const VAULT_DETAILS_QUERY = `
  query VaultDetails($vaultIds: [ID!]!) {
    eulerVaults(where: { id_in: $vaultIds }) {
      id
      name
      symbol
      asset {
        id
        symbol
        decimals
      }
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
 * Create a position response object from vault data
 */
function createPositionFromVault(vault: any, hasSupply: boolean, hasDebt: boolean): EulerPositionResponse {
  return {
    vault: {
      address: vault.id,
      name: vault.name || "Unknown",
      symbol: vault.symbol || "???",
      asset: {
        address: vault.asset?.id || "",
        symbol: vault.asset?.symbol || "???",
        decimals: vault.asset?.decimals || 18,
      },
      supplyApy: parseFloat(vault.state?.supplyApy || "0"),
      borrowApy: parseFloat(vault.state?.borrowApy || "0"),
    },
    supplyShares: hasSupply ? "1" : "0", // Placeholder - actual shares would need separate query
    borrowShares: hasDebt ? "1" : "0",
  };
}

/**
 * Build positions from deposit and borrow entries with vault data
 */
function buildPositions(
  depositEntries: { vault: string }[],
  borrowEntries: { vault: string }[],
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

  const subgraphUrl = EULER_SUBGRAPH_URLS[chainId];
  if (!subgraphUrl) {
    return NextResponse.json(
      { error: `Chain ${chainId} not supported for Euler V2` },
      { status: 400 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
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
      console.error("[euler/positions] GraphQL errors:", positionsData.errors);
      return NextResponse.json(
        { error: "GraphQL query failed", details: positionsData.errors },
        { status: 500 }
      );
    }

    const account = positionsData.data?.trackingActiveAccount;

    // If no account found, return empty positions
    if (!account) {
      return NextResponse.json({ positions: [] });
    }

    // Parse deposit and borrow entries
    const depositEntries = parsePositionEntries(account.deposits || []);
    const borrowEntries = parsePositionEntries(account.borrows || []);

    // Collect unique vault addresses
    const vaultAddresses = new Set<string>();
    depositEntries.forEach(e => vaultAddresses.add(e.vault.toLowerCase()));
    borrowEntries.forEach(e => vaultAddresses.add(e.vault.toLowerCase()));

    if (vaultAddresses.size === 0) {
      return NextResponse.json({ positions: [] });
    }

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
    const vaults = vaultDetailsData.data?.eulerVaults || [];

    // Create vault lookup map
    const vaultMap = new Map<string, any>();
    vaults.forEach((v: any) => vaultMap.set(v.id.toLowerCase(), v));

    // Build positions with vault details
    const positions = buildPositions(depositEntries, borrowEntries, vaultMap);

    return NextResponse.json({ positions });
  } catch (error) {
    console.error("[euler/positions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
