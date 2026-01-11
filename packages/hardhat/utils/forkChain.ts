/**
 * Fork chain resolution utility for deployment scripts.
 *
 * When deploying to Hardhat (chainId 31337), we need to know which mainnet
 * chain is being forked to use the correct protocol addresses.
 *
 * Set FORK_CHAIN env variable to control which chain's addresses to use:
 * - arbitrum (default) -> 42161
 * - ethereum -> 1
 * - base -> 8453
 * - optimism -> 10
 * - linea -> 59144
 * - plasma -> 9745
 * - unichain -> 130
 *
 * Usage in deploy scripts:
 *   const effectiveChainId = getEffectiveChainId(chainId);
 *   const entry = MAP[effectiveChainId];
 */

const FORK_CHAIN_MAP: Record<string, number> = {
  arbitrum: 42161,
  arb: 42161,
  ethereum: 1,
  eth: 1,
  mainnet: 1,
  base: 8453,
  optimism: 10,
  op: 10,
  linea: 59144,
  plasma: 9745,
  unichain: 130,
  uni: 130,
};

/**
 * Get the fork chain ID from FORK_CHAIN env variable.
 * Supports partial matches (eth -> ethereum, arb -> arbitrum, op -> optimism).
 * Defaults to Arbitrum (42161).
 */
export function getForkChainId(): number {
  const forkChain = process.env.FORK_CHAIN?.toLowerCase() || "arbitrum";
  
  // Direct match
  if (FORK_CHAIN_MAP[forkChain]) {
    return FORK_CHAIN_MAP[forkChain];
  }
  
  // Partial/fuzzy match (e.g., "etheum" -> "ethereum")
  for (const key of Object.keys(FORK_CHAIN_MAP)) {
    if (key.startsWith(forkChain) || forkChain.startsWith(key)) {
      console.warn(`⚠️  FORK_CHAIN="${forkChain}" matched to "${key}"`);
      return FORK_CHAIN_MAP[key];
    }
  }
  
  console.warn(`⚠️  Unknown FORK_CHAIN="${forkChain}", defaulting to arbitrum (42161)`);
  return 42161;
}

/**
 * Maps a chain ID to the effective chain for address lookups.
 * When chainId is 31337 (local hardhat), returns the forked chain ID based on FORK_CHAIN env.
 *
 * @param chainId - The actual chain ID (31337 for hardhat)
 * @returns The effective chain ID for address lookups
 */
export function getEffectiveChainId(chainId: number): number {
  if (chainId === 31337) {
    return getForkChainId();
  }
  return chainId;
}

/**
 * Helper to log the fork configuration.
 */
export function logForkConfig(chainId: number): void {
  if (chainId === 31337) {
    const forkChain = process.env.FORK_CHAIN || "arbitrum";
    const effectiveId = getForkChainId();
    console.log(`🍴 Hardhat fork mode: using ${forkChain} (${effectiveId}) addresses`);
  }
}

