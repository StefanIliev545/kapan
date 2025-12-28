import { NextRequest, NextResponse } from "next/server";

const MORPHO_GRAPHQL_API = "https://blue-api.morpho.org/graphql";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  const { chainId } = await params;
  const chainIdInt = parseInt(chainId, 10);
  
  if (!Number.isFinite(chainIdInt) || chainIdInt <= 0) {
    return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const search = (sp.get("search") || "").trim();
  const searchLower = search.toLowerCase();
  const isSearching = search.length > 0;
  const curationMode = (sp.get("curation") || "curated").toLowerCase();
  const hideSaturated = sp.get("hideSaturated") === "true";
  const debug = sp.get("debug") === "true";
  
  // Target number of markets to return
  const TARGET_COUNT = isSearching ? 100 : Math.min(parseInt(sp.get("first") || "500", 10), 500);
  
  // Server-side filter thresholds (pushed to GraphQL API for efficiency)
  // Use lower thresholds to cast a wider net, then filter client-side
  const SERVER_MIN_SUPPLY_USD = isSearching ? 100 : 1000; // Minimum TVL at API level
  const SERVER_MAX_UTILIZATION = hideSaturated ? 0.995 : 0.9999; // Filter saturated at API
  
  // Client-side filter thresholds (for additional quality filtering)
  const minLiquidity = safeFloat(sp.get("minLiq") || sp.get("minLiquidityUsd") || (isSearching ? "1000" : "5000"));

  const allMarkets = new Map<string, MarketItem>();

  try {
    // Helper function to fetch markets with server-side filtering
    const fetchMarketsBatch = async (
      skip: number, 
      first: number, 
      whitelisted?: boolean,
      searchTerm?: string
    ) => {
      const variables: Record<string, any> = { 
        first, 
        skip, 
        chainId: chainIdInt,
        utilizationMax: SERVER_MAX_UTILIZATION,
        minSupplyUsd: SERVER_MIN_SUPPLY_USD,
      };
      
      // Only add whitelisted filter if explicitly set
      if (whitelisted !== undefined) {
        variables.whitelisted = whitelisted;
      }
      
      // Use GraphQL search for server-side text matching (more efficient)
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
        // "No results" is not an error - just empty results
        if (msg.includes("No results")) {
          return { items: [], hasMore: false };
        }
        if (debug) console.warn("[Morpho] GraphQL error:", data.errors);
        return { items: [], hasMore: false, error: msg };
      }
      
      const items = data.data?.markets?.items || [];
      return { items, hasMore: items.length === first };
    };

    // Client-side filter function
    const passesClientFilters = (m: MarketItem): boolean => {
      const liq = safeFloat(m.state?.liquidityAssetsUsd);
      const supplyApy = safeFloat(m.state?.supplyApy);
      const borrowApy = safeFloat(m.state?.borrowApy);
      const util = normalizeUtilization(m.state?.utilization);
      
      // Liquidity check - ensure market has usable liquidity
      if (liq < minLiquidity) return false;
      
      // APY sanity check (50.0 = 5000% for search, 10.0 = 1000% for browse)
      const maxApy = isSearching ? 50.0 : 10.0;
      if (supplyApy > maxApy || borrowApy > maxApy) return false;
      
      // Utilization check (already filtered server-side, but double-check)
      if (util > 0.99 || (hideSaturated && util >= 0.995)) return false;
      
      // Suspicious "G" tokens (e.g., GMORPHO spam) - skip when not searching
      if (!isSearching && isSuspiciousGToken(m)) return false;
      
      // Critical warnings (RED/HIGH level)
      const hasRedWarning = Array.isArray(m.warnings) && m.warnings.some(
        (w: any) => ["RED", "HIGH"].includes(String(w?.level || "").toUpperCase())
      );
      if (hasRedWarning) return false;
      
      return true;
    };

    // --- UNIFIED FETCHING APPROACH ---
    // Fetch both whitelisted and vault-trusted markets in fewer API calls
    // by leveraging server-side filters
    
    const PAGE_SIZE = 200; // Larger batches since server filters out junk
    const MAX_PAGES = 10; // Max 2000 items total per category
    
    // 1. Fetch whitelisted markets (highest quality)
    if (curationMode === "curated" || curationMode === "all") {
      let skip = 0;
      let hasMore = true;
      
      while (hasMore && skip < PAGE_SIZE * MAX_PAGES && allMarkets.size < TARGET_COUNT) {
        const { items, hasMore: more } = await fetchMarketsBatch(
          skip, 
          PAGE_SIZE, 
          true, // whitelisted only
          isSearching ? search : undefined
        );
        
        for (const m of items) {
          if (allMarkets.has(m.uniqueKey)) continue;
          if (passesClientFilters(m)) {
            allMarkets.set(m.uniqueKey, m);
          }
        }
        
        hasMore = more && allMarkets.size < TARGET_COUNT;
        skip += PAGE_SIZE;
      }
      
      if (debug) console.log(`[Morpho] Whitelisted: ${allMarkets.size} markets`);
    }

    // 2. Fetch additional markets (vault-trusted, Pendle, etc.) if needed
    // Only for curated mode when we haven't hit target yet
    if ((curationMode === "curated" && allMarkets.size < TARGET_COUNT) || curationMode === "all") {
      let skip = 0;
      let hasMore = true;
      
      while (hasMore && skip < PAGE_SIZE * MAX_PAGES && allMarkets.size < TARGET_COUNT) {
        const { items, hasMore: more } = await fetchMarketsBatch(
          skip, 
          PAGE_SIZE, 
          false, // non-whitelisted
          isSearching ? search : undefined
        );
        
        for (const m of items) {
          if (allMarkets.has(m.uniqueKey)) continue;
          if (!passesClientFilters(m)) continue;
          
          // Trust check for non-whitelisted markets (skip if mode is "all")
          if (curationMode !== "all" && !isMarketTrusted(m, isSearching)) continue;
          
          allMarkets.set(m.uniqueKey, m);
        }
        
        hasMore = more && allMarkets.size < TARGET_COUNT;
        skip += PAGE_SIZE;
      }
      
      if (debug) console.log(`[Morpho] Total after discovery: ${allMarkets.size} markets`);
    }
    
    // Sort results
    const sorted = Array.from(allMarkets.values()).sort((a, b) => {
      // Whitelisted markets first
      if (a.whitelisted && !b.whitelisted) return -1;
      if (!a.whitelisted && b.whitelisted) return 1;
      
      if (isSearching) {
        // For search: exact matches first, then starts with, then by TVL
        const aLoan = (a.loanAsset?.symbol || "").toLowerCase();
        const aColl = (a.collateralAsset?.symbol || "").toLowerCase();
        const bLoan = (b.loanAsset?.symbol || "").toLowerCase();
        const bColl = (b.collateralAsset?.symbol || "").toLowerCase();
        
        const aExact = aLoan === searchLower || aColl === searchLower;
        const bExact = bLoan === searchLower || bColl === searchLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        const aStarts = aLoan.startsWith(searchLower) || aColl.startsWith(searchLower);
        const bStarts = bLoan.startsWith(searchLower) || bColl.startsWith(searchLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
      }
      
      // Sort by liquidity (available to borrow) - more useful than total supply
      return safeFloat(b.state?.liquidityAssetsUsd) - safeFloat(a.state?.liquidityAssetsUsd);
    });

    if (debug) {
      console.log(`[Morpho] Returned ${sorted.length} markets. Search: "${search}", Mode: ${curationMode}`);
    }

    return NextResponse.json({
      markets: { items: sorted }
    });

  } catch (e: any) {
    console.error("[Morpho API Error]", e);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
