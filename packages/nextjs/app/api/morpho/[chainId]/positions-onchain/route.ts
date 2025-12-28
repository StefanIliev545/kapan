import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, Address, Hex, Chain } from "viem";
import { base, arbitrum } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

// ============ Types ============

interface MorphoMarketAsset {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
}

interface MorphoMarketState {
  supplyAssets: number;
  borrowAssets: number;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  liquidityAssets?: number;
  liquidityAssetsUsd?: number;
  supplyAssetsUsd?: number;
  borrowAssetsUsd?: number;
}

interface MorphoMarket {
  id: string;
  uniqueKey: string;
  collateralAsset: MorphoMarketAsset | null;
  loanAsset: MorphoMarketAsset;
  oracle: { address: string } | null;
  irmAddress: string;
  lltv: string;
  state: MorphoMarketState;
}

interface MorphoPosition {
  market: MorphoMarket;
  supplyShares: string;
  supplyAssets: number;
  borrowShares: string;
  borrowAssets: number;
  collateral: number;
  healthFactor: number | null;
}

interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

// On-chain position can be returned as either an object or tuple array
// depending on how viem decodes the struct
type OnChainPositionTuple = [
  Hex,    // marketId
  Address, // loanToken
  Address, // collateralToken
  bigint,  // collateralBalance
  bigint,  // borrowBalance
  bigint,  // supplyBalance
  bigint,  // collateralValueUsd
  bigint,  // borrowValueUsd
  bigint,  // currentLtv
  bigint,  // maxLtv
  bigint,  // healthFactor
  boolean  // isHealthy
];

interface OnChainPositionObject {
  marketId: Hex;
  loanToken: Address;
  collateralToken: Address;
  collateralBalance: bigint;
  borrowBalance: bigint;
  supplyBalance: bigint;
  collateralValueUsd: bigint;
  borrowValueUsd: bigint;
  currentLtv: bigint;
  maxLtv: bigint;
  healthFactor: bigint;
  isHealthy: boolean;
}

type OnChainPosition = OnChainPositionTuple | OnChainPositionObject;

// Helper to normalize position data whether it's array or object
function normalizePosition(pos: OnChainPosition): OnChainPositionObject {
  if (Array.isArray(pos)) {
    return {
      marketId: pos[0],
      loanToken: pos[1],
      collateralToken: pos[2],
      collateralBalance: pos[3],
      borrowBalance: pos[4],
      supplyBalance: pos[5],
      collateralValueUsd: pos[6],
      borrowValueUsd: pos[7],
      currentLtv: pos[8],
      maxLtv: pos[9],
      healthFactor: pos[10],
      isHealthy: pos[11],
    };
  }
  return pos;
}

// ============ Constants ============

const MORPHO_GRAPHQL_API = "https://blue-api.morpho.org/graphql";
const BATCH_SIZE = 100; // Markets per on-chain call
const MAX_HEALTH_FACTOR = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// Chain configurations
const CHAIN_CONFIG: Record<number, { chain: Chain; rpcUrl?: string }> = {
  8453: { chain: base },
  42161: { chain: arbitrum },
};

// Get MorphoBlueGatewayView address and ABI for a chain
function getGatewayConfig(chainId: number) {
  const contracts = deployedContracts as Record<number, Record<string, { address: string; abi: any[] }>>;
  const chainContracts = contracts[chainId];
  if (!chainContracts?.MorphoBlueGatewayView) {
    return null;
  }
  return {
    address: chainContracts.MorphoBlueGatewayView.address as Address,
    abi: chainContracts.MorphoBlueGatewayView.abi,
  };
}

// ============ GraphQL Queries ============

// Query to get all whitelisted markets (these should include the major ones)
const WHITELISTED_MARKETS_QUERY = `
  query WhitelistedMarkets($chainId: Int!, $first: Int!) {
    markets(
      first: $first
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: { 
        chainId_in: [$chainId]
        whitelisted: true
      }
    ) {
      items {
        id
        uniqueKey
        collateralAsset {
          address
          symbol
          decimals
          priceUsd
        }
        loanAsset {
          address
          symbol
          decimals
          priceUsd
        }
        oracle {
          address
        }
        irmAddress
        lltv
        state {
          supplyAssets
          borrowAssets
          utilization
          supplyApy
          borrowApy
          liquidityAssetsUsd
          supplyAssetsUsd
          borrowAssetsUsd
        }
      }
    }
  }
`;

const USER_POSITIONS_QUERY = `
  query GetUserPositions($userAddress: String!, $chainId: Int!) {
    userByAddress(address: $userAddress, chainId: $chainId) {
      address
      marketPositions {
        market {
          id
          uniqueKey
          collateralAsset {
            address
            symbol
            decimals
            priceUsd
          }
          loanAsset {
            address
            symbol
            decimals
            priceUsd
          }
          oracle {
            address
          }
          irmAddress
          lltv
          state {
            supplyAssets
            borrowAssets
            utilization
            supplyApy
            borrowApy
          }
        }
        supplyShares
        supplyAssets
        borrowShares
        borrowAssets
        collateral
        healthFactor
      }
    }
  }
`;

// ============ Helpers ============

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function marketToParams(market: MorphoMarket): MarketParams {
  return {
    loanToken: market.loanAsset.address as Address,
    collateralToken: (market.collateralAsset?.address || "0x0000000000000000000000000000000000000000") as Address,
    oracle: (market.oracle?.address || "0x0000000000000000000000000000000000000000") as Address,
    irm: market.irmAddress as Address,
    lltv: BigInt(market.lltv),
  };
}

function convertOnChainToPosition(
  rawPos: OnChainPosition,
  market: MorphoMarket,
): MorphoPosition | null {
  // Normalize in case viem returns array instead of object
  const pos = normalizePosition(rawPos);
  
  // Convert to BigInt to handle both bigint and string returns from viem
  const collateralBalance = BigInt(pos.collateralBalance || 0);
  const borrowBalance = BigInt(pos.borrowBalance || 0);
  const supplyBalance = BigInt(pos.supplyBalance || 0);

  // Skip positions with no balance
  if (collateralBalance === 0n && borrowBalance === 0n && supplyBalance === 0n) {
    return null;
  }

  // Health factor: max value means no debt (infinite health)
  let healthFactor: number | null = null;
  const hf = BigInt(pos.healthFactor || 0);
  if (hf !== MAX_HEALTH_FACTOR && borrowBalance > 0n) {
    healthFactor = Number(hf) / 1e18;
  }

  return {
    market,
    supplyShares: "0", // Not available from on-chain call, but not needed for display
    supplyAssets: Number(supplyBalance),
    borrowShares: "0",
    borrowAssets: Number(borrowBalance),
    collateral: Number(collateralBalance),
    healthFactor,
  };
}

// ============ API Functions ============

async function fetchMarkets(chainId: number): Promise<MorphoMarket[]> {
  try {
    // Fetch whitelisted markets from GraphQL (filters out spam like GMORPHO)
    // The whitelisted filter ensures we get the real, legitimate markets
    const response = await fetch(MORPHO_GRAPHQL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: WHITELISTED_MARKETS_QUERY,
        variables: { chainId, first: 500 },
      }),
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    const data = await response.json();
    if (data.errors) {
      console.error("[positions-onchain] GraphQL markets error:", data.errors);
      return [];
    }

    return data.data?.markets?.items || [];
  } catch (error) {
    console.error("[positions-onchain] Failed to fetch markets:", error);
    return [];
  }
}

async function fetchGraphQLPositions(
  chainId: number,
  userAddress: string
): Promise<MorphoPosition[]> {
  try {
    const response = await fetch(MORPHO_GRAPHQL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: USER_POSITIONS_QUERY,
        variables: {
          chainId,
          userAddress: userAddress.toLowerCase(),
        },
      }),
    });

    const data = await response.json();
    if (data.errors) {
      console.error("[positions-onchain] GraphQL positions error:", data.errors);
      return [];
    }

    return data.data?.userByAddress?.marketPositions || [];
  } catch (error) {
    console.error("[positions-onchain] Failed to fetch GraphQL positions:", error);
    return [];
  }
}

async function fetchOnChainPositions(
  chainId: number,
  userAddress: string,
  markets: MorphoMarket[]
): Promise<Map<string, OnChainPosition>> {
  const gatewayConfig = getGatewayConfig(chainId);
  if (!gatewayConfig) {
    console.warn(`[positions-onchain] No gateway deployed for chain ${chainId}`);
    return new Map();
  }

  const chainConfig = CHAIN_CONFIG[chainId];
  if (!chainConfig) {
    console.warn(`[positions-onchain] Unsupported chain ${chainId}`);
    return new Map();
  }

  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl),
  });

  const positionsMap = new Map<string, OnChainPosition>();

  // Batch markets into chunks
  const chunks = chunkArray(markets, BATCH_SIZE);

  // Process chunks in parallel
  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      try {
        const marketParams = chunk.map(marketToParams);
        
        const positions = await client.readContract({
          address: gatewayConfig.address,
          abi: gatewayConfig.abi,
          functionName: "getPositionsForMarkets",
          args: [marketParams, userAddress as Address],
        }) as OnChainPosition[];

        return { chunk, positions };
      } catch (error) {
        console.error(`[positions-onchain] Batch failed:`, error);
        return { chunk, positions: [] };
      }
    })
  );

  // Collect results
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.positions) {
      const { chunk, positions } = result.value;
      
      positions.forEach((pos, i) => {
        const market = chunk[i];
        if (market) {
          // Use the returned marketId as key since it's computed on-chain
          const normalized = normalizePosition(pos);
          positionsMap.set(normalized.marketId.toLowerCase(), pos);
        }
      });
    }
  }

  return positionsMap;
}

// ============ Main Handler ============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  const { chainId: chainIdStr } = await params;
  const chainId = parseInt(chainIdStr, 10);

  if (!Number.isFinite(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  }

  const userAddress = request.nextUrl.searchParams.get("user");
  if (!userAddress) {
    return NextResponse.json({ error: "Missing user address" }, { status: 400 });
  }

  const debug = request.nextUrl.searchParams.get("debug") === "true";

  try {
    // Fetch whitelisted markets and GraphQL positions in parallel
    const [markets, graphQLPositions] = await Promise.all([
      fetchMarkets(chainId),
      fetchGraphQLPositions(chainId, userAddress),
    ]);
    
    if (debug) {
      console.log(`[positions-onchain] Fetched ${markets.length} whitelisted markets, ${graphQLPositions.length} GraphQL positions`);
    }
    
    // Build market lookup by uniqueKey (lowercase for consistent matching)
    const marketByKey = new Map<string, MorphoMarket>();
    for (const m of markets) {
      marketByKey.set(m.uniqueKey.toLowerCase(), m);
    }
    
    // Add markets from GraphQL positions that aren't in our main list
    // This ensures we query on-chain for markets the user has positions in
    for (const pos of graphQLPositions) {
      const key = pos.market.uniqueKey.toLowerCase();
      if (!marketByKey.has(key)) {
        marketByKey.set(key, pos.market);
      }
    }
    
    // Use the combined markets list for on-chain query
    const allMarkets = Array.from(marketByKey.values());

    // Fetch on-chain positions for all markets
    const onChainPositions = await fetchOnChainPositions(chainId, userAddress, allMarkets);

    if (debug) {
      // Count non-zero positions
      let nonZeroCount = 0;
      for (const [key, pos] of onChainPositions) {
        const normalized = normalizePosition(pos);
        const col = BigInt(normalized.collateralBalance || 0);
        const bor = BigInt(normalized.borrowBalance || 0);
        const sup = BigInt(normalized.supplyBalance || 0);
        if (col > 0n || bor > 0n || sup > 0n) {
          nonZeroCount++;
          console.log(`[positions-onchain] Position: ${key.slice(0, 20)}... col=${col}, bor=${bor}, sup=${sup}`);
        }
      }
      console.log(`[positions-onchain] Found ${nonZeroCount} non-zero positions from ${onChainPositions.size} markets`);
    }

    // Merge positions: on-chain takes priority, GraphQL fills gaps
    const mergedPositions = new Map<string, MorphoPosition>();

    // First, add all on-chain positions (source of truth for balances)
    for (const [uniqueKey, onChainPos] of onChainPositions) {
      const market = marketByKey.get(uniqueKey);
      if (!market) continue;

      const position = convertOnChainToPosition(onChainPos, market);
      if (position) {
        mergedPositions.set(uniqueKey, position);
      }
    }

    // Then, add GraphQL positions for markets we don't have on-chain data for
    for (const gqlPos of graphQLPositions) {
      const uniqueKey = gqlPos.market.uniqueKey.toLowerCase();
      
      // Skip if we already have on-chain data for this market
      if (mergedPositions.has(uniqueKey)) continue;

      // Only add if there's actually a position
      if (gqlPos.collateral > 0 || gqlPos.borrowAssets > 0 || gqlPos.supplyAssets > 0) {
        mergedPositions.set(uniqueKey, gqlPos);
      }
    }

    const positions = Array.from(mergedPositions.values());

    // Return in the same format as the existing GraphQL endpoint
    return NextResponse.json({
      userByAddress: {
        address: userAddress.toLowerCase(),
        marketPositions: positions,
      },
    });

  } catch (error) {
    console.error("[positions-onchain] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
