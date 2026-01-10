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
 *
 * NOTE: This file re-exports utilities from chainConfig.ts for backwards compatibility.
 * New code should import directly from chainConfig.ts
 */

export {
  FORK_CHAIN_ID,
  CHAIN_NAMES as FORK_CHAIN_NAMES,
  getEffectiveChainId,
  getForkChainName,
  isLocalFork,
} from "./chainConfig";

