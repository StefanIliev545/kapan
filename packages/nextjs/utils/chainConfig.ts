/**
 * Shared EVM chain configuration
 *
 * This file consolidates all chain-specific constants and utilities
 * to avoid duplication across the codebase.
 *
 * IMPORTANT: When adding/removing chains, also update:
 * - packages/hardhat/deploy/v2/00_deploy_kapan_router.ts (for contract deployments)
 * - packages/nextjs/scaffold.config.ts (for frontend network support)
 */

import { Address } from "viem";

// ==================== CHAIN IDS ====================

/**
 * Canonical chain ID constants
 * Use these instead of magic numbers throughout the codebase
 */
export const CHAIN_IDS = {
  MAINNET: 1,
  OPTIMISM: 10,
  GNOSIS: 100,
  UNICHAIN: 130,
  POLYGON: 137,
  ARBITRUM: 42161,
  BASE: 8453,
  LINEA: 59144,
  PLASMA: 9745,
  AVALANCHE: 43114,
  BNB: 56,
  HARDHAT: 31337,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

/**
 * Chain name mappings (lowercase, for API URLs and display)
 */
export const CHAIN_NAMES: Record<number, string> = {
  [CHAIN_IDS.MAINNET]: "ethereum",
  [CHAIN_IDS.OPTIMISM]: "optimism",
  [CHAIN_IDS.GNOSIS]: "gnosis",
  [CHAIN_IDS.UNICHAIN]: "unichain",
  [CHAIN_IDS.POLYGON]: "polygon",
  [CHAIN_IDS.ARBITRUM]: "arbitrum",
  [CHAIN_IDS.BASE]: "base",
  [CHAIN_IDS.LINEA]: "linea",
  [CHAIN_IDS.PLASMA]: "plasma",
  [CHAIN_IDS.AVALANCHE]: "avalanche",
  [CHAIN_IDS.BNB]: "bnb",
  [CHAIN_IDS.HARDHAT]: "hardhat",
};

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string | undefined {
  return CHAIN_NAMES[chainId];
}

/**
 * Get chain ID from chain name (case-insensitive)
 */
export function getChainIdFromName(name: string): number | undefined {
  const lowercaseName = name.toLowerCase();
  const entry = Object.entries(CHAIN_NAMES).find(([, n]) => n === lowercaseName);
  return entry ? Number(entry[0]) : undefined;
}

// ==================== PROTOCOL ADDRESSES ====================

/**
 * Balancer Vault addresses (same on all supported chains)
 */
export const BALANCER_VAULTS = {
  V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8" as Address,
  V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9" as Address,
} as const;

/**
 * Morpho Blue singleton addresses by chain
 * @see https://docs.morpho.org/overview/contracts
 */
export const MORPHO_ADDRESSES: Record<number, Address | undefined> = {
  [CHAIN_IDS.MAINNET]: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  [CHAIN_IDS.OPTIMISM]: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  [CHAIN_IDS.BASE]: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  [CHAIN_IDS.ARBITRUM]: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
  [CHAIN_IDS.HARDHAT]: "0x6c247b1F6182318877311737BaC0844bAa518F5e", // Same as Arbitrum (default fork)
};

/**
 * Aave V3 Pool addresses by chain
 */
export const AAVE_V3_POOL_ADDRESSES: Record<number, Address | undefined> = {
  [CHAIN_IDS.MAINNET]: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  [CHAIN_IDS.OPTIMISM]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [CHAIN_IDS.POLYGON]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [CHAIN_IDS.ARBITRUM]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [CHAIN_IDS.AVALANCHE]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [CHAIN_IDS.BASE]: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  [CHAIN_IDS.LINEA]: "0x3E5f750726cc1D0d4a9c62c507f890f984576507",
  [CHAIN_IDS.PLASMA]: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
  [CHAIN_IDS.HARDHAT]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Same as Arbitrum (default fork)
};

/**
 * Aave V3 PoolAddressesProvider addresses by chain
 */
export const AAVE_V3_PROVIDER_ADDRESSES: Record<number, Address | undefined> = {
  [CHAIN_IDS.MAINNET]: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
  [CHAIN_IDS.OPTIMISM]: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  [CHAIN_IDS.ARBITRUM]: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  [CHAIN_IDS.BASE]: "0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d",
  [CHAIN_IDS.LINEA]: "0x89502c3731F69DDC95B65753708A07F8Cd0373F4",
  [CHAIN_IDS.PLASMA]: "0x061D8e131F26512348ee5FA42e2DF1bA9d6505E9",
};

/**
 * Aave V3 UiPoolDataProvider addresses by chain
 */
export const AAVE_V3_UI_PROVIDER_ADDRESSES: Record<number, Address | undefined> = {
  [CHAIN_IDS.MAINNET]: "0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC",
  [CHAIN_IDS.OPTIMISM]: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4",
  [CHAIN_IDS.ARBITRUM]: "0x5c5228aC8BC1528482514aF3e27E692495148717",
  [CHAIN_IDS.BASE]: "0x174446a6741300cD2E7C1b1A636Fee99c8F83502",
  [CHAIN_IDS.LINEA]: "0xf751969521E20A972A0776CDB0497Fad0F773F1F",
  [CHAIN_IDS.PLASMA]: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
};

// ==================== COW PROTOCOL ====================

/**
 * CoW Protocol contract addresses (deterministic, same on all chains)
 */
export const COW_PROTOCOL_ADDRESSES = {
  SETTLEMENT: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41" as Address,
  COMPOSABLE_COW: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74" as Address,
  VAULT_RELAYER: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110" as Address,
  HOOKS_TRAMPOLINE: "0x60Bf78233f48eC42eE3F101b9a05eC7878728006" as Address,
  AUTHENTICATOR: "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE" as Address,
} as const;

/**
 * CoW Flash Loan Router addresses (deterministic via CREATE2)
 */
export const COW_FLASH_LOAN_ROUTER = {
  ROUTER: "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69" as Address,
  AAVE_BORROWER: "0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A" as Address,
  ERC3156_BORROWER: "0x47d71b4B3336AB2729436186C216955F3C27cD04" as Address,
} as const;

/**
 * CoW API base URLs by chain
 */
export const COW_API_URLS: Record<number, string | undefined> = {
  [CHAIN_IDS.MAINNET]: "https://api.cow.fi/mainnet",
  [CHAIN_IDS.ARBITRUM]: "https://api.cow.fi/arbitrum_one",
  [CHAIN_IDS.BASE]: "https://api.cow.fi/base",
  [CHAIN_IDS.OPTIMISM]: "https://api.cow.fi/optimism",
  [CHAIN_IDS.GNOSIS]: "https://api.cow.fi/xdai",
  [CHAIN_IDS.POLYGON]: "https://api.cow.fi/polygon",
  [CHAIN_IDS.AVALANCHE]: "https://api.cow.fi/avalanche",
  [CHAIN_IDS.BNB]: "https://api.cow.fi/bnb",
  [CHAIN_IDS.LINEA]: "https://api.cow.fi/linea",
  [CHAIN_IDS.PLASMA]: "https://api.cow.fi/plasma",
};

/**
 * CoW Explorer base URLs by chain
 */
export const COW_EXPLORER_URLS: Record<number, string | undefined> = {
  [CHAIN_IDS.MAINNET]: "https://explorer.cow.fi",
  [CHAIN_IDS.ARBITRUM]: "https://explorer.cow.fi/arb1",
  [CHAIN_IDS.BASE]: "https://explorer.cow.fi/base",
  [CHAIN_IDS.OPTIMISM]: "https://explorer.cow.fi/op",
  [CHAIN_IDS.GNOSIS]: "https://explorer.cow.fi/gc",
  [CHAIN_IDS.POLYGON]: "https://explorer.cow.fi/polygon",
  [CHAIN_IDS.AVALANCHE]: "https://explorer.cow.fi/avalanche",
  [CHAIN_IDS.BNB]: "https://explorer.cow.fi/bnb",
  [CHAIN_IDS.LINEA]: "https://explorer.cow.fi/linea",
  [CHAIN_IDS.PLASMA]: "https://explorer.cow.fi/plasma",
};

// ==================== MORPHO ====================

/**
 * Morpho chain names for app.morpho.org URLs
 */
export const MORPHO_CHAIN_NAMES: Record<number, string | undefined> = {
  [CHAIN_IDS.MAINNET]: "ethereum",
  [CHAIN_IDS.BASE]: "base",
  [CHAIN_IDS.ARBITRUM]: "arbitrum",
  [CHAIN_IDS.OPTIMISM]: "optimism",
  [CHAIN_IDS.POLYGON]: "polygon",
};

// ==================== CHAIN SUPPORT CHECKS ====================

/**
 * Chains where 1inch is available (all EVM chains except Plasma)
 */
const ONEINCH_UNSUPPORTED: Set<number> = new Set([CHAIN_IDS.PLASMA]);

/**
 * Chains where CoW Protocol is fully supported
 * (ComposableCoW + HooksTrampoline + flash loan providers)
 */
const COW_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.LINEA,
  CHAIN_IDS.PLASMA,
  CHAIN_IDS.HARDHAT,
]);

/**
 * Chains where Pendle is available
 */
const PENDLE_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.PLASMA,
  CHAIN_IDS.HARDHAT,
]);

/**
 * Chains where Aave V3 is available
 */
const AAVE_V3_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.LINEA,
  CHAIN_IDS.PLASMA,
  CHAIN_IDS.HARDHAT,
]);

/**
 * Chains where Balancer V2 is available
 */
const BALANCER_V2_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.HARDHAT,
]);

/**
 * Chains where Balancer V3 is available
 */
const BALANCER_V3_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.HARDHAT,
]);

/**
 * Chains where Morpho Blue is available
 */
const MORPHO_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.OPTIMISM,
]);

/**
 * Chains where ZeroLend is available
 */
const ZEROLEND_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.LINEA,
  CHAIN_IDS.BASE,
]);

/**
 * Chains where Spark is available
 */
const SPARK_SUPPORTED: Set<number> = new Set([CHAIN_IDS.MAINNET]);

/**
 * Chains where Venus is available
 */
const VENUS_SUPPORTED: Set<number> = new Set([
  CHAIN_IDS.MAINNET,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.UNICHAIN,
]);

// ==================== SUPPORT CHECK FUNCTIONS ====================

export function is1inchSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return !ONEINCH_UNSUPPORTED.has(chainId);
}

export function isCowProtocolSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return COW_SUPPORTED.has(chainId);
}

export function isPendleSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return PENDLE_SUPPORTED.has(chainId);
}

export function isAaveV3Supported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return AAVE_V3_SUPPORTED.has(chainId);
}

export function isBalancerV2Supported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return BALANCER_V2_SUPPORTED.has(chainId);
}

export function isBalancerV3Supported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return BALANCER_V3_SUPPORTED.has(chainId);
}

export function isMorphoSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return MORPHO_SUPPORTED.has(chainId);
}

export function isZeroLendSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return ZEROLEND_SUPPORTED.has(chainId);
}

export function isSparkSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return SPARK_SUPPORTED.has(chainId);
}

export function isVenusSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return VENUS_SUPPORTED.has(chainId);
}

// ==================== ADDRESS VALIDATION ====================

/**
 * Check if an address is an Aave V3 Pool
 */
export function isAaveV3Pool(address: string): boolean {
  const lower = address.toLowerCase();
  return Object.values(AAVE_V3_POOL_ADDRESSES)
    .filter((a): a is Address => a !== undefined)
    .some(a => a.toLowerCase() === lower);
}

/**
 * Check if an address is a Balancer Vault
 */
export function isBalancerVault(address: string): boolean {
  const lower = address.toLowerCase();
  return lower === BALANCER_VAULTS.V2.toLowerCase() || lower === BALANCER_VAULTS.V3.toLowerCase();
}

/**
 * Check if an address is a Morpho Blue contract
 */
export function isMorphoBlue(address: string): boolean {
  const lower = address.toLowerCase();
  return Object.values(MORPHO_ADDRESSES)
    .filter((a): a is Address => a !== undefined)
    .some(a => a.toLowerCase() === lower);
}

// ==================== FLASH LOAN FEES ====================

/**
 * Flash loan fees in basis points (1 bps = 0.01%)
 */
export const FLASH_LOAN_FEES_BPS = {
  BalancerV2: 0,
  BalancerV3: 0,
  Morpho: 0,
  Aave: 5,       // 0.05%
  ZeroLend: 5,   // 0.05% (Aave fork)
  UniswapV3: 30, // ~0.3% varies by pool
} as const;

// ==================== SWAP ROUTER UTILITIES ====================

/**
 * Get the default swap router for a chain
 */
export function getDefaultSwapRouter(chainId: number | undefined): "1inch" | "pendle" | undefined {
  if (chainId === undefined) return undefined;
  if (is1inchSupported(chainId)) return "1inch";
  if (isPendleSupported(chainId)) return "pendle";
  return undefined;
}

/**
 * Check if a token symbol indicates a Pendle PT (Principal Token)
 */
export function isPendleToken(symbol: string | undefined): boolean {
  if (!symbol) return false;
  const sym = symbol.toLowerCase();
  return sym.startsWith("pt-") || sym.startsWith("pt ");
}

/**
 * Get the best swap router based on token symbols and chain support
 */
export function getBestSwapRouter(
  chainId: number | undefined,
  fromSymbol?: string,
  toSymbol?: string
): "1inch" | "pendle" | undefined {
  if (chainId === undefined) return undefined;

  // If either token is a PT token and Pendle is available, use Pendle
  if (isPendleSupported(chainId) && (isPendleToken(fromSymbol) || isPendleToken(toSymbol))) {
    return "pendle";
  }

  return getDefaultSwapRouter(chainId);
}

/**
 * Get all available swap routers for a chain
 */
export function getAvailableSwapRouters(chainId: number | undefined): Array<"1inch" | "pendle"> {
  const routers: Array<"1inch" | "pendle"> = [];
  if (is1inchSupported(chainId)) routers.push("1inch");
  if (isPendleSupported(chainId)) routers.push("pendle");
  return routers;
}

// ==================== FORK CHAIN UTILITIES ====================

/**
 * Fork chain ID from env (for local Hardhat development)
 */
export const FORK_CHAIN_ID = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_FORK_CHAIN_ID
  ? parseInt(process.env.NEXT_PUBLIC_FORK_CHAIN_ID, 10)
  : CHAIN_IDS.ARBITRUM;

/**
 * Maps a chain ID to the effective chain for external API calls.
 * When chainId is 31337 (local hardhat), returns the forked chain ID.
 */
export function getEffectiveChainId(chainId: number): number {
  if (chainId === CHAIN_IDS.HARDHAT) {
    return FORK_CHAIN_ID;
  }
  return chainId;
}

/**
 * Check if we're on a local fork
 */
export function isLocalFork(chainId: number): boolean {
  return chainId === CHAIN_IDS.HARDHAT;
}

/**
 * Returns the fork chain name for display purposes
 */
export function getForkChainName(): string {
  return CHAIN_NAMES[FORK_CHAIN_ID] || "unknown";
}
