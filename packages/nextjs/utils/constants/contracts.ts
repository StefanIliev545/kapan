/**
 * Shared contract utilities
 * Provides type-safe access to deployed contracts across the codebase
 *
 * This file consolidates:
 * 1. Type-safe contract access patterns
 * 2. Contract address lookup utilities
 * 3. Common contract type definitions
 */

import deployedContracts from "~~/contracts/hardhat/deployedContracts";
import { Address } from "viem";

/**
 * Type definition for deployed contract info
 */
export type ContractInfo = {
  address: Address;
  abi: readonly unknown[];
};

/**
 * Type definition for chain contracts mapping
 */
export type ChainContracts = Record<string, ContractInfo>;

/**
 * Type-safe contracts accessor
 * Use this instead of manually casting deployedContracts
 */
export const contracts = deployedContracts as unknown as Record<number, ChainContracts>;

/**
 * Get contract info by name for a specific chain
 * @param chainId - Chain ID
 * @param contractName - Name of the contract
 * @returns Contract info or undefined if not deployed
 */
export function getContractInfo(
  chainId: number | undefined,
  contractName: string
): ContractInfo | undefined {
  if (!chainId) return undefined;
  return contracts[chainId]?.[contractName];
}

/**
 * Get contract address by name for a specific chain
 * @param chainId - Chain ID
 * @param contractName - Name of the contract
 * @returns Contract address or undefined if not deployed
 */
export function getContractAddress(
  chainId: number | undefined,
  contractName: string
): Address | undefined {
  return getContractInfo(chainId, contractName)?.address;
}

// ==================== KAPAN CONTRACT ACCESSORS ====================

/**
 * Get KapanRouter contract info
 */
export function getKapanRouterInfo(chainId: number | undefined): ContractInfo | undefined {
  return getContractInfo(chainId, "KapanRouter");
}

/**
 * Get KapanRouter contract address
 */
export function getKapanRouterAddress(chainId: number | undefined): Address | undefined {
  return getContractAddress(chainId, "KapanRouter");
}

/**
 * Get KapanOrderManager contract info
 */
export function getKapanOrderManagerInfo(chainId: number | undefined): ContractInfo | undefined {
  return getContractInfo(chainId, "KapanOrderManager");
}

/**
 * Get KapanOrderManager contract address
 */
export function getKapanOrderManagerAddress(chainId: number | undefined): Address | undefined {
  return getContractAddress(chainId, "KapanOrderManager");
}

/**
 * Get KapanCowAdapter contract info
 */
export function getKapanCowAdapterInfo(chainId: number | undefined): ContractInfo | undefined {
  return getContractInfo(chainId, "KapanCowAdapter");
}

/**
 * Get KapanCowAdapter contract address
 */
export function getKapanCowAdapterAddress(chainId: number | undefined): Address | undefined {
  return getContractAddress(chainId, "KapanCowAdapter");
}

// ==================== ADAPTER CONTRACT ACCESSORS ====================

/**
 * Get PendleAdapter contract info
 */
export function getPendleAdapterInfo(chainId: number | undefined): ContractInfo | undefined {
  return getContractInfo(chainId, "PendleAdapter");
}

/**
 * Get PendleAdapter contract address
 */
export function getPendleAdapterAddress(chainId: number | undefined): Address | undefined {
  return getContractAddress(chainId, "PendleAdapter");
}

/**
 * Get OneInchAdapter contract info
 */
export function getOneInchAdapterInfo(chainId: number | undefined): ContractInfo | undefined {
  return getContractInfo(chainId, "OneInchAdapter");
}

/**
 * Get OneInchAdapter contract address
 */
export function getOneInchAdapterAddress(chainId: number | undefined): Address | undefined {
  return getContractAddress(chainId, "OneInchAdapter");
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if a contract is deployed on a specific chain
 * @param chainId - Chain ID
 * @param contractName - Name of the contract
 * @returns true if contract is deployed
 */
export function isContractDeployed(
  chainId: number | undefined,
  contractName: string
): boolean {
  return getContractAddress(chainId, contractName) !== undefined;
}

/**
 * Get all deployed contract names for a chain
 * @param chainId - Chain ID
 * @returns Array of contract names
 */
export function getDeployedContractNames(chainId: number | undefined): string[] {
  if (!chainId) return [];
  return Object.keys(contracts[chainId] ?? {});
}
