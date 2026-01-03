import deployedContracts from "~~/contracts/hardhat/deployedContracts";
import { Address } from "viem";

// Type for deployed contracts structure
const contracts = deployedContracts as unknown as Record<number, Record<string, { address: Address; abi: unknown[] }>>;

/**
 * CoW Protocol contract addresses
 * These are deterministic and the same on all supported chains
 */
export const COW_PROTOCOL = {
  /** GPv2Settlement contract - handles all order settlements */
  settlement: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  
  /** ComposableCoW contract - enables conditional orders via ERC-1271 */
  composableCoW: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
  
  /** VaultRelayer contract - authorized to transfer tokens on behalf of users */
  vaultRelayer: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
  
  /** HooksTrampoline contract - executes pre/post hooks during settlement */
  hooksTrampoline: "0x60Bf78233f48eC42eE3F101b9a05eC7878728006",
  
  /** GPv2AllowlistAuthentication - manages authorized solvers */
  authenticator: "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE",
} as const;

/** CoW Protocol API base URLs by chain ID */
export const COW_API_URLS: Record<number, string> = {
  1: "https://api.cow.fi/mainnet",        // Ethereum
  42161: "https://api.cow.fi/arbitrum_one", // Arbitrum One (NOT "arbitrum"!)
  8453: "https://api.cow.fi/base",         // Base
  10: "https://api.cow.fi/optimism",       // Optimism
  100: "https://api.cow.fi/xdai",          // Gnosis Chain
  137: "https://api.cow.fi/polygon",       // Polygon
  43114: "https://api.cow.fi/avalanche",   // Avalanche
  56: "https://api.cow.fi/bnb",            // BNB Chain
  59144: "https://api.cow.fi/linea",       // Linea
};

/** CoW Explorer base URLs by chain ID */
export const COW_EXPLORER_URLS: Record<number, string> = {
  1: "https://explorer.cow.fi",
  42161: "https://explorer.cow.fi/arb1",
  8453: "https://explorer.cow.fi/base",
  10: "https://explorer.cow.fi/op",
  100: "https://explorer.cow.fi/gc",
  137: "https://explorer.cow.fi/polygon",
  43114: "https://explorer.cow.fi/avalanche",
  56: "https://explorer.cow.fi/bnb",
  59144: "https://explorer.cow.fi/linea",
};

/**
 * Get CoW Explorer URL for an order
 * @param chainId - Chain ID
 * @param orderHash - The order hash (Kapan order hash or CoW order UID)
 * @returns Explorer URL or undefined if chain not supported
 */
export function getCowExplorerOrderUrl(chainId: number, orderHash: string): string | undefined {
  const baseUrl = COW_EXPLORER_URLS[chainId];
  if (!baseUrl) return undefined;
  return `${baseUrl}/orders/${orderHash}`;
}

/**
 * Get CoW Explorer URL for an address (to see all orders)
 * @param chainId - Chain ID
 * @param address - User address
 * @returns Explorer URL or undefined if chain not supported
 */
export function getCowExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const baseUrl = COW_EXPLORER_URLS[chainId];
  if (!baseUrl) return undefined;
  return `${baseUrl}/address/${address}`;
}

/**
 * Check if a chain supports CoW Protocol
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in COW_API_URLS;
}

/**
 * Get the CoW API URL for a chain
 */
export function getCowApiUrl(chainId: number): string | undefined {
  return COW_API_URLS[chainId];
}

/**
 * GPv2Order constants for hashing and validation
 */
export const GPV2_ORDER = {
  /** Order kind: sell */
  KIND_SELL: "0xf3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee346775" as const,
  /** Order kind: buy */
  KIND_BUY: "0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc" as const,
  /** Token balance: erc20 (standard) */
  BALANCE_ERC20: "0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9" as const,
  /** Token balance: external (from Balancer internal balance) */
  BALANCE_EXTERNAL: "0xabee3b73373acd583a130924aad6dc38cfdc44ba0555ba94ce2ff63980ea0632" as const,
  /** Token balance: internal (Balancer internal balance) */
  BALANCE_INTERNAL: "0x4ac99ace14ee0a5ef932dc609df0943ab7ac16b7583634612f8dc35a4289a6ce" as const,
} as const;

/**
 * Trade flags for settlement encoding
 */
export const TRADE_FLAGS = {
  /** EIP-1271 signature scheme (bits 5-6 = 0b10) */
  EIP1271: 0x40,
  /** Sell order (bit 0 = 0) */
  SELL_ORDER: 0x00,
  /** Buy order (bit 0 = 1) */
  BUY_ORDER: 0x01,
  /** Fill-or-kill (bit 1 = 0) */
  FILL_OR_KILL: 0x00,
  /** Partially fillable (bit 1 = 1) */
  PARTIALLY_FILLABLE: 0x02,
} as const;

/**
 * CoW Protocol Flash Loan Router contracts (same address on all chains via CREATE2)
 * @see https://github.com/cowprotocol/flash-loan-router
 * 
 * IMPORTANT: Currently only Aave V3 is supported for CoW flash loans.
 * Balancer V2 does NOT implement ERC-3156 and there is no BalancerBorrower deployed.
 * ERC3156Borrower only works with ERC-3156 compliant lenders (Maker, etc.), NOT Balancer.
 */
export const COW_FLASH_LOAN_ROUTER = {
  /** Main router contract */
  router: "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69",
  /** Aave V3 borrower adapter - default for most chains */
  aaveBorrower: "0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A",
  /** ERC-3156 compatible borrower adapter (for Maker, etc. - NOT Balancer V2!) */
  erc3156Borrower: "0x47d71b4B3336AB2729436186C216955F3C27cD04",
} as const;

/**
 * Chain-specific Aave V3 borrower adapters for CoW flash loans
 * Some chains use factory-deployed adapters instead of the standard AaveBorrower
 */
export const COW_AAVE_BORROWERS: Record<number, string> = {
  // Base uses AaveV3AdapterFactory-deployed adapter (standard AaveBorrower doesn't work)
  8453: "0xdeCC46a4b09162F5369c5C80383AAa9159bCf192",
  // All other chains use the standard AaveBorrower
};

/**
 * Get the KapanCowAdapter address for a chain
 * Reads from deployedContracts to always stay in sync with deployments
 * 
 * KapanCowAdapter is our custom borrower adapter that integrates with CoW's FlashLoanRouter
 * and routes tokens to KapanOrderManager for hooks execution
 * 
 * Flow:
 * 1. FlashLoanRouter calls KapanCowAdapter.flashLoanAndCallBack()
 * 2. Adapter requests flash loan from Morpho/Aave
 * 3. Pre-hook: Adapter.fundOrder() transfers tokens to OrderManager
 * 4. Trade executes with OrderManager as owner
 * 5. Post-hook: OrderManager deposits/borrows, transfers repayment to Adapter
 * 6. Adapter repays flash loan
 * 
 * @param chainId - Chain ID
 * @returns Adapter address or undefined if not deployed
 */
export function getKapanCowAdapter(chainId: number): string | undefined {
  return contracts[chainId]?.KapanCowAdapter?.address;
}

/**
 * Flash loan lender addresses by chain ID
 * Used for market orders (KapanRouter) - all providers supported
 */
export const FLASH_LOAN_LENDERS: Record<number, Record<string, string>> = {
  // Ethereum Mainnet
  1: {
    aaveV3: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    balancerV2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Arbitrum One
  42161: {
    aaveV3: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    balancerV2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Base
  8453: {
    aaveV3: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    balancerV2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Optimism
  10: {
    aaveV3: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    balancerV2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Gnosis Chain
  100: {
    balancerV2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Polygon
  137: {
    aaveV3: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    balancerV2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Linea
  59144: {
    aaveV3: "0x3E5f750726cc1D0d4a9c62c507f890f984576507",
  },
  // Avalanche
  43114: {
    aaveV3: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
};

/**
 * Morpho Blue addresses by chain (0% flash loan fee - RECOMMENDED!)
 * @see https://docs.morpho.org/overview/contracts
 */
export const MORPHO_BLUE: Record<number, string | undefined> = {
  1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",     // Ethereum Mainnet
  8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",  // Base
  42161: "0x6c247b1F6182318877311737BaC0844bAa518F5e", // Arbitrum
};

/**
 * Flash loan lenders supported by KapanCowAdapter
 * Prefers Morpho (0% fee) when available, falls back to Aave (0.05% fee)
 */
export const COW_FLASH_LOAN_LENDERS: Record<number, string | undefined> = {
  // Prefer Morpho Blue (0% fee) on chains where it's available
  1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",      // Ethereum - Morpho Blue (0% fee!)
  8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",   // Base - Morpho Blue (0% fee!)
  // Fall back to Aave V3 on other chains (0.05% fee)
  42161: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",  // Arbitrum - Aave V3
  10: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",     // Optimism - Aave V3
  137: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",    // Polygon - Aave V3
  59144: "0x3E5f750726cc1D0d4a9c62c507f890f984576507",  // Linea - Aave V3
  43114: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",  // Avalanche - Aave V3
  // Gnosis (100) - No flash loan providers available
};

/**
 * Aave V3 Pool addresses (fallback when Morpho not available)
 */
export const AAVE_V3_POOLS: Record<number, string | undefined> = {
  1: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",      // Ethereum
  42161: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",  // Arbitrum
  8453: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",   // Base
  10: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",     // Optimism
  137: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",    // Polygon
  59144: "0x3E5f750726cc1D0d4a9c62c507f890f984576507",  // Linea
  43114: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",  // Avalanche
};

/**
 * Flash loan fees by provider (in basis points)
 */
export const FLASH_LOAN_FEES: Record<string, number> = {
  morpho: 0,      // 0% - RECOMMENDED!
  aaveV3: 5,      // 0.05%
  balancerV2: 0,  // 0% (but not supported by CoW FlashLoanRouter)
};

/**
 * Check if a lender address is Morpho Blue
 */
export function isMorphoLender(lenderAddress: string): boolean {
  const morphoAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb".toLowerCase();
  return lenderAddress.toLowerCase() === morphoAddress;
}

/**
 * Get the appropriate flash loan lender for a chain
 * Prefers Morpho (0% fee) when available
 */
export function getPreferredFlashLoanLender(chainId: number): { address: string; provider: string; feeBps: number } | undefined {
  // Check Morpho first (0% fee)
  const morpho = MORPHO_BLUE[chainId];
  if (morpho) {
    return { address: morpho, provider: "morpho", feeBps: 0 };
  }
  
  // Fall back to Aave (0.05% fee)
  const aave = AAVE_V3_POOLS[chainId];
  if (aave) {
    return { address: aave, provider: "aaveV3", feeBps: 5 };
  }
  
  return undefined;
}

/**
 * Get CoW-compatible flash loan lender for a chain
 * Only returns Aave V3 addresses since CoW's FlashLoanRouter only supports Aave
 * @param chainId - Chain ID
 * @returns Aave V3 Pool address or undefined if not available
 */
export function getCowFlashLoanLender(chainId: number): string | undefined {
  return COW_FLASH_LOAN_LENDERS[chainId];
}

/**
 * Get flash loan lender address for a chain
 * @param chainId - Chain ID
 * @param provider - Flash loan provider name (aaveV3, balancerV2)
 * @returns Lender address or undefined
 */
export function getFlashLoanLender(chainId: number, provider: string = "aaveV3"): string | undefined {
  return FLASH_LOAN_LENDERS[chainId]?.[provider];
}

/**
 * Get flash loan fee in basis points
 * @param provider - Flash loan provider name
 * @returns Fee in basis points
 */
export function getFlashLoanFeeBps(provider: string = "aaveV3"): number {
  return FLASH_LOAN_FEES[provider] ?? 5; // Default to 5 bps
}

/**
 * Calculate flash loan fee amount
 * @param amount - Loan amount
 * @param provider - Flash loan provider
 * @returns Fee amount
 */
export function calculateFlashLoanFee(amount: bigint, provider: string = "aaveV3"): bigint {
  const feeBps = getFlashLoanFeeBps(provider);
  return (amount * BigInt(feeBps)) / 10000n;
}
