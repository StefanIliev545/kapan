/**
 * Centralized configuration for chain-specific feature availability.
 * 
 * This file defines which chains support:
 * - Flash loan providers (Balancer V2, Balancer V3, Aave V3)
 * - Swap routers (1inch, Pendle)
 */

// Chain IDs
export const CHAIN_IDS = {
  MAINNET: 1,
  ARBITRUM: 42161,
  BASE: 8453,
  OPTIMISM: 10,
  LINEA: 59144,
  PLASMA: 9745,
  HARDHAT: 31337,
} as const;

// Flash loan provider availability by chain
export const FLASH_LOAN_CHAINS = {
  // Balancer V2 is available on these chains
  BALANCER_V2: [
    CHAIN_IDS.ARBITRUM,
    CHAIN_IDS.BASE,
    CHAIN_IDS.OPTIMISM,
    CHAIN_IDS.HARDHAT,
  ],
  // Balancer V3 is available on these chains
  BALANCER_V3: [
    CHAIN_IDS.ARBITRUM,
    CHAIN_IDS.BASE,
    CHAIN_IDS.OPTIMISM,
    CHAIN_IDS.HARDHAT,
  ],
  // Aave V3 is available on these chains
  AAVE_V3: [
    CHAIN_IDS.ARBITRUM,
    CHAIN_IDS.BASE,
    CHAIN_IDS.OPTIMISM,
    CHAIN_IDS.LINEA,
    CHAIN_IDS.PLASMA,
    CHAIN_IDS.HARDHAT,
  ],
} as const;

// Swap router availability by chain
export const SWAP_ROUTER_CHAINS = {
  // 1inch is available on these chains
  ONEINCH: [
    CHAIN_IDS.MAINNET,
    CHAIN_IDS.ARBITRUM,
    CHAIN_IDS.BASE,
    CHAIN_IDS.OPTIMISM,
    CHAIN_IDS.LINEA,
    CHAIN_IDS.HARDHAT,
    // Note: 1inch is NOT available on Plasma
  ],
  // Pendle is available on these chains
  PENDLE: [
    CHAIN_IDS.MAINNET,
    CHAIN_IDS.ARBITRUM,
    CHAIN_IDS.BASE,
    CHAIN_IDS.OPTIMISM,
    CHAIN_IDS.PLASMA,
    CHAIN_IDS.HARDHAT,
    // Note: Pendle availability depends on PT/YT markets existing
  ],
} as const;

// Helper functions

/**
 * Check if Balancer V2 flash loans are supported on a chain
 */
export const isBalancerV2Supported = (chainId: number | undefined): boolean => {
  return chainId !== undefined && FLASH_LOAN_CHAINS.BALANCER_V2.includes(chainId as typeof FLASH_LOAN_CHAINS.BALANCER_V2[number]);
};

/**
 * Check if Balancer V3 flash loans are supported on a chain
 */
export const isBalancerV3Supported = (chainId: number | undefined): boolean => {
  return chainId !== undefined && FLASH_LOAN_CHAINS.BALANCER_V3.includes(chainId as typeof FLASH_LOAN_CHAINS.BALANCER_V3[number]);
};

/**
 * Check if Aave V3 flash loans are supported on a chain
 */
export const isAaveV3Supported = (chainId: number | undefined): boolean => {
  return chainId !== undefined && FLASH_LOAN_CHAINS.AAVE_V3.includes(chainId as typeof FLASH_LOAN_CHAINS.AAVE_V3[number]);
};

/**
 * Check if 1inch swap router is supported on a chain
 */
export const is1inchSupported = (chainId: number | undefined): boolean => {
  return chainId !== undefined && SWAP_ROUTER_CHAINS.ONEINCH.includes(chainId as typeof SWAP_ROUTER_CHAINS.ONEINCH[number]);
};

/**
 * Check if Pendle swap router is supported on a chain
 */
export const isPendleSupported = (chainId: number | undefined): boolean => {
  return chainId !== undefined && SWAP_ROUTER_CHAINS.PENDLE.includes(chainId as typeof SWAP_ROUTER_CHAINS.PENDLE[number]);
};

/**
 * Get available swap routers for a chain
 */
export const getAvailableSwapRouters = (chainId: number | undefined): Array<"1inch" | "pendle"> => {
  const routers: Array<"1inch" | "pendle"> = [];
  if (is1inchSupported(chainId)) routers.push("1inch");
  if (isPendleSupported(chainId)) routers.push("pendle");
  return routers;
};

/**
 * Get the default swap router for a chain
 * Returns "1inch" if available, otherwise "pendle", or undefined if none available
 */
export const getDefaultSwapRouter = (chainId: number | undefined): "1inch" | "pendle" | undefined => {
  if (is1inchSupported(chainId)) return "1inch";
  if (isPendleSupported(chainId)) return "pendle";
  return undefined;
};
