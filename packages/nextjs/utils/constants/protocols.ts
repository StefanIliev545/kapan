/**
 * Protocol contract addresses
 *
 * Re-exports from chainConfig.ts for backwards compatibility.
 * New code should import directly from chainConfig.ts
 */

import {
  COW_PROTOCOL_ADDRESSES,
  COW_FLASH_LOAN_ROUTER as COW_FLASH_LOAN_ROUTER_CONFIG,
  BALANCER_VAULTS,
  MORPHO_ADDRESSES,
  AAVE_V3_POOL_ADDRESSES,
  isAaveV3Pool as isAaveV3PoolFn,
  isBalancerVault as isBalancerVaultFn,
  isMorphoBlue as isMorphoBlueFn,
} from "../chainConfig";

/**
 * CoW Protocol contract addresses
 * Re-exported for backwards compatibility
 */
export const COW_PROTOCOL = {
  settlement: COW_PROTOCOL_ADDRESSES.SETTLEMENT,
  composableCoW: COW_PROTOCOL_ADDRESSES.COMPOSABLE_COW,
  vaultRelayer: COW_PROTOCOL_ADDRESSES.VAULT_RELAYER,
  hooksTrampoline: COW_PROTOCOL_ADDRESSES.HOOKS_TRAMPOLINE,
  authenticator: COW_PROTOCOL_ADDRESSES.AUTHENTICATOR,
} as const;

/**
 * CoW Protocol Flash Loan Router contracts
 */
export const COW_FLASH_LOAN_ROUTER = {
  router: COW_FLASH_LOAN_ROUTER_CONFIG.ROUTER,
  aaveBorrower: COW_FLASH_LOAN_ROUTER_CONFIG.AAVE_BORROWER,
  erc3156Borrower: COW_FLASH_LOAN_ROUTER_CONFIG.ERC3156_BORROWER,
} as const;

/**
 * Balancer Vault addresses
 */
export const BALANCER = {
  v2Vault: BALANCER_VAULTS.V2,
  v3Vault: BALANCER_VAULTS.V3,
} as const;

/**
 * Morpho Blue contract addresses by chain
 */
export const MORPHO_BLUE: Record<number, string | undefined> = {
  ...MORPHO_ADDRESSES,
};

/**
 * Aave V3 Pool addresses by chain
 */
export const AAVE_V3_POOLS: Record<number, string | undefined> = {
  ...AAVE_V3_POOL_ADDRESSES,
};

/**
 * All known Aave V3 Pool addresses (for validation)
 */
export const ALL_AAVE_V3_POOLS = [
  "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", // Ethereum Mainnet
  "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Arbitrum, Optimism, Polygon, Avalanche
  "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", // Base
  "0x3E5f750726cc1D0d4a9c62c507f890f984576507", // Linea
] as const;

/**
 * Chain-specific Aave V3 borrower adapters for CoW flash loans
 */
export const COW_AAVE_BORROWERS: Record<number, string> = {
  8453: "0xdeCC46a4b09162F5369c5C80383AAa9159bCf192",
};

// Re-export validation functions
export const isAaveV3Pool = isAaveV3PoolFn;
export const isBalancerVault = isBalancerVaultFn;
export const isMorphoBlue = isMorphoBlueFn;
