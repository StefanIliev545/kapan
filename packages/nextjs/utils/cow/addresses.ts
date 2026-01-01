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
  1: "https://api.cow.fi/mainnet",      // Ethereum
  42161: "https://api.cow.fi/arbitrum",  // Arbitrum One
  8453: "https://api.cow.fi/base",       // Base
  10: "https://api.cow.fi/optimism",     // Optimism
  100: "https://api.cow.fi/xdai",        // Gnosis Chain
  137: "https://api.cow.fi/polygon",     // Polygon
  43114: "https://api.cow.fi/avalanche", // Avalanche
  56: "https://api.cow.fi/bnb",          // BNB Chain
  59144: "https://api.cow.fi/linea",     // Linea
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
 */
export const COW_FLASH_LOAN_ROUTER = {
  /** Main router contract */
  router: "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69",
  /** Aave-compatible borrower adapter */
  aaveBorrower: "0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A",
  /** ERC-3156 compatible borrower adapter (for Balancer, Maker, etc.) */
  erc3156Borrower: "0x47d71b4B3336AB2729436186C216955F3C27cD04",
} as const;

/**
 * Flash loan lender addresses by chain ID
 * These are used in CoW Protocol appData to hint solvers about flash loan sources
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
};

/**
 * Flash loan fees by provider (in basis points)
 */
export const FLASH_LOAN_FEES: Record<string, number> = {
  aaveV3: 5,      // 0.05%
  balancerV2: 0,  // 0%
  morpho: 0,      // 0%
};

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
