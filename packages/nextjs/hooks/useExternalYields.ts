/**
 * Combined hook for external yield sources (Pendle PT tokens, Maple syrup tokens, LSTs, etc.)
 *
 * This provides a unified interface for looking up yields from multiple sources,
 * so components don't need to know about individual yield providers.
 *
 * Yield sources:
 * - Pendle PT tokens: Fixed APY from holding to maturity
 * - Maple syrup tokens: Base APY + Drips boost
 * - LST tokens: Native staking yields (wstETH, rETH, weETH, etc.)
 */

import { useMemo } from "react";
import { Address } from "viem";
import { usePendlePTYields, isPTToken, calculateFixedApy, type PTYield } from "./usePendlePTYields";
import { useMapleYields, isSyrupToken, type MapleYield } from "./useMapleYields";
import { useLSTYields, isLSTToken, type LSTYield } from "./useLSTYields";
import { usePendlePortfolio, getPendlePortfolioKey } from "./usePendlePortfolio";

/**
 * Unified yield type that can represent yields from any source
 * Includes `fixedApy` alias for backward compatibility with PTYield
 */
export interface ExternalYield {
  address: Address;
  symbol: string;
  name: string;
  /** APY as percentage (e.g., 7.5 for 7.5%) */
  apy: number;
  /** Alias for apy - for backward compatibility with PTYield */
  fixedApy: number;
  /** Source of the yield data */
  source: "pendle" | "maple" | "lst" | "other";
  /** Additional metadata from source */
  metadata?: {
    // Pendle-specific
    expiry?: Date;
    daysToExpiry?: number;
    underlyingSymbol?: string;
    underlyingAddress?: string;
    /** Underlying asset's native/organic APY as percentage (Pendle). */
    underlyingApy?: number;
    /** PT price in USD from Pendle (use for consistent APY calculation) */
    ptPriceUsd?: number;
    /** Underlying price in USD from Pendle (use for consistent APY calculation) */
    underlyingPriceUsd?: number;
    /** APY the user locked in when they entered this PT position (portfolio-specific). */
    entryApyPercent?: number;
    /** Current valuation of the user's PT position in USD. */
    valuationUsd?: number;
    /** Unrealized P&L on the PT position in USD (positive = gain). */
    unrealizedPnlUsd?: number;
    // Maple-specific
    dripsBoost?: number;
    baseApy?: number;
    // LST-specific
    project?: string;
    sourceChain?: string;
  };
}

/**
 * Convert PTYield to ExternalYield, optionally enriched with user-specific
 * portfolio data (entry APY, valuation, unrealized P&L) if a lookup is
 * provided. When present, these override nothing — they only show up in
 * `metadata` so consumers that care about "my APY vs market APY" can render
 * both.
 */
function ptYieldToExternal(
  pt: PTYield,
  portfolioLookup?: (chainId: number, ptAddress: string) => {
    entryApyPercent: number | null;
    valuationUsd: number;
    unrealizedPnlUsd: number | null;
  } | undefined,
  chainId?: number,
): ExternalYield {
  const position = chainId != null && portfolioLookup ? portfolioLookup(chainId, pt.address) : undefined;
  // For positions we actually hold, prefer the APY the user locked in at
  // entry over the live market implied APY — the market number shifts with
  // the AMM every block and doesn't describe what this specific position
  // earns. When Pendle's portfolio endpoint has no entry data (e.g. PT is
  // held inside a Morpho market rather than the user's EOA), fall back to
  // the market APY so we still show something sensible.
  const resolvedApy = position?.entryApyPercent ?? pt.fixedApy;
  return {
    address: pt.address,
    symbol: pt.symbol,
    name: pt.name,
    apy: resolvedApy,
    fixedApy: resolvedApy,
    source: "pendle",
    metadata: {
      expiry: pt.expiry,
      daysToExpiry: pt.daysToExpiry,
      underlyingSymbol: pt.underlyingSymbol,
      underlyingAddress: pt.underlyingAddress,
      underlyingApy: pt.underlyingApy,
      ptPriceUsd: pt.ptPriceUsd,
      underlyingPriceUsd: pt.underlyingPriceUsd,
      ...(position?.entryApyPercent != null ? { entryApyPercent: position.entryApyPercent } : {}),
      ...(position != null ? { valuationUsd: position.valuationUsd } : {}),
      ...(position?.unrealizedPnlUsd != null ? { unrealizedPnlUsd: position.unrealizedPnlUsd } : {}),
    },
  };
}

/**
 * Convert MapleYield to ExternalYield
 */
function mapleYieldToExternal(maple: MapleYield): ExternalYield {
  return {
    address: maple.address,
    symbol: maple.symbol,
    name: maple.name,
    apy: maple.totalApy,
    fixedApy: maple.totalApy, // Alias for backward compatibility
    source: "maple",
    metadata: {
      dripsBoost: maple.dripsBoost,
      baseApy: maple.apy,
    },
  };
}

/**
 * Convert LSTYield to ExternalYield
 */
function lstYieldToExternal(lst: LSTYield): ExternalYield {
  return {
    address: lst.address,
    symbol: lst.symbol,
    name: lst.name,
    apy: lst.apy,
    fixedApy: lst.apy, // Alias for backward compatibility
    source: "lst",
    metadata: {
      project: lst.project,
      sourceChain: lst.sourceChain,
    },
  };
}

/**
 * Check if a token has external yield (PT token, syrup token, or LST)
 */
export function hasExternalYield(symbol: string): boolean {
  return isPTToken(symbol) || isSyrupToken(symbol) || isLSTToken(symbol);
}

/**
 * A yield source definition: symbol check, lookup function, and converter.
 * Used to iterate over sources in a uniform way, reducing branching complexity.
 */
interface YieldSource<T> {
  isMatch: (symbol: string) => boolean;
  findYield: (address?: string, symbol?: string) => T | undefined;
  toExternal: (yield_: T) => ExternalYield;
}

/**
 * Try to find a yield by iterating over sources.
 * First tries symbol-based matching, then falls back to address-only lookup.
 */
function findYieldFromSources(
  sources: YieldSource<unknown>[],
  address?: string,
  symbol?: string,
): ExternalYield | undefined {
  // Symbol-based lookup (higher priority)
  if (symbol) {
    for (const source of sources) {
      if (!source.isMatch(symbol)) continue;
      const result = source.findYield(address, symbol);
      if (result) return source.toExternal(result);
    }
  }

  // Address-based fallback across all sources
  if (address) {
    for (const source of sources) {
      const result = source.findYield(address);
      if (result) return source.toExternal(result);
    }
  }

  return undefined;
}

/**
 * Hook to fetch yields from all external sources
 * Returns a unified findYield function that checks all sources
 */
export function useExternalYields(chainId?: number, enabled = true) {
  const pendle = usePendlePTYields(chainId, undefined, enabled);
  const maple = useMapleYields(enabled);
  const lst = useLSTYields(enabled);
  // Pendle user-specific portfolio: entry APY, valuation, unrealized P&L.
  // Connected-wallet only; falls back to market APY for users without a
  // position (which is the sensible default for the showAll markets view).
  const portfolio = usePendlePortfolio();

  const isLoading = pendle.isLoading || maple.isLoading || lst.isLoading;

  /**
   * Find yield for a token, checking all sources
   * Priority: exact address match > symbol match
   */
  // Extract stable function references to avoid depending on entire hook objects
  const pendleFindYield = pendle.findYield;
  const mapleFindYield = maple.findYield;
  const lstFindYield = lst.findYield;
  const portfolioByPt = portfolio.byPtAddress;

  const findYield = useMemo(() => {
    const portfolioLookup = (chainIdForPt: number, ptAddress: string) => {
      const hit = portfolioByPt.get(getPendlePortfolioKey(chainIdForPt, ptAddress));
      if (!hit) return undefined;
      return {
        entryApyPercent: hit.entryApyPercent,
        valuationUsd: hit.valuationUsd,
        unrealizedPnlUsd: hit.unrealizedPnlUsd,
      };
    };
    const ptToExternal = (y: unknown): ExternalYield =>
      ptYieldToExternal(y as PTYield, portfolioLookup, chainId);

    const sources: YieldSource<unknown>[] = [
      { isMatch: isPTToken, findYield: pendleFindYield, toExternal: ptToExternal },
      { isMatch: isSyrupToken, findYield: mapleFindYield, toExternal: mapleYieldToExternal as (y: unknown) => ExternalYield },
      { isMatch: isLSTToken, findYield: lstFindYield, toExternal: lstYieldToExternal as (y: unknown) => ExternalYield },
    ];
    return (address?: string, symbol?: string): ExternalYield | undefined =>
      findYieldFromSources(sources, address, symbol);
  }, [pendleFindYield, mapleFindYield, lstFindYield, portfolioByPt, chainId]);

  /**
   * Get the effective supply rate for a token
   * - For PT tokens (Pendle): external yield REPLACES protocol rate (fixed yield tokens)
   * - For LSTs/Maple: external yield ADDS to protocol rate (staking + lending)
   */
  const getEffectiveSupplyRate = useMemo(() => {
    return (address: string, symbol: string, baseRate: number): number => {
      const externalYield = findYield(address, symbol);
      if (!externalYield) {
        return baseRate;
      }

      // Use source to determine yield logic
      // - Pendle PT tokens: fixed yield REPLACES protocol rate
      // - LSTs, Maple: staking/external yield ADDS to protocol rate
      if (externalYield.source === "pendle") {
        return externalYield.apy;
      }

      // For LSTs, Maple, and other yield sources, add external yield to protocol supply rate
      // e.g., wstETH at 2.3% staking yield + 0.01% Aave supply = 2.31% total
      return externalYield.apy + baseRate;
    };
  }, [findYield]);

  // Combined yields list
  const pendleYields = pendle.yields;
  const mapleYields = maple.yields;
  const lstYields = lst.yields;

  const yields = useMemo(() => {
    const all: ExternalYield[] = [];
    pendleYields.forEach(pt => all.push(ptYieldToExternal(pt)));
    mapleYields.forEach(m => all.push(mapleYieldToExternal(m)));
    lstYields.forEach(l => all.push(lstYieldToExternal(l)));
    return all;
  }, [pendleYields, mapleYields, lstYields]);

  // Memoize nested objects to maintain stable references
  const pendleExport = useMemo(() => ({
    yields: pendleYields,
    findYield: pendleFindYield,
  }), [pendleYields, pendleFindYield]);

  const mapleExport = useMemo(() => ({
    yields: mapleYields,
    findYield: mapleFindYield,
  }), [mapleYields, mapleFindYield]);

  const lstExport = useMemo(() => ({
    yields: lstYields,
    findYield: lstFindYield,
  }), [lstYields, lstFindYield]);

  return {
    yields,
    findYield,
    getEffectiveSupplyRate,
    isLoading,
    // Expose individual sources for specific use cases
    pendle: pendleExport,
    maple: mapleExport,
    lst: lstExport,
  };
}

// Re-export type checks and utilities for convenience
export { isPTToken, isSyrupToken, isLSTToken, calculateFixedApy };
export type { PTYield, MapleYield, LSTYield };
