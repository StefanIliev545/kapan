/**
 * Simple chain feature availability maps.
 * 
 * 1inch: Available on all EVM chains EXCEPT Plasma
 * Pendle: Mainnet, Arbitrum, Base, Optimism, Plasma (per deploy script)
 */

import {
  getContractAddress,
  getContractInfo,
} from "~~/utils/constants/contracts";
import { Address } from "viem";

// Chains where 1inch is NOT available
const ONEINCH_UNAVAILABLE = new Set([
  9745, // Plasma - 1inch not supported
]);

// Chains where CoW Protocol (ComposableCoW + HooksTrampoline) IS available
// AND we have flash loan providers configured in KapanCowAdapter.
// Note: Optimism has HooksTrampoline but NOT ComposableCoW as of Jan 2025.
const COW_PROTOCOL_AVAILABLE = new Set([
  1,     // Mainnet
  42161, // Arbitrum
  8453,  // Base
  59144, // Linea
  9745,  // Plasma
  31337, // Hardhat (for local dev with fork)
]);

// Chains where Pendle IS available (from deploy script PENDLE_ROUTERS)
const PENDLE_AVAILABLE = new Set([
  1,     // Mainnet
  10,    // Optimism
  42161, // Arbitrum
  8453,  // Base
  9745,  // Plasma
  130,   // Unichain
  31337, // Hardhat (for local dev)
]);

// ==================== FLASH LOAN PROVIDER AVAILABILITY ====================
// IMPORTANT: Keep in sync with packages/hardhat/deploy/v2/00_deploy_kapan_router.ts
// and packages/hardhat/deploy/v2/04_deploy_zero_lend_gateway_write.ts

const AAVE_V3_AVAILABLE = new Set([
  1,     // Mainnet
  10,    // Optimism
  42161, // Arbitrum
  8453,  // Base
  59144, // Linea
  9745,  // Plasma
  31337, // Hardhat
]);

const BALANCER_V2_AVAILABLE = new Set([
  1,     // Mainnet
  42161, // Arbitrum
  8453,  // Base
  10,    // Optimism
  130,   // Unichain
  31337, // Hardhat
]);

const BALANCER_V3_AVAILABLE = new Set([
  1,     // Mainnet
  42161, // Arbitrum
  8453,  // Base
  10,    // Optimism
  9745,  // Plasma (deployed via BIP-874)
  31337, // Hardhat
]);

// Morpho Blue singleton addresses (from 00_deploy_kapan_router.ts MORPHO map)
const MORPHO_AVAILABLE = new Set([
  1,     // Mainnet
  42161, // Arbitrum
  8453,  // Base
  10,    // Optimism
  130,   // Unichain (different address: 0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A)
]);

// ZeroLend (from 04_deploy_zero_lend_gateway_write.ts MAP)
// Note: Mainnet LRT market has frozen reserves as of Jan 2026, so excluded
const ZEROLEND_AVAILABLE = new Set([
  // 1,  // Mainnet (LRT market) - FROZEN, all reserves paused
  59144, // Linea
  8453,  // Base
]);

// ==================== DESTINATION PROTOCOL AVAILABILITY ====================
// IMPORTANT: Keep in sync with packages/hardhat/deploy/v2/ gateway deploy scripts

// Spark (from 05_deploy_spark_gateway_write.ts)
const SPARK_AVAILABLE = new Set([
  1,     // Mainnet only
]);

// Venus (from 03_deploy_venus_gateway_write.ts VENUS map)
const VENUS_AVAILABLE = new Set([
  1,     // Mainnet
  42161, // Arbitrum
  8453,  // Base
  130,   // Unichain
]);

// Euler V2 (from 11_deploy_euler_gateway.ts CONFIG)
// Note: Mainnet excluded - gateway not deployed yet (too expensive pre-feature-complete)
const EULER_AVAILABLE = new Set([
  10,    // Optimism
  130,   // Unichain
  8453,  // Base
  9745,  // Plasma
  42161, // Arbitrum
  59144, // Linea
  31337, // Hardhat (for local dev with fork)
]);

// Flash loan fees in basis points (1 bps = 0.01%)
export const FLASH_LOAN_FEES_BPS = {
  BalancerV2: 0,
  BalancerV3: 0,
  Morpho: 0,
  Aave: 5,       // 0.05%
  ZeroLend: 5,   // 0.05% (Aave fork)
  UniswapV3: 30, // ~0.3% varies by pool
} as const;

// ==================== SWAP ROUTERS ====================

export function is1inchSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return !ONEINCH_UNAVAILABLE.has(chainId);
}

export function isPendleSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return PENDLE_AVAILABLE.has(chainId);
}

export function getDefaultSwapRouter(chainId: number | undefined): "1inch" | "pendle" | undefined {
  if (chainId === undefined) return undefined;
  // Prefer 1inch if available, otherwise Pendle
  if (is1inchSupported(chainId)) return "1inch";
  if (isPendleSupported(chainId)) return "pendle";
  return undefined;
}

/**
 * Check if a token symbol indicates a Pendle PT (Principal Token)
 * PT tokens should use Pendle router as 1inch typically has no liquidity
 */
export function isPendleToken(symbol: string | undefined): boolean {
  if (!symbol) return false;
  const sym = symbol.toLowerCase();
  // PT tokens: pt-xxx, PT-xxx
  // Could also match SY tokens: sy-xxx but those are less common in user flows
  return sym.startsWith("pt-") || sym.startsWith("pt ");
}

/**
 * Get the best swap router based on token symbols and chain support
 * Prefers Pendle for PT tokens, otherwise uses default logic
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
  
  // Otherwise use default logic
  return getDefaultSwapRouter(chainId);
}

export function getAvailableSwapRouters(chainId: number | undefined): Array<"1inch" | "pendle"> {
  const routers: Array<"1inch" | "pendle"> = [];
  if (is1inchSupported(chainId)) routers.push("1inch");
  if (isPendleSupported(chainId)) routers.push("pendle");
  return routers;
}

// ==================== COW PROTOCOL ====================

export function isCowProtocolSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return COW_PROTOCOL_AVAILABLE.has(chainId);
}

// ==================== FLASH LOANS ====================

export function isAaveV3Supported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return AAVE_V3_AVAILABLE.has(chainId);
}

export function isBalancerV2Supported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return BALANCER_V2_AVAILABLE.has(chainId);
}

export function isBalancerV3Supported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return BALANCER_V3_AVAILABLE.has(chainId);
}

export function isMorphoSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return MORPHO_AVAILABLE.has(chainId);
}

export function isZeroLendSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return ZEROLEND_AVAILABLE.has(chainId);
}

// ==================== DESTINATION PROTOCOLS ====================

export function isSparkSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return SPARK_AVAILABLE.has(chainId);
}

export function isVenusSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return VENUS_AVAILABLE.has(chainId);
}

export function isEulerSupported(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return EULER_AVAILABLE.has(chainId);
}

// Morpho Blue as destination uses the same availability as flash loan
export { isMorphoSupported as isMorphoBlueSupported };

// Legacy exports for backwards compatibility
export const CHAIN_IDS = {
  MAINNET: 1,
  ARBITRUM: 42161,
  BASE: 8453,
  OPTIMISM: 10,
  LINEA: 59144,
  PLASMA: 9745,
  UNICHAIN: 130,
  HARDHAT: 31337,
} as const;

// ==================== ADAPTER ADDRESSES ====================
// Get adapter addresses directly from deployed contracts - no RPC calls needed
// Uses shared utilities from utils/constants/contracts.ts

export function getPendleAdapterAddress(chainId: number | undefined): Address | undefined {
  if (!chainId || !isPendleSupported(chainId)) return undefined;
  return getContractAddress(chainId, "PendleAdapter");
}

export function getOneInchAdapterAddress(chainId: number | undefined): Address | undefined {
  if (!chainId || !is1inchSupported(chainId)) return undefined;
  return getContractAddress(chainId, "OneInchAdapter");
}

export function getPendleAdapterInfo(chainId: number | undefined) {
  if (!chainId || !isPendleSupported(chainId)) return undefined;
  return getContractInfo(chainId, "PendleAdapter");
}

export function getOneInchAdapterInfo(chainId: number | undefined) {
  if (!chainId || !is1inchSupported(chainId)) return undefined;
  return getContractInfo(chainId, "OneInchAdapter");
}

export function getCowAdapterAddress(chainId: number | undefined): Address | undefined {
  if (!chainId || !isCowProtocolSupported(chainId)) return undefined;
  return getContractAddress(chainId, "KapanCowAdapter");
}

export function getCowAdapterInfo(chainId: number | undefined) {
  if (!chainId || !isCowProtocolSupported(chainId)) return undefined;
  return getContractInfo(chainId, "KapanCowAdapter");
}
