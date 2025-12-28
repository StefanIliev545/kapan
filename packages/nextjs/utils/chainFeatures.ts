/**
 * Simple chain feature availability maps.
 * 
 * 1inch: Available on all EVM chains EXCEPT Plasma
 * Pendle: Mainnet, Arbitrum, Base, Optimism, Plasma (per deploy script)
 */

import deployedContracts from "~~/contracts/hardhat/deployedContracts";
import { Address } from "viem";

// Chains where 1inch is NOT available
const ONEINCH_UNAVAILABLE = new Set([
  9745, // Plasma - 1inch not supported
]);

// Chains where Pendle IS available (from deploy script PENDLE_ROUTERS)
const PENDLE_AVAILABLE = new Set([
  1,     // Mainnet
  10,    // Optimism
  42161, // Arbitrum
  8453,  // Base
  9745,  // Plasma
  31337, // Hardhat (for local dev)
]);

// Flash loan provider availability
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
  42161, // Arbitrum
  8453,  // Base
  10,    // Optimism
  31337, // Hardhat
]);

const BALANCER_V3_AVAILABLE = new Set([
  42161, // Arbitrum
  8453,  // Base
  10,    // Optimism
  31337, // Hardhat
]);

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

// Legacy exports for backwards compatibility
export const CHAIN_IDS = {
  MAINNET: 1,
  ARBITRUM: 42161,
  BASE: 8453,
  OPTIMISM: 10,
  LINEA: 59144,
  PLASMA: 9745,
  HARDHAT: 31337,
} as const;

// ==================== ADAPTER ADDRESSES ====================
// Get adapter addresses directly from deployed contracts - no RPC calls needed

const contracts = deployedContracts as unknown as Record<number, Record<string, { address: Address; abi: unknown[] }>>;

export function getPendleAdapterAddress(chainId: number | undefined): Address | undefined {
  if (!chainId || !isPendleSupported(chainId)) return undefined;
  return contracts[chainId]?.PendleAdapter?.address;
}

export function getOneInchAdapterAddress(chainId: number | undefined): Address | undefined {
  if (!chainId || !is1inchSupported(chainId)) return undefined;
  return contracts[chainId]?.OneInchAdapter?.address;
}

export function getPendleAdapterInfo(chainId: number | undefined) {
  if (!chainId || !isPendleSupported(chainId)) return undefined;
  return contracts[chainId]?.PendleAdapter;
}

export function getOneInchAdapterInfo(chainId: number | undefined) {
  if (!chainId || !is1inchSupported(chainId)) return undefined;
  return contracts[chainId]?.OneInchAdapter;
}
