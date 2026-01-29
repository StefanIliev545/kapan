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
import { usePendlePTYields, isPTToken, type PTYield } from "./usePendlePTYields";
import { useMapleYields, isSyrupToken, type MapleYield } from "./useMapleYields";
import { useLSTYields, isLSTToken, type LSTYield } from "./useLSTYields";

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
    // Maple-specific
    dripsBoost?: number;
    baseApy?: number;
    // LST-specific
    project?: string;
    sourceChain?: string;
  };
}

/**
 * Convert PTYield to ExternalYield
 */
function ptYieldToExternal(pt: PTYield): ExternalYield {
  return {
    address: pt.address,
    symbol: pt.symbol,
    name: pt.name,
    apy: pt.fixedApy,
    fixedApy: pt.fixedApy, // Alias for backward compatibility
    source: "pendle",
    metadata: {
      expiry: pt.expiry,
      daysToExpiry: pt.daysToExpiry,
      underlyingSymbol: pt.underlyingSymbol,
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
 * Hook to fetch yields from all external sources
 * Returns a unified findYield function that checks all sources
 */
export function useExternalYields(chainId?: number, enabled = true) {
  const pendle = usePendlePTYields(chainId, undefined, enabled);
  const maple = useMapleYields(enabled);
  const lst = useLSTYields(enabled);

  const isLoading = pendle.isLoading || maple.isLoading || lst.isLoading;

  /**
   * Find yield for a token, checking all sources
   * Priority: exact address match > symbol match
   */
  // Extract stable function references to avoid depending on entire hook objects
  const pendleFindYield = pendle.findYield;
  const mapleFindYield = maple.findYield;
  const lstFindYield = lst.findYield;

  const findYield = useMemo(() => {
    return (address?: string, symbol?: string): ExternalYield | undefined => {
      // Check Pendle first for PT tokens
      if (symbol && isPTToken(symbol)) {
        const ptYield = pendleFindYield(address, symbol);
        if (ptYield) return ptYieldToExternal(ptYield);
      }

      // Check Maple for syrup tokens
      if (symbol && isSyrupToken(symbol)) {
        const mapleYield = mapleFindYield(address, symbol);
        if (mapleYield) return mapleYieldToExternal(mapleYield);
      }

      // Check LST yields (wstETH, rETH, weETH, etc.)
      if (symbol && isLSTToken(symbol)) {
        const lstYield = lstFindYield(address, symbol);
        if (lstYield) return lstYieldToExternal(lstYield);
      }

      // Try address-based lookup on all sources
      if (address) {
        const ptYield = pendleFindYield(address);
        if (ptYield) return ptYieldToExternal(ptYield);

        const mapleYield = mapleFindYield(address);
        if (mapleYield) return mapleYieldToExternal(mapleYield);

        const lstYield = lstFindYield(address);
        if (lstYield) return lstYieldToExternal(lstYield);
      }

      return undefined;
    };
  }, [pendleFindYield, mapleFindYield, lstFindYield]);

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

// Re-export type checks for convenience
export { isPTToken, isSyrupToken, isLSTToken };
export type { PTYield, MapleYield, LSTYield };
