/**
 * Fork chain mapping utility for frontend.
 *
 * When running against a local Hardhat fork (chainId 31337), we need to know
 * which mainnet chain is being forked for external API calls (1inch, Pendle, etc.).
 *
 * Set NEXT_PUBLIC_FORK_CHAIN_ID to the chain ID being forked:
 * - 42161 = Arbitrum (default)
 * - 1 = Ethereum mainnet
 * - 8453 = Base
 * - 10 = Optimism
 * - 59144 = Linea
 */

export const FORK_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_FORK_CHAIN_ID || "42161", 10);

export const FORK_CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  59144: "linea",
};

/**
 * Maps a chain ID to the actual chain for external API calls.
 * When chainId is 31337 (local hardhat), returns the forked chain ID.
 */
export function getEffectiveChainId(chainId: number): number {
  if (chainId === 31337) {
    return FORK_CHAIN_ID;
  }
  return chainId;
}

/**
 * Returns the fork chain name for display purposes.
 */
export function getForkChainName(): string {
  return FORK_CHAIN_NAMES[FORK_CHAIN_ID] || "unknown";
}

/**
 * Check if we're on a local fork.
 */
export function isLocalFork(chainId: number): boolean {
  return chainId === 31337;
}

