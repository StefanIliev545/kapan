/**
 * Consolidated Flash Loan Utilities
 *
 * This module provides a single source of truth for flash loan provider types,
 * availability checking, and provider selection logic.
 *
 * Previously this logic was duplicated across:
 * - hooks/useMovePositionData.ts
 * - hooks/useFlashLoanSelection.ts
 * - utils/cow/addresses.ts
 */

import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import {
  isBalancerV2Supported,
  isBalancerV3Supported,
  isAaveV3Supported,
  isMorphoSupported,
  FLASH_LOAN_FEES_BPS,
} from "~~/utils/chainFeatures";

// Re-export the enum for convenience
export { FlashLoanProvider };

/**
 * Valid version identifiers for flash loan providers.
 * Used to map to FlashLoanProvider enum for router instructions.
 *
 * Note: "v1" is used for Starknet Vesu flash loans which have a different mechanism
 * than EVM flash loans. It's included here for type compatibility.
 */
export type FlashLoanVersion = "v1" | "v2" | "v3" | "aave" | "morpho";

/**
 * Flash loan provider option for UI components.
 * Used in dropdowns and selection interfaces.
 */
export interface FlashLoanProviderOption {
  /** Display name (e.g., "Balancer V2", "Aave") */
  name: string;
  /** Version identifier used for internal logic (e.g., "v2", "aave", "morpho") */
  version: FlashLoanVersion;
  /** Path to provider logo */
  icon: string;
  /** Enum value from FlashLoanProvider - used in router instructions */
  providerEnum: FlashLoanProvider;
  /** Fee in basis points (1 bps = 0.01%) */
  feeBps: number;
}

/**
 * All available flash loan providers with their metadata.
 * Order represents the default preference (zero-fee providers first).
 */
export const ALL_FLASH_LOAN_PROVIDERS: FlashLoanProviderOption[] = [
  {
    name: "Balancer V2",
    version: "v2",
    icon: "/logos/balancer.svg",
    providerEnum: FlashLoanProvider.BalancerV2,
    feeBps: FLASH_LOAN_FEES_BPS.BalancerV2,
  },
  {
    name: "Morpho",
    version: "morpho",
    icon: "/logos/morpho.svg",
    providerEnum: FlashLoanProvider.Morpho,
    feeBps: FLASH_LOAN_FEES_BPS.Morpho,
  },
  {
    name: "Balancer V3",
    version: "v3",
    icon: "/logos/balancer.svg",
    providerEnum: FlashLoanProvider.BalancerV3,
    feeBps: FLASH_LOAN_FEES_BPS.BalancerV3,
  },
  {
    name: "Aave",
    version: "aave",
    icon: "/logos/aave.svg",
    providerEnum: FlashLoanProvider.Aave,
    feeBps: FLASH_LOAN_FEES_BPS.Aave,
  },
];

/**
 * Priority order for auto-selecting flash loan providers.
 * Zero-fee providers first, then by reliability/liquidity.
 */
export const FLASH_LOAN_PRIORITY: FlashLoanProvider[] = [
  FlashLoanProvider.BalancerV2,  // 0% fee, most liquid
  FlashLoanProvider.Morpho,      // 0% fee
  FlashLoanProvider.BalancerV3,  // 0% fee
  FlashLoanProvider.Aave,        // 0.05% fee
];

/**
 * Get available flash loan providers for a specific chain.
 * Returns providers in priority order (zero-fee first).
 *
 * @param chainId - The chain ID to check
 * @returns Array of available provider options
 */
export function getAvailableFlashLoanProviders(chainId: number | undefined): FlashLoanProviderOption[] {
  if (chainId === undefined) return [];

  const providers: FlashLoanProviderOption[] = [];

  // Order by preference: zero-fee providers first
  if (isBalancerV2Supported(chainId)) {
    providers.push(ALL_FLASH_LOAN_PROVIDERS[0]); // Balancer V2
  }
  if (isMorphoSupported(chainId)) {
    providers.push(ALL_FLASH_LOAN_PROVIDERS[1]); // Morpho
  }
  if (isBalancerV3Supported(chainId)) {
    providers.push(ALL_FLASH_LOAN_PROVIDERS[2]); // Balancer V3
  }
  if (isAaveV3Supported(chainId)) {
    providers.push(ALL_FLASH_LOAN_PROVIDERS[3]); // Aave
  }
  return providers;
}

/**
 * Get the default (preferred) flash loan provider for a chain.
 *
 * @param chainId - The chain ID
 * @returns The preferred provider option, or undefined if none available
 */
export function getDefaultFlashLoanProvider(chainId: number | undefined): FlashLoanProviderOption | undefined {
  const providers = getAvailableFlashLoanProviders(chainId);
  return providers[0];
}

/**
 * Find a provider option by its enum value.
 *
 * @param providerEnum - The FlashLoanProvider enum value
 * @returns The matching provider option, or undefined
 */
export function getProviderByEnum(providerEnum: FlashLoanProvider): FlashLoanProviderOption | undefined {
  return ALL_FLASH_LOAN_PROVIDERS.find(p => p.providerEnum === providerEnum);
}

/**
 * Find a provider option by its name.
 *
 * @param name - The provider name (case-insensitive)
 * @returns The matching provider option, or undefined
 */
export function getProviderByName(name: string): FlashLoanProviderOption | undefined {
  const lowerName = name.toLowerCase();
  return ALL_FLASH_LOAN_PROVIDERS.find(p => p.name.toLowerCase() === lowerName);
}

/**
 * Find a provider option by its version string.
 *
 * @param version - The version string (e.g., "v2", "aave", "morpho")
 * @returns The matching provider option, or undefined
 */
export function getProviderByVersion(version: string): FlashLoanProviderOption | undefined {
  return ALL_FLASH_LOAN_PROVIDERS.find(p => p.version === version);
}

/**
 * Map a version string to the FlashLoanProvider enum.
 * Used when recovering order data or converting UI selections to router calls.
 *
 * @param version - The version string from provider option
 * @returns The corresponding FlashLoanProvider enum value
 */
export function versionToProviderEnum(version: FlashLoanVersion | string): FlashLoanProvider {
  switch (version) {
    case "aave":
      return FlashLoanProvider.Aave;
    case "morpho":
      return FlashLoanProvider.Morpho;
    case "v3":
      return FlashLoanProvider.BalancerV3;
    case "v2":
    default:
      return FlashLoanProvider.BalancerV2;
  }
}

/**
 * Get the fee in basis points for a provider.
 *
 * @param providerEnum - The FlashLoanProvider enum value
 * @returns Fee in basis points
 */
export function getFlashLoanFeeBps(providerEnum: FlashLoanProvider): number {
  switch (providerEnum) {
    case FlashLoanProvider.BalancerV2:
      return FLASH_LOAN_FEES_BPS.BalancerV2;
    case FlashLoanProvider.BalancerV3:
      return FLASH_LOAN_FEES_BPS.BalancerV3;
    case FlashLoanProvider.Morpho:
      return FLASH_LOAN_FEES_BPS.Morpho;
    case FlashLoanProvider.Aave:
      return FLASH_LOAN_FEES_BPS.Aave;
    case FlashLoanProvider.UniswapV3:
      return FLASH_LOAN_FEES_BPS.UniswapV3;
    default:
      return 5; // Default to 5 bps
  }
}

/**
 * Calculate the flash loan fee amount.
 *
 * @param amount - The loan amount
 * @param providerEnum - The flash loan provider
 * @returns The fee amount
 */
export function calculateFlashLoanFee(amount: bigint, providerEnum: FlashLoanProvider): bigint {
  const feeBps = getFlashLoanFeeBps(providerEnum);
  return (amount * BigInt(feeBps)) / 10000n;
}

/**
 * Check if a provider charges a fee.
 *
 * @param providerEnum - The FlashLoanProvider enum value
 * @returns true if the provider has a non-zero fee
 */
export function hasFlashLoanFee(providerEnum: FlashLoanProvider): boolean {
  return getFlashLoanFeeBps(providerEnum) > 0;
}

/**
 * Select the best flash loan provider based on liquidity data.
 * Uses priority order: zero-fee providers first, then by liquidity.
 *
 * @param liquidityData - Array of provider liquidity information
 * @param availableProviders - Array of available provider options for the chain
 * @returns The best provider option, or undefined if none have sufficient liquidity
 */
export function selectBestFlashLoanProvider(
  liquidityData: Array<{ provider: FlashLoanProvider; hasLiquidity: boolean }>,
  availableProviders: FlashLoanProviderOption[]
): FlashLoanProviderOption | undefined {
  // Find the best provider with sufficient liquidity following priority order
  const bestProviderEnum = FLASH_LOAN_PRIORITY.find(p => {
    const data = liquidityData.find(d => d.provider === p);
    return data && data.hasLiquidity;
  });

  if (bestProviderEnum !== undefined) {
    return availableProviders.find(p => p.providerEnum === bestProviderEnum);
  }

  return undefined;
}
