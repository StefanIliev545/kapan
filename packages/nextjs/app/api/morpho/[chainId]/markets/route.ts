import { NextRequest, NextResponse } from "next/server";
import { MORPHO_GRAPHQL_API } from "~~/utils/constants";

// Optimized query with server-side filtering support
// Key filters: utilization_lte, supplyAssetsUsd_gte reduce junk at API level
const QUERY_MARKETS = `
  query Markets(
    $first: Int, 
    $skip: Int, 
    $chainId: Int!, 
    $whitelisted: Boolean,
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
        whitelisted: $whitelisted
        utilization_lte: $utilizationMax
        supplyAssetsUsd_gte: $minSupplyUsd
        search: $search
      }
    ) {
      items {
        id
        uniqueKey
        whitelisted
        warnings {
          type
          level
        }
        supplyingVaults {
          address
          name
          whitelisted
          state {
            totalAssetsUsd
          }
        }
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

type MarketItem = any;

const safeFloat = (n: any): number => {
  if (typeof n === "number") return Number.isFinite(n) ? n : 0;
  if (typeof n === "string") {
    const f = parseFloat(n);
    return Number.isFinite(f) ? f : 0;
  }
  return 0;
};

const normalizeUtilization = (val: any): number => {
  const n = safeFloat(val);
  return n > 1.5 ? n / 100 : n;
};

// Check for suspicious "G" tokens (like GMORPHO) that aren't whitelisted
const isSuspiciousGToken = (m: MarketItem): boolean => {
  if (m?.whitelisted) return false; // Whitelisted tokens are safe
  
  const loanSym = (m?.loanAsset?.symbol || "").toUpperCase();
  const collSym = (m?.collateralAsset?.symbol || "").toUpperCase();
  
  // Filter out "G" prefixed tokens except GUSD
  if (loanSym.startsWith("G") && loanSym.length > 1 && loanSym !== "GUSD") return true;
  if (collSym.startsWith("G") && collSym.length > 1 && collSym !== "GUSD") return true;
  
  return false;
};

// Trust Logic - relaxed when searching
const isMarketTrusted = (m: MarketItem, isSearching: boolean): boolean => {
  // 1. DAO Whitelisted (Always Safe)
  if (m.whitelisted === true || m.whitelisted === "true" || m.whitelisted === 1) return true;

  // 2. Vault Trusted (Curated)
  // We check if a Whitelisted Vault has >$10k in it.
  const hasTrustedVault = Array.isArray(m.supplyingVaults) && m.supplyingVaults.some(
    (v: any) => {
      const vaultWhitelisted = v.whitelisted === true || v.whitelisted === "true" || v.whitelisted === 1;
      const vaultAssets = safeFloat(v.state?.totalAssetsUsd);
      return vaultWhitelisted && vaultAssets > 10_000;
    }
  );
  if (hasTrustedVault) return true;

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
  debug: boolean;
  targetCount: number;
  serverMinSupplyUsd: number;
  serverMaxUtilization: number;
  minLiquidity: number;
}

const parseRequestParams = (chainId: string, sp: URLSearchParams): RequestParams | null => {
  const chainIdInt = parseInt(chainId, 10);
  if (!Number.isFinite(chainIdInt) || chainIdInt <= 0) return null;

  const search = (sp.get("search") || "").trim();
  const isSearching = search.length > 0;
  const hideSaturated = sp.get("hideSaturated") === "true";

  return {
    chainIdInt,
    search,
    searchLower: search.toLowerCase(),
    isSearching,
    curationMode: (sp.get("curation") || "curated").toLowerCase(),
    hideSaturated,
    debug: sp.get("debug") === "true",
    targetCount: isSearching ? 100 : Math.min(parseInt(sp.get("first") || "500", 10), 500),
    serverMinSupplyUsd: isSearching ? 100 : 1000,
    serverMaxUtilization: hideSaturated ? 0.995 : 0.9999,
    minLiquidity: safeFloat(sp.get("minLiq") || sp.get("minLiquidityUsd") || "1000"),
  };
};

// --- GraphQL fetch helper ---

interface BatchResult {
  items: MarketItem[];
  hasMore: boolean;
  error?: string;
}

/** Fetch a single page of markets from the Morpho GraphQL API with server-side filtering. */
const fetchMarketsBatch = async (
  skip: number,
  first: number,
  params: RequestParams,
  whitelisted?: boolean,
  searchTerm?: string,
): Promise<BatchResult> => {
  const variables: Record<string, any> = {
    first,
    skip,
    chainId: params.chainIdInt,
    utilizationMax: params.serverMaxUtilization,
    minSupplyUsd: params.serverMinSupplyUsd,
  };

  if (whitelisted !== undefined) {
    variables.whitelisted = whitelisted;
  }
  if (searchTerm) {
    variables.search = searchTerm;
  }

  const res = await fetch(MORPHO_GRAPHQL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY_MARKETS, variables }),
    next: { revalidate: whitelisted ? 120 : 60 },
  });

  const data = await res.json();

  if (data.errors) {
    const msg = data.errors[0]?.message || "";
    if (msg.includes("No results")) {
      return { items: [], hasMore: false };
    }
    if (params.debug) console.warn("[Morpho] GraphQL error:", data.errors);
    return { items: [], hasMore: false, error: msg };
  }

  const items = data.data?.markets?.items || [];
  return { items, hasMore: items.length === first };
};

// --- Client-side market filter ---

/** Check if a market has critical RED/HIGH-level warnings. */
const hasCriticalWarning = (m: MarketItem): boolean => {
  return Array.isArray(m.warnings) && m.warnings.some(
    (w: any) => ["RED", "HIGH"].includes(String(w?.level || "").toUpperCase()),
  );
};

/** Apply client-side quality filters after server-side filtering. */
const passesClientFilters = (m: MarketItem, params: RequestParams): boolean => {
  if (safeFloat(m.state?.liquidityAssetsUsd) < params.minLiquidity) return false;

  const maxApy = params.isSearching ? 50.0 : 10.0;
  if (safeFloat(m.state?.supplyApy) > maxApy || safeFloat(m.state?.borrowApy) > maxApy) return false;

  const util = normalizeUtilization(m.state?.utilization);
  if (util > 0.99) return false;
  if (params.hideSaturated && util >= 0.995) return false;
  if (!params.isSearching && isSuspiciousGToken(m)) return false;
  if (hasCriticalWarning(m)) return false;

  return true;
};

// --- Paginated market fetching ---

const PAGE_SIZE = 200;
const MAX_PAGES = 10;

interface FetchCategoryOpts {
  params: RequestParams;
  allMarkets: Map<string, MarketItem>;
  whitelisted: boolean;
  /** If true, apply trust check for non-whitelisted markets */
  requireTrust: boolean;
}

/** Paginate through a market category, applying filters and optional trust checks. */
const fetchMarketCategory = async ({
  params, allMarkets, whitelisted, requireTrust,
}: FetchCategoryOpts): Promise<void> => {
  let skip = 0;
  let hasMore = true;
  const searchTerm = params.isSearching ? params.search : undefined;

  while (hasMore && skip < PAGE_SIZE * MAX_PAGES && allMarkets.size < params.targetCount) {
    const batch = await fetchMarketsBatch(skip, PAGE_SIZE, params, whitelisted, searchTerm);

    for (const m of batch.items) {
      if (allMarkets.has(m.uniqueKey)) continue;
      if (!passesClientFilters(m, params)) continue;
      if (requireTrust && !isMarketTrusted(m, params.isSearching)) continue;
      allMarkets.set(m.uniqueKey, m);
    }

    hasMore = batch.hasMore && allMarkets.size < params.targetCount;
    skip += PAGE_SIZE;
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

/** Sort markets: whitelisted first, then by search relevance, then by liquidity. */
const sortMarkets = (markets: MarketItem[], params: RequestParams): MarketItem[] => {
  return markets.sort((a, b) => {
    const wlDiff = (b.whitelisted ? 1 : 0) - (a.whitelisted ? 1 : 0);
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
    // 1. Fetch whitelisted markets (highest quality)
    if (reqParams.curationMode === "curated" || reqParams.curationMode === "all") {
      await fetchMarketCategory({
        params: reqParams,
        allMarkets,
        whitelisted: true,
        requireTrust: false,
      });
      if (reqParams.debug) console.log(`[Morpho] Whitelisted: ${allMarkets.size} markets`);
    }

    // 2. Fetch additional markets (vault-trusted, Pendle, etc.) if needed
    const needMoreMarkets = reqParams.curationMode === "curated" && allMarkets.size < reqParams.targetCount;
    if (needMoreMarkets || reqParams.curationMode === "all") {
      await fetchMarketCategory({
        params: reqParams,
        allMarkets,
        whitelisted: false,
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

  } catch (e: any) {
    console.error("[Morpho API Error]", e);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
