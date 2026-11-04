import { NextRequest, NextResponse } from "next/server";
import { MORPHO_GRAPHQL_API } from "~~/utils/constants";
import { normalizeMorphoAsset, readMorphoGraphQLItems, type MorphoApiAsset } from "~~/utils/morpho/graphql";

// Optimized query with server-side filtering support
// Key filters: utilization_lte, supplyAssetsUsd_gte reduce junk at API level
// NOTE: Morpho API migrated from "whitelisted" to "listed" (dynamic listing via vaults).
// See: https://docs.morpho.org/tools/offchain/api/get-started/
const QUERY_MARKETS = `
  query Markets(
    $first: Int,
    $skip: Int,
    $chainId: Int!,
    $listed: Boolean,
    $utilizationMax: Float,
    $minSupplyUsd: Float,
    $search: String
  ) {
    markets(
      first: $first
      skip: $skip
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: {
        chainId_in: [$chainId]
        listed: $listed
        utilization_lte: $utilizationMax
        supplyAssetsUsd_gte: $minSupplyUsd
        search: $search
      }
    ) {
      items {
        marketId
        listed
        warnings {
          type
          level
        }
        supplyingVaults {
          address
          name
          listed
          state {
            totalAssetsUsd
          }
        }
        collateralAsset {
          address
          symbol
          decimals
          price { usd }
        }
        loanAsset {
          address
          symbol
          decimals
          price { usd }
        }
        oracle {
          address
          type
        }
        irmAddress
        lltv
        state {
          supplyApy
          borrowApy
          utilization
          liquidityAssetsUsd
          supplyAssetsUsd
          borrowAssetsUsd
        }
      }
    }
  }
`;

interface MarketItem {
  marketId: string;
  uniqueKey: string;
  listed: boolean | string | number;
  collateralAsset: MorphoApiAsset | null;
  loanAsset: MorphoApiAsset;
  warnings?: {
    level?: string;
  }[];
  supplyingVaults?: {
    listed: boolean | string | number;
    state?: {
      totalAssetsUsd?: number | string;
    };
  }[];
  state?: {
    liquidityAssetsUsd?: number;
    supplyApy?: number;
    borrowApy?: number;
    utilization?: number;
  };
}

const safeFloat = (n: unknown): number => {
  if (typeof n === "number") return Number.isFinite(n) ? n : 0;
  if (typeof n === "string") {
    const f = parseFloat(n);
    return Number.isFinite(f) ? f : 0;
  }
  return 0;
};

const normalizeUtilization = (val: unknown): number => {
  const n = safeFloat(val);
  return n > 1.5 ? n / 100 : n;
};

// Check for suspicious "G" tokens (like GMORPHO) that aren't listed
const isSuspiciousGToken = (m: MarketItem): boolean => {
  if (m?.listed) return false; // Listed tokens are safe
  
  const loanSym = (m?.loanAsset?.symbol || "").toUpperCase();
  const collSym = (m?.collateralAsset?.symbol || "").toUpperCase();
  
  // Filter out "G" prefixed tokens except GUSD
  if (loanSym.startsWith("G") && loanSym.length > 1 && loanSym !== "GUSD") return true;
  if (collSym.startsWith("G") && collSym.length > 1 && collSym !== "GUSD") return true;
  
  return false;
};

const hasMorphoTrustEvidence = (m: MarketItem): boolean => {
  const marketListed = m.listed === true || m.listed === "true" || m.listed === 1;
  if (marketListed) {
    return true;
  }
  return Array.isArray(m.supplyingVaults) && m.supplyingVaults.some(vault => {
    const vaultListed = vault.listed === true || vault.listed === "true" || vault.listed === 1;
    const vaultAssets = safeFloat(vault.state?.totalAssetsUsd);
    return vaultListed && vaultAssets > 10_000;
  });
};

// Trust Logic - relaxed when searching
const isMarketTrusted = (m: MarketItem, isSearching: boolean): boolean => {
  if (hasMorphoTrustEvidence(m)) {
    return true;
  }

  // 3. Pendle / Special Logic
  const loanSym = (m.loanAsset?.symbol || "").toUpperCase();
  const collSym = (m.collateralAsset?.symbol || "").toUpperCase();
  const isPendle = loanSym.startsWith("PT") || collSym.startsWith("PT") || 
                   loanSym.startsWith("YT") || collSym.startsWith("YT");
  if (isPendle) return true;

  // 4. SEARCH OVERRIDE:
  // If the user specifically searched for this token, show it even if it's not "Trusted"
  // (unless it has a critical RED warning).
  if (isSearching) return true;

  return false;
};

// --- Request parameter parsing ---

interface RequestParams {
  chainIdInt: number;
  search: string;
  searchLower: string;
  isSearching: boolean;
  curationMode: string;
  hideSaturated: boolean;
  showLowLiquidity: boolean;
  walletDiscovery: boolean;
  debug: boolean;
  targetCount: number;
  serverMinSupplyUsd: number;
  serverMaxUtilization: number;
  minLiquidity: number;
}

const parseRequestParams = (chainId: string, sp: URLSearchParams): RequestParams | null => {
  const chainIdInt = parseInt(chainId, 10);
  if (!Number.isFinite(chainIdInt) || chainIdInt <= 0) return null;

  const walletDiscovery = sp.get("walletDiscovery") === "true";
  const search = walletDiscovery ? "" : (sp.get("search") || "").trim();
  const isSearching = search.length > 0;
  const showLowLiquidity = walletDiscovery || sp.get("showLowLiquidity") === "true";
  const hideSaturated = showLowLiquidity ? false : sp.get("hideSaturated") === "true";

  return {
    chainIdInt,
    search,
    searchLower: search.toLowerCase(),
    isSearching,
    curationMode: walletDiscovery ? "curated" : (sp.get("curation") || "curated").toLowerCase(),
    hideSaturated,
    showLowLiquidity,
    walletDiscovery,
    debug: sp.get("debug") === "true",
    targetCount: walletDiscovery ? Number.POSITIVE_INFINITY : isSearching ? 200 : Math.min(parseInt(sp.get("first") || "1000", 10), 1500),
    // Low server-side floor to avoid hiding freshly listed markets with little supply yet.
    // Client-side minLiquidity handles stricter filtering.
    // When showLowLiquidity is on, drop the server floor to 0 to include near-empty markets.
    serverMinSupplyUsd: isSearching || showLowLiquidity ? 0 : 100,
    serverMaxUtilization: walletDiscovery ? 1 : hideSaturated ? 0.995 : 0.9999,
    minLiquidity: showLowLiquidity ? 0 : safeFloat(sp.get("minLiq") || sp.get("minLiquidityUsd") || "1000"),
  };
};

// --- GraphQL fetch helper ---

interface BatchResult {
  items: MarketItem[];
  hasMore: boolean;
}

/** Fetch a single page of markets from the Morpho GraphQL API with server-side filtering. */
const fetchMarketsBatch = async (
  skip: number,
  first: number,
  params: RequestParams,
  listed?: boolean,
  searchTerm?: string,
): Promise<BatchResult> => {
  const variables: Record<string, string | number | boolean> = {
    first,
    skip,
    chainId: params.chainIdInt,
    utilizationMax: params.serverMaxUtilization,
    minSupplyUsd: params.serverMinSupplyUsd,
  };

  if (listed !== undefined) {
    variables.listed = listed;
  }
  if (searchTerm) {
    variables.search = searchTerm;
  }

  const res = await fetch(MORPHO_GRAPHQL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY_MARKETS, variables }),
    next: { revalidate: listed ? 120 : 60 },
  });

  const rawItems = await readMorphoGraphQLItems<MarketItem>(res, "markets");

  // The API now keys markets by `marketId` (the `id`/`uniqueKey` fields were removed).
  // Alias it to `uniqueKey` so downstream map keys and the client response — which still
  // read `uniqueKey` — keep working unchanged.
  const items = rawItems.map((m: MarketItem) => ({
    ...m,
    uniqueKey: m.marketId,
    collateralAsset: m.collateralAsset ? normalizeMorphoAsset(m.collateralAsset) : null,
    loanAsset: normalizeMorphoAsset(m.loanAsset),
  }));
  return { items, hasMore: items.length === first };
};

// --- Client-side market filter ---

/** Check if a market has critical RED/HIGH-level warnings. */
const hasCriticalWarning = (m: MarketItem): boolean => {
  return Array.isArray(m.warnings) && m.warnings.some(
    (w) => ["RED", "HIGH"].includes(String(w?.level || "").toUpperCase()),
  );
};

/** Apply client-side quality filters after server-side filtering. */
const passesClientFilters = (m: MarketItem, params: RequestParams): boolean => {
  // When showLowLiquidity is on, skip the liquidity floor check entirely
  if (!params.showLowLiquidity) {
    // Listed markets get a lower liquidity floor since Morpho's listing logic
    // already provides curation (market must be in a listed vault).
    const isListed = m.listed === true || m.listed === "true";
    const effectiveMinLiquidity = isListed ? Math.min(params.minLiquidity, 100) : params.minLiquidity;
    if (safeFloat(m.state?.liquidityAssetsUsd) < effectiveMinLiquidity) return false;
  }

  const maxApy = params.isSearching ? 50.0 : 10.0;
  if (safeFloat(m.state?.supplyApy) > maxApy || safeFloat(m.state?.borrowApy) > maxApy) return false;

  const util = normalizeUtilization(m.state?.utilization);
  // When showLowLiquidity is on, also relax the utilization cap (show saturated markets)
  if (!params.showLowLiquidity && util > 0.99) return false;
  if (params.hideSaturated && util >= 0.995) return false;
  if (!params.isSearching && isSuspiciousGToken(m)) return false;
  if (hasCriticalWarning(m)) return false;

  return true;
};

const passesMarketTrust = (market: MarketItem, params: RequestParams, requireTrust: boolean): boolean => {
  if (params.walletDiscovery) {
    return hasMorphoTrustEvidence(market);
  }
  return !requireTrust || isMarketTrusted(market, params.isSearching);
};

// --- Paginated market fetching ---

const PAGE_SIZE = 200;
// 15 pages × 200 = 3,000 raw items per category before client-side filtering.
// Chains like Base have many listed markets, so we need headroom.
const MAX_PAGES = 15;

interface FetchCategoryOpts {
  params: RequestParams;
  allMarkets: Map<string, MarketItem>;
  listed: boolean;
  /** If true, apply trust check for non-listed markets */
  requireTrust: boolean;
}

/** Paginate through a market category, applying filters and optional trust checks. */
const fetchMarketCategory = async ({
  params, allMarkets, listed, requireTrust,
}: FetchCategoryOpts): Promise<void> => {
  let skip = 0;
  let hasMore = true;
  const searchTerm = params.isSearching ? params.search : undefined;

  while (hasMore && skip < PAGE_SIZE * MAX_PAGES && allMarkets.size < params.targetCount) {
    const batch = await fetchMarketsBatch(skip, PAGE_SIZE, params, listed, searchTerm);

    for (const m of batch.items) {
      if (allMarkets.has(m.uniqueKey)) continue;
      if (!passesClientFilters(m, params)) continue;
      if (!passesMarketTrust(m, params, requireTrust)) {
        continue;
      }
      allMarkets.set(m.uniqueKey, m);
    }

    hasMore = batch.hasMore && allMarkets.size < params.targetCount;
    skip += PAGE_SIZE;
  }
  if (params.walletDiscovery && hasMore) {
    throw new Error("Wallet market discovery exceeded its page limit");
  }
};

// --- Sorting ---

/** Lower score = higher relevance: 0 = exact match, 1 = starts with, 2 = other */
const searchRelevanceScore = (m: MarketItem, searchLower: string): number => {
  const loan = (m.loanAsset?.symbol || "").toLowerCase();
  const coll = (m.collateralAsset?.symbol || "").toLowerCase();
  if (loan === searchLower || coll === searchLower) return 0;
  if (loan.startsWith(searchLower) || coll.startsWith(searchLower)) return 1;
  return 2;
};

/** Sort markets: listed first, then by search relevance, then by liquidity. */
const sortMarkets = (markets: MarketItem[], params: RequestParams): MarketItem[] => {
  return markets.sort((a, b) => {
    const wlDiff = (b.listed ? 1 : 0) - (a.listed ? 1 : 0);
    if (wlDiff !== 0) return wlDiff;

    if (params.isSearching) {
      const rd = searchRelevanceScore(a, params.searchLower) - searchRelevanceScore(b, params.searchLower);
      if (rd !== 0) return rd;
    }

    return safeFloat(b.state?.liquidityAssetsUsd) - safeFloat(a.state?.liquidityAssetsUsd);
  });
};

// --- Main GET handler ---

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> },
) {
  const { chainId } = await params;
  const reqParams = parseRequestParams(chainId, request.nextUrl.searchParams);
  if (!reqParams) {
    return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  }

  const allMarkets = new Map<string, MarketItem>();

  try {
    // 1. Fetch listed markets (dynamically listed via Morpho vaults)
    if (reqParams.curationMode === "curated" || reqParams.curationMode === "all") {
      await fetchMarketCategory({
        params: reqParams,
        allMarkets,
        listed: true,
        requireTrust: false,
      });
      if (reqParams.debug) console.log(`[Morpho] Listed: ${allMarkets.size} markets`);
    }

    // 2. Fetch additional non-listed markets (Pendle, searched tokens, etc.) if needed
    const needMoreMarkets = reqParams.curationMode === "curated" && allMarkets.size < reqParams.targetCount;
    if (needMoreMarkets || reqParams.curationMode === "all") {
      await fetchMarketCategory({
        params: reqParams,
        allMarkets,
        listed: false,
        requireTrust: reqParams.curationMode !== "all",
      });
      if (reqParams.debug) console.log(`[Morpho] Total after discovery: ${allMarkets.size} markets`);
    }

    const sorted = sortMarkets(Array.from(allMarkets.values()), reqParams);

    if (reqParams.debug) {
      console.log(`[Morpho] Returned ${sorted.length} markets. Search: "${reqParams.search}", Mode: ${reqParams.curationMode}`);
    }

    return NextResponse.json({
      markets: { items: sorted },
    });

  } catch (e: unknown) {
    console.error("[Morpho API Error]", e);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 502 });
  }
}
