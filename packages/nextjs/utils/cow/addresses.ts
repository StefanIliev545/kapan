import {
  COW_API_URLS,
  COW_EXPLORER_URLS,
  COW_PROTOCOL,
  COW_FLASH_LOAN_ROUTER,
  COW_AAVE_BORROWERS,
  BALANCER,
  MORPHO_BLUE,
  AAVE_V3_POOLS,
  isCowChainSupported,
  getKapanCowAdapterAddress,
} from "~~/utils/constants";

// Re-export from shared constants for backwards compatibility
export { COW_PROTOCOL, COW_API_URLS, COW_EXPLORER_URLS, MORPHO_BLUE, AAVE_V3_POOLS, COW_FLASH_LOAN_ROUTER, COW_AAVE_BORROWERS };

// Flash loan provider name constants
const BALANCER_V2_NAME = "Balancer V2";
const BALANCER_V3_NAME = "Balancer V3";

// Helper to safely get addresses from protocol maps (throws at build time if missing)
function requireAddress(address: string | undefined, name: string): string {
  if (!address) throw new Error(`Missing required address: ${name}`);
  return address;
}

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
  return isCowChainSupported(chainId);
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
  return getKapanCowAdapterAddress(chainId);
}

/**
 * Flash loan lender addresses by chain ID
 * Used for market orders (KapanRouter) - all providers supported
 */
export const FLASH_LOAN_LENDERS: Record<number, Record<string, string>> = {
  // Ethereum Mainnet
  1: {
    aaveV3: requireAddress(AAVE_V3_POOLS[1], "AAVE_V3_POOLS[1]"),
    balancerV2: BALANCER.v2Vault,
  },
  // Arbitrum One
  42161: {
    aaveV3: requireAddress(AAVE_V3_POOLS[42161], "AAVE_V3_POOLS[42161]"),
    balancerV2: BALANCER.v2Vault,
  },
  // Base
  8453: {
    aaveV3: requireAddress(AAVE_V3_POOLS[8453], "AAVE_V3_POOLS[8453]"),
    balancerV2: BALANCER.v2Vault,
  },
  // Optimism
  10: {
    aaveV3: requireAddress(AAVE_V3_POOLS[10], "AAVE_V3_POOLS[10]"),
    balancerV2: BALANCER.v2Vault,
  },
  // Gnosis Chain
  100: {
    balancerV2: BALANCER.v2Vault,
  },
  // Polygon
  137: {
    aaveV3: requireAddress(AAVE_V3_POOLS[137], "AAVE_V3_POOLS[137]"),
    balancerV2: BALANCER.v2Vault,
  },
  // Linea
  59144: {
    aaveV3: requireAddress(AAVE_V3_POOLS[59144], "AAVE_V3_POOLS[59144]"),
  },
  // Avalanche
  43114: {
    aaveV3: requireAddress(AAVE_V3_POOLS[43114], "AAVE_V3_POOLS[43114]"),
  },
};

/**
 * CoW flash loan provider type
 */
export type CowFlashLoanProvider = {
  address: string;
  provider: "morpho" | "balancerV2" | "balancerV3" | "aaveV3";
  feeBps: number;
  name: string;
};

/**
 * Flash loan lenders supported by KapanCowAdapter per chain
 * Order matters: first provider is the default preference
 */
export const COW_FLASH_LOAN_PROVIDERS: Record<number, CowFlashLoanProvider[]> = {
  // Ethereum Mainnet - Morpho (0%), Balancer V2/V3 (0%), Aave (0.05%)
  1: [
    { address: requireAddress(MORPHO_BLUE[1], "MORPHO_BLUE[1]"), provider: "morpho", feeBps: 0, name: "Morpho Blue" },
    { address: BALANCER.v2Vault, provider: "balancerV2", feeBps: 0, name: BALANCER_V2_NAME },
    { address: BALANCER.v3Vault, provider: "balancerV3", feeBps: 0, name: BALANCER_V3_NAME },
    { address: requireAddress(AAVE_V3_POOLS[1], "AAVE_V3_POOLS[1]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
  // Base - Morpho (0%), Balancer V2/V3 (0%), Aave (0.05%)
  8453: [
    { address: requireAddress(MORPHO_BLUE[8453], "MORPHO_BLUE[8453]"), provider: "morpho", feeBps: 0, name: "Morpho Blue" },
    { address: BALANCER.v2Vault, provider: "balancerV2", feeBps: 0, name: BALANCER_V2_NAME },
    { address: BALANCER.v3Vault, provider: "balancerV3", feeBps: 0, name: BALANCER_V3_NAME },
    { address: requireAddress(AAVE_V3_POOLS[8453], "AAVE_V3_POOLS[8453]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
  // Arbitrum - Morpho (0%), Balancer V2/V3 (0%), Aave (0.05%)
  42161: [
    { address: requireAddress(MORPHO_BLUE[42161], "MORPHO_BLUE[42161]"), provider: "morpho", feeBps: 0, name: "Morpho Blue" },
    { address: BALANCER.v2Vault, provider: "balancerV2", feeBps: 0, name: BALANCER_V2_NAME },
    { address: BALANCER.v3Vault, provider: "balancerV3", feeBps: 0, name: BALANCER_V3_NAME },
    { address: requireAddress(AAVE_V3_POOLS[42161], "AAVE_V3_POOLS[42161]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
  // Optimism - Balancer V2/V3 (0%), Aave (0.05%)
  10: [
    { address: BALANCER.v2Vault, provider: "balancerV2", feeBps: 0, name: BALANCER_V2_NAME },
    { address: BALANCER.v3Vault, provider: "balancerV3", feeBps: 0, name: BALANCER_V3_NAME },
    { address: requireAddress(AAVE_V3_POOLS[10], "AAVE_V3_POOLS[10]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
  // Polygon - Balancer (0%), Aave (0.05%)
  137: [
    { address: BALANCER.v2Vault, provider: "balancerV2", feeBps: 0, name: BALANCER_V2_NAME },
    { address: requireAddress(AAVE_V3_POOLS[137], "AAVE_V3_POOLS[137]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
  // Gnosis - Balancer only (0%)
  100: [
    { address: BALANCER.v2Vault, provider: "balancerV2", feeBps: 0, name: BALANCER_V2_NAME },
  ],
  // Linea - Aave only (0.05%) - Balancer not deployed on Linea
  59144: [
    { address: requireAddress(AAVE_V3_POOLS[59144], "AAVE_V3_POOLS[59144]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
  // Avalanche - Aave only (0.05%)
  43114: [
    { address: requireAddress(AAVE_V3_POOLS[43114], "AAVE_V3_POOLS[43114]"), provider: "aaveV3", feeBps: 5, name: "Aave V3" },
  ],
};

/**
 * Legacy: Flash loan lenders supported by KapanCowAdapter (single per chain)
 * @deprecated Use COW_FLASH_LOAN_PROVIDERS instead
 */
export const COW_FLASH_LOAN_LENDERS: Record<number, string | undefined> = {
  1: MORPHO_BLUE[1],       // Ethereum - Morpho Blue
  8453: MORPHO_BLUE[8453], // Base - Morpho Blue
  42161: MORPHO_BLUE[42161], // Arbitrum - Morpho Blue
  10: BALANCER.v2Vault,    // Optimism - Balancer V2
  137: BALANCER.v2Vault,   // Polygon - Balancer V2
  100: BALANCER.v2Vault,   // Gnosis - Balancer V2
  59144: AAVE_V3_POOLS[59144], // Linea - Aave V3
  43114: AAVE_V3_POOLS[43114], // Avalanche - Aave V3
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
  const lower = lenderAddress.toLowerCase();
  return Object.values(MORPHO_BLUE)
    .filter((a): a is string => a !== undefined)
    .some(a => a.toLowerCase() === lower);
}

/**
 * Map FlashLoanProvider enum (from market orders) to CoW provider type
 * @param providerEnum - The FlashLoanProvider enum value
 * @returns CoW provider type string or undefined if not supported
 */
export function mapFlashLoanProviderToCow(providerEnum: number): "morpho" | "balancerV2" | "balancerV3" | "aaveV3" | undefined {
  // FlashLoanProvider enum: BalancerV2=0, BalancerV3=1, Aave=2, ZeroLend=3, UniswapV3=4, Morpho=5
  switch (providerEnum) {
    case 0: return "balancerV2";  // BalancerV2
    case 1: return "balancerV3";  // BalancerV3
    case 2: return "aaveV3";      // Aave
    case 3: return "aaveV3";      // ZeroLend (Aave fork, uses same interface)
    case 5: return "morpho";      // Morpho
    default: return undefined;   // UniswapV3 not yet supported in CoW adapter
  }
}

/**
 * Get all available CoW flash loan providers for a chain
 */
export function getCowFlashLoanProviders(chainId: number): CowFlashLoanProvider[] {
  return COW_FLASH_LOAN_PROVIDERS[chainId] ?? [];
}

/**
 * Get the appropriate flash loan lender for a chain
 * Prefers Morpho (0% fee) when available, then Balancer (0%), then Aave (0.05%)
 * @param chainId - Chain ID
 * @param preferredProvider - Optional: override the default selection
 */
export function getPreferredFlashLoanLender(
  chainId: number,
  preferredProvider?: "morpho" | "balancerV2" | "balancerV3" | "aaveV3"
): { address: string; provider: string; feeBps: number } | undefined {
  const providers = COW_FLASH_LOAN_PROVIDERS[chainId];
  if (!providers || providers.length === 0) {
    return undefined;
  }

  // If user specified a preference, try to use it
  if (preferredProvider) {
    const preferred = providers.find(p => p.provider === preferredProvider);
    if (preferred) {
      return { address: preferred.address, provider: preferred.provider, feeBps: preferred.feeBps };
    }
  }

  // Otherwise use the first (default) provider
  const defaultProvider = providers[0];
  return { address: defaultProvider.address, provider: defaultProvider.provider, feeBps: defaultProvider.feeBps };
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
export function getFlashLoanLender(chainId: number, provider = "aaveV3"): string | undefined {
  return FLASH_LOAN_LENDERS[chainId]?.[provider];
}

/**
 * Get flash loan fee in basis points
 * @param provider - Flash loan provider name
 * @returns Fee in basis points
 */
export function getFlashLoanFeeBps(provider = "aaveV3"): number {
  return FLASH_LOAN_FEES[provider] ?? 5; // Default to 5 bps
}

/**
 * Calculate flash loan fee amount
 * @param amount - Loan amount
 * @param provider - Flash loan provider
 * @returns Fee amount
 */
export function calculateFlashLoanFee(amount: bigint, provider = "aaveV3"): bigint {
  const feeBps = getFlashLoanFeeBps(provider);
  return (amount * BigInt(feeBps)) / 10000n;
}
