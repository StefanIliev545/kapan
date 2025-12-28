#!/usr/bin/env npx ts-node

/**
 * Fetch missing logos from Morpho's CDN
 * 
 * Usage: npx ts-node scripts/fetch-morpho-logos.ts
 * 
 * This script:
 * 1. Fetches all markets from Morpho GraphQL API
 * 2. Extracts unique asset symbols from collateral and loan assets
 * 3. Checks which logos are missing from public/logos
 * 4. Attempts to download missing logos from Morpho's CDN
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const MORPHO_GRAPHQL_API = "https://blue-api.morpho.org/graphql";
const MORPHO_CDN_BASE = "https://cdn.morpho.org/assets/logos";
const LOGOS_DIR = path.join(__dirname, "../public/logos");

// Supported chain IDs for Morpho
const CHAIN_IDS = [1, 8453, 42161]; // Ethereum, Base, Arbitrum

const QUERY_ALL_MARKETS = `
  query AllMarkets($chainId: Int!, $first: Int!, $skip: Int!) {
    markets(
      first: $first
      skip: $skip
      where: { chainId_in: [$chainId] }
    ) {
      items {
        collateralAsset {
          symbol
          address
        }
        loanAsset {
          symbol
          address
        }
      }
    }
  }
`;

interface Asset {
  symbol: string;
  address: string;
}

interface Market {
  collateralAsset: Asset | null;
  loanAsset: Asset | null;
}

async function fetchGraphQL(query: string, variables: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query, variables });
    
    const req = https.request(MORPHO_GRAPHQL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function fetchAllMarkets(chainId: number): Promise<Market[]> {
  const allMarkets: Market[] = [];
  let skip = 0;
  const first = 500;
  let hasMore = true;

  console.log(`  Fetching markets for chain ${chainId}...`);

  while (hasMore) {
    const result = await fetchGraphQL(QUERY_ALL_MARKETS, { chainId, first, skip });
    
    if (result.errors) {
      console.error(`  GraphQL error for chain ${chainId}:`, result.errors[0]?.message);
      break;
    }

    const items = result.data?.markets?.items || [];
    allMarkets.push(...items);
    
    hasMore = items.length === first;
    skip += first;
    
    if (items.length > 0) {
      process.stdout.write(`    Fetched ${allMarkets.length} markets...\r`);
    }
  }

  console.log(`  Found ${allMarkets.length} markets on chain ${chainId}`);
  return allMarkets;
}

function getExistingLogos(): Set<string> {
  const files = fs.readdirSync(LOGOS_DIR);
  const logos = new Set<string>();
  
  for (const file of files) {
    // Extract base name without extension
    const baseName = file.replace(/\.(svg|png|avif|webp)$/i, "").toLowerCase();
    logos.add(baseName);
  }
  
  return logos;
}

/**
 * Normalize symbol to match tokenNameToLogo() logic in externalContracts.ts
 * 
 * Examples:
 * - PT-USDe-15JAN2026 -> ptusde
 * - PT-corn-EBTC-27MAR2025 -> ptcorn-ebtc
 * - PT-sw-RLP-1750896023 -> ptsw-rlp
 * - YT-USDe-27MAR2025 -> ytusde
 */
function normalizeSymbol(symbol: string): string {
  let result = symbol.toLowerCase();
  
  // Handle PT tokens: remove "pt-" prefix, then strip date/timestamp suffixes
  if (result.startsWith("pt-")) {
    const withoutPrefix = result.slice(3);
    const baseToken = withoutPrefix
      .replace(/-\d{1,2}[a-z]{3}\d{4}$/i, "") // -15JAN2026
      .replace(/-1\d{9}$/, ""); // -1750896023 (Unix timestamp)
    return `pt${baseToken}`;
  }
  
  // Handle YT tokens similarly
  if (result.startsWith("yt-")) {
    const withoutPrefix = result.slice(3);
    const baseToken = withoutPrefix
      .replace(/-\d{1,2}[a-z]{3}\d{4}$/i, "")
      .replace(/-1\d{9}$/, "");
    return `yt${baseToken}`;
  }
  
  // For non-PT/YT tokens, just strip date suffixes
  return result
    .replace(/-\d{1,2}[a-z]{3}\d{4}$/i, "")
    .replace(/-1\d{9}$/, "");
}

// Sanitize filename to remove problematic characters
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|()]/g, "-") // Replace problematic chars with dash
    .replace(/\+/g, "plus")           // Replace + with "plus"
    .replace(/-+/g, "-")              // Collapse multiple dashes
    .replace(/^-|-$/g, "");           // Remove leading/trailing dashes
}

// Check if a symbol is valid for processing (skip obviously problematic ones)
function isValidSymbol(symbol: string): boolean {
  // Skip symbols with dates in YYYY/MM/DD format (like "2026/01/18")
  if (/\d{4}\/\d{2}\/\d{2}/.test(symbol)) return false;
  // Skip very long symbols (likely not real tokens)
  if (symbol.length > 50) return false;
  // Skip symbols that are just numbers
  if (/^\d+$/.test(symbol)) return false;
  return true;
}

async function checkLogoExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode === 200);
      res.resume(); // Consume response to free up memory
    }).on("error", () => resolve(false));
  });
}

async function downloadLogo(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        resolve(false);
        return;
      }
      
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
    }).on("error", () => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      resolve(false);
    });
  });
}

async function main() {
  console.log("Morpho Logo Fetcher");
  console.log("===================\n");

  // Get existing logos
  const existingLogos = getExistingLogos();
  console.log(`Found ${existingLogos.size} existing logos in ${LOGOS_DIR}\n`);

  // Collect all unique symbols from all chains
  const allSymbols = new Map<string, string>(); // normalized -> original
  
  for (const chainId of CHAIN_IDS) {
    const markets = await fetchAllMarkets(chainId);
    
    for (const market of markets) {
      if (market.collateralAsset?.symbol) {
        const original = market.collateralAsset.symbol;
        const normalized = normalizeSymbol(original);
        if (!allSymbols.has(normalized)) {
          allSymbols.set(normalized, original);
        }
      }
      if (market.loanAsset?.symbol) {
        const original = market.loanAsset.symbol;
        const normalized = normalizeSymbol(original);
        if (!allSymbols.has(normalized)) {
          allSymbols.set(normalized, original);
        }
      }
    }
  }

  console.log(`\nFound ${allSymbols.size} unique asset symbols across all chains\n`);

  // Find missing logos
  const missingSymbols: Array<{ normalized: string; original: string }> = [];
  
  for (const [normalized, original] of allSymbols) {
    if (!existingLogos.has(normalized)) {
      missingSymbols.push({ normalized, original });
    }
  }

  console.log(`Missing logos: ${missingSymbols.length}\n`);
  
  if (missingSymbols.length === 0) {
    console.log("All logos already exist!");
    return;
  }

  // Try to download missing logos from Morpho CDN
  console.log("Attempting to download from Morpho CDN...\n");
  
  const downloaded: string[] = [];
  const failed: string[] = [];

  for (const { normalized, original } of missingSymbols) {
    // Skip invalid symbols
    if (!isValidSymbol(original) || !isValidSymbol(normalized)) {
      console.log(`  Skipping invalid symbol: ${original}`);
      continue;
    }

    const safeFilename = sanitizeFilename(normalized);
    
    // Build URL patterns to try
    const urlPatterns: string[] = [];
    
    // For PT tokens, try pt-xxx format first (Morpho uses dashes)
    if (normalized.startsWith("pt") && normalized.length > 2) {
      const baseToken = normalized.slice(2); // Remove "pt" prefix
      urlPatterns.push(`${MORPHO_CDN_BASE}/pt-${baseToken}.svg`);
    }
    
    // For YT tokens, try yt-xxx format
    if (normalized.startsWith("yt") && normalized.length > 2) {
      const baseToken = normalized.slice(2);
      urlPatterns.push(`${MORPHO_CDN_BASE}/yt-${baseToken}.svg`);
    }
    
    // Standard patterns
    urlPatterns.push(
      `${MORPHO_CDN_BASE}/${normalized}.svg`,
      `${MORPHO_CDN_BASE}/${original.toLowerCase()}.svg`,
      `${MORPHO_CDN_BASE}/${original}.svg`,
    );

    let success = false;
    
    for (const url of urlPatterns) {
      const destPath = path.join(LOGOS_DIR, `${safeFilename}.svg`);
      
      process.stdout.write(`  Trying ${safeFilename}... `);
      
      try {
        if (await downloadLogo(url, destPath)) {
          console.log(`Downloaded from ${url}`);
          downloaded.push(safeFilename);
          success = true;
          break;
        }
      } catch (e) {
        // Ignore download errors, just try next pattern
      }
    }
    
    if (!success) {
      console.log(`Not found on CDN`);
      failed.push(`${original} (${safeFilename})`);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Downloaded: ${downloaded.length}`);
  if (downloaded.length > 0) {
    console.log("  " + downloaded.join(", "));
  }
  
  console.log(`\nNot found on Morpho CDN: ${failed.length}`);
  if (failed.length > 0) {
    console.log("  " + failed.join(", "));
  }
}

main().catch(console.error);
