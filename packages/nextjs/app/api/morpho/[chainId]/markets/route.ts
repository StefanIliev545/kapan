import { NextRequest, NextResponse } from "next/server";

const MORPHO_GRAPHQL_API = "https://blue-api.morpho.org/graphql";

const QUERY_MARKETS = `
  query Markets($first: Int, $skip: Int, $chainId: Int!, $whitelisted: Boolean) {
    markets(
      first: $first
      skip: $skip
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: { 
        chainId_in: [$chainId]
        whitelisted: $whitelisted 
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
  const search = (sp.get("search") || "").toLowerCase().trim();
  const isSearching = search.length > 0;
  const curationMode = (sp.get("curation") || "curated").toLowerCase();
  const hideSaturated = sp.get("hideSaturated") === "true";
  const debug = sp.get("debug") === "true";
  
  // If searching, we dig deeper (scan 1000 items). If browsing, scan more to get more markets
  const SCAN_DEPTH = isSearching ? 5000 : 5000; // Increased to 5000 to find more markets
  const TARGET_COUNT = isSearching ? 100 : Math.min(parseInt(sp.get("first") || "1000", 10), 1000); // Increased default to 1000
  
  // Lower minimum liquidity when searching to find small pools
  const minLiquidity = safeFloat(sp.get("minLiq") || sp.get("minLiquidityUsd") || (isSearching ? "1000" : "5000"));

  const allMarkets = new Map<string, MarketItem>();

  try {
    // --- STEP 1: Whitelisted (Fast Path) ---
    // Always fetch these first as they are the "Gold Standard"
    // Fetch ALL whitelisted markets (up to 500) before moving to discovery
    if (!isSearching && curationMode === "curated") {
      // Fetch whitelisted markets in batches to get all of them
      let whitelistedSkip = 0;
      const whitelistedPageSize = 100;
      let hasMoreWhitelisted = true;
      
      while (hasMoreWhitelisted && whitelistedSkip < 5000) { // Fetch up to 1000 whitelisted markets
        const safeRes = await fetch(MORPHO_GRAPHQL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: QUERY_MARKETS,
            variables: { 
              first: whitelistedPageSize, 
              skip: whitelistedSkip, 
              chainId: chainIdInt, 
              whitelisted: true 
            },
          }),
          next: { revalidate: 120 },
        });
        
        const safeData = await safeRes.json();
        
        if (safeData.errors) {
          const msg = safeData.errors[0]?.message || "";
          if (msg.includes("No results matching") || msg.includes("No results")) {
            hasMoreWhitelisted = false;
            break;
          }
          console.error("[Morpho] Whitelisted fetch error:", safeData.errors);
          break;
        }
        
        const whitelistedItems = safeData.data?.markets?.items || [];
        
        if (whitelistedItems.length === 0) {
          hasMoreWhitelisted = false;
          break;
        }
        
        // Add these immediately - they are "Tier 1" quality
        whitelistedItems.forEach((m: any) => {
          // Apply basic sanity checks even to whitelisted markets
          const util = normalizeUtilization(m.state?.utilization);
          const supplyApy = safeFloat(m.state?.supplyApy);
          
          // Still filter out saturated or broken markets
          if (util > 0.99) return; // Allow up to 99% for whitelisted
          if (supplyApy > 20.0) return; // Block absurd APYs even for whitelisted
          
          allMarkets.set(m.uniqueKey, m);
        });
        
        whitelistedSkip += whitelistedItems.length;
        
        // If we got fewer than requested, we've reached the end
        if (whitelistedItems.length < whitelistedPageSize) {
          hasMoreWhitelisted = false;
        }
      }
      
      if (debug) console.log(`[Morpho] Found ${allMarkets.size} whitelisted markets after filtering`);
    }

    // --- STEP 2: Discovery / Search Loop ---
    // If we are searching OR we need more markets, we scan the public list
    // Only apply trust filter if curation mode is "curated"
    if (isSearching || (curationMode === "curated" && allMarkets.size < TARGET_COUNT)) {
      let skip = 0;
      let shouldContinue = true;
      const maxPages = Math.ceil(SCAN_DEPTH / 100); // Calculate max pages

      while (shouldContinue && skip < SCAN_DEPTH && allMarkets.size < TARGET_COUNT) {
        
        // Fetch batch
        const res = await fetch(MORPHO_GRAPHQL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: QUERY_MARKETS,
            variables: { 
              first: 100, 
              skip: skip, 
              chainId: chainIdInt, 
              whitelisted: false // Scan non-whitelisted
            },
          }),
          next: { revalidate: 60 },
        });

        const data = await res.json();
        
        if (data.errors) {
          const msg = data.errors[0]?.message || "";
          if (msg.includes("No results matching") || msg.includes("No results")) {
            shouldContinue = false;
            break;
          }
          console.warn(`[Morpho] Discovery page ${skip / 100} error:`, data.errors);
          skip += 100;
          continue;
        }
        
        const items = data.data?.markets?.items || [];
        
        if (items.length === 0) {
          shouldContinue = false;
          break;
        }

        for (const m of items) {
          if (allMarkets.has(m.uniqueKey)) continue;
          if (allMarkets.size >= TARGET_COUNT) break;

          // --- SEARCH FILTER ---
          if (isSearching) {
            const loan = (m.loanAsset?.symbol || "").toLowerCase();
            const coll = (m.collateralAsset?.symbol || "").toLowerCase();
            // If search term is NOT found, skip this market
            if (!loan.includes(search) && !coll.includes(search)) {
              continue;
            }
          }

          // --- STATS FILTER ---
          const liq = safeFloat(m.state?.liquidityAssetsUsd);
          const supplyApy = safeFloat(m.state?.supplyApy);
          const borrowApy = safeFloat(m.state?.borrowApy);
          const util = normalizeUtilization(m.state?.utilization);

          // Basic Junk Check
          if (liq < minLiquidity) continue;
          // More lenient APY check when searching (50.0 = 5000% vs 10.0 = 1000%)
          const maxApy = isSearching ? 50.0 : 10.0;
          if (supplyApy > maxApy || borrowApy > maxApy) continue;
          if (util > 0.99 || (hideSaturated && util >= 0.999)) continue; // Saturated

          // Suspicious "G" tokens (only block when not searching)
          if (!isSearching && isSuspiciousGToken(m)) continue;

          // Critical Warning Check (Always Block RED/HIGH)
          const hasRedWarning = Array.isArray(m.warnings) && m.warnings.some(
            (w: any) => {
              const level = String(w?.level || "").toUpperCase();
              return level === "RED" || level === "HIGH";
            }
          );
          if (hasRedWarning) continue;

          // --- TRUST CHECK ---
          // If searching, we are lenient. If browsing, we are strict.
          // Skip trust check entirely if curation mode is "all"
          if (curationMode === "all" || isMarketTrusted(m, isSearching)) {
            allMarkets.set(m.uniqueKey, m);
          }
        }

        skip += 100;
        
        // Log progress every 5 pages
        if (skip % 500 === 0 && debug) {
          console.log(`[Morpho] Discovery progress: scanned ${skip}, found ${allMarkets.size} markets`);
        }
      }
      
      if (debug) {
        console.log(`[Morpho] Discovery complete: scanned ${skip}, found ${allMarkets.size} total markets`);
      }
    }
    
    // Sort: If searching, exact matches first. Otherwise, by TVL (SupplyAssetsUsd).
    const sorted = Array.from(allMarkets.values()).sort((a, b) => {
      if (isSearching) {
        // Prioritize exact symbol match
        const aLoan = (a.loanAsset?.symbol || "").toLowerCase();
        const aColl = (a.collateralAsset?.symbol || "").toLowerCase();
        const bLoan = (b.loanAsset?.symbol || "").toLowerCase();
        const bColl = (b.collateralAsset?.symbol || "").toLowerCase();
        
        const aExact = aLoan === search || aColl === search;
        const bExact = bLoan === search || bColl === search;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then prioritize starts with
        const aStarts = aLoan.startsWith(search) || aColl.startsWith(search);
        const bStarts = bLoan.startsWith(search) || bColl.startsWith(search);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
      }
      // Secondary sort by Supply TVL (shows biggest markets first)
      return safeFloat(b.state?.supplyAssetsUsd) - safeFloat(a.state?.supplyAssetsUsd);
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
