/**
 * Shared network logo configuration for EVM and Starknet chains.
 * Provides theme-aware logo selection and centralized logo mappings.
 */

import { CHAIN_IDS } from "./chainConfig";

export interface NetworkLogoConfig {
  /** Logo for dark mode (or default if no theme-specific logo) */
  logo: string;
  /** Optional logo for light mode */
  logoDark?: string;
}

// Logo constants to avoid duplication
const ARB_LOGO = "/logos/arb.svg";
const STARKNET_LOGO = "/logos/starknet.svg";

/**
 * Network logo mappings by chain name.
 * Used as primary lookup for networks.
 */
export const NETWORK_LOGOS_BY_NAME: Record<string, NetworkLogoConfig> = {
  // EVM Networks
  Arbitrum: { logo: ARB_LOGO },
  "Arbitrum One": { logo: ARB_LOGO },
  "Arbitrum Sepolia": { logo: ARB_LOGO },
  Ethereum: { logo: "/logos/ethereum.svg" },
  Optimism: { logo: "/logos/optimism.svg" },
  Base: { logo: "/logos/base.svg" },
  Linea: { logo: "/logos/linea.svg" },
  Plasma: { logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" },
  Unichain: { logo: "/logos/unichain.svg" },
  Hardhat: { logo: "/logos/eth.svg" },
  // Starknet Networks
  Starknet: { logo: STARKNET_LOGO },
  "Starknet Mainnet": { logo: STARKNET_LOGO },
  "Starknet Sepolia": { logo: STARKNET_LOGO },
};

/**
 * Network logo mappings by chain ID.
 * Uses CHAIN_IDS from chainConfig for consistency.
 */
export const NETWORK_LOGOS_BY_CHAIN_ID: Record<number, NetworkLogoConfig> = {
  [CHAIN_IDS.MAINNET]: { logo: "/logos/ethereum.svg" },
  [CHAIN_IDS.OPTIMISM]: { logo: "/logos/optimism.svg" },
  [CHAIN_IDS.UNICHAIN]: { logo: "/logos/unichain.svg" },
  [CHAIN_IDS.BASE]: { logo: "/logos/base.svg" },
  [CHAIN_IDS.ARBITRUM]: { logo: ARB_LOGO },
  [CHAIN_IDS.LINEA]: { logo: "/logos/linea.svg" },
  [CHAIN_IDS.PLASMA]: { logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" },
  [CHAIN_IDS.HARDHAT]: { logo: "/logos/eth.svg" },
  421614: { logo: ARB_LOGO }, // Arbitrum Sepolia (testnet, not in CHAIN_IDS)
};

/**
 * Network ID to EVM chain ID mapping.
 * Used for wallet network switching based on network filter selection.
 * @deprecated Use getChainIdFromName from chainConfig instead
 */
export const NETWORK_ID_TO_CHAIN_ID: Record<string, number> = {
  ethereum: CHAIN_IDS.MAINNET,
  arbitrum: CHAIN_IDS.ARBITRUM,
  base: CHAIN_IDS.BASE,
  optimism: CHAIN_IDS.OPTIMISM,
  linea: CHAIN_IDS.LINEA,
  plasma: CHAIN_IDS.PLASMA,
  hardhat: CHAIN_IDS.HARDHAT,
};

/** Default logo when no network-specific logo is found */
export const DEFAULT_NETWORK_LOGO = "/logos/eth.svg";

/**
 * Get the theme-aware logo for a network.
 *
 * @param network - Network object with id and/or name properties
 * @param isDarkMode - Whether the UI is in dark mode
 * @returns Logo path string
 */
export function getNetworkLogo(
  network: { id?: number; name?: string } | null | undefined,
  isDarkMode: boolean
): string {
  if (!network) return DEFAULT_NETWORK_LOGO;

  // Try name-based lookup first
  let config: NetworkLogoConfig | undefined;
  if (network.name) {
    config = NETWORK_LOGOS_BY_NAME[network.name];
  }

  // Fall back to chain ID lookup
  if (!config && network.id) {
    config = NETWORK_LOGOS_BY_CHAIN_ID[network.id];
  }

  if (!config) return DEFAULT_NETWORK_LOGO;

  // In dark mode, use logo. In light mode, use logoDark if available
  if (!isDarkMode && config.logoDark) {
    return config.logoDark;
  }
  return config.logo;
}

/**
 * Get logo for a network option (used in NetworkFilter component).
 *
 * @param networkOption - Network option with logo properties
 * @param isDarkMode - Whether the UI is in dark mode
 * @returns Logo path string
 */
export function getNetworkOptionLogo(
  networkOption: { logo: string; logoDark?: string },
  isDarkMode: boolean
): string {
  // In dark mode, use the light logo (logo). In light mode, use logoDark if available
  if (!isDarkMode && networkOption.logoDark) {
    return networkOption.logoDark;
  }
  return networkOption.logo;
}
