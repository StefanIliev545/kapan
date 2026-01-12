/**
 * Shared API endpoint constants
 *
 * Re-exports from chainConfig.ts for backwards compatibility.
 * New code should import directly from chainConfig.ts
 */

import {
  COW_API_URLS as COW_API_URLS_CONFIG,
  COW_EXPLORER_URLS as COW_EXPLORER_URLS_CONFIG,
  MORPHO_CHAIN_NAMES as MORPHO_CHAIN_NAMES_CONFIG,
} from "../chainConfig";

// Re-export for backwards compatibility
export const COW_API_URLS = COW_API_URLS_CONFIG;
export const COW_EXPLORER_URLS = COW_EXPLORER_URLS_CONFIG;
export const MORPHO_CHAIN_NAMES = MORPHO_CHAIN_NAMES_CONFIG;

/**
 * Get CoW API URL for a chain
 */
export function getCowApiUrl(chainId: number): string | undefined {
  return COW_API_URLS[chainId];
}

/**
 * Check if a chain supports CoW Protocol (has API endpoint)
 */
export function isCowChainSupported(chainId: number): boolean {
  return chainId in COW_API_URLS;
}

/**
 * Morpho GraphQL API endpoint
 */
export const MORPHO_GRAPHQL_API = "https://blue-api.morpho.org/graphql";

/**
 * Check if a chain is supported by Morpho
 */
export function isMorphoSupportedChain(chainId: number): boolean {
  return chainId in MORPHO_CHAIN_NAMES;
}
