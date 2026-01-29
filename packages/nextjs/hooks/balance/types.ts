/**
 * Types for the unified token balance system.
 *
 * This module defines common types used across all balance-related hooks,
 * providing a consistent interface for EVM and Starknet networks.
 */

/**
 * Network type for balance fetching.
 * - "evm": Ethereum Virtual Machine chains (Ethereum, Arbitrum, Base, etc.)
 * - "starknet": Starknet L2 chain
 */
export type BalanceNetworkType = "evm" | "starknet";

/**
 * Token information for balance fetching
 */
export interface TokenInfo {
  /** Token contract address */
  address: string;
  /** Token decimals (optional, fetched if not provided) */
  decimals?: number;
  /** Token symbol (optional, for display) */
  symbol?: string;
}

/**
 * Options for the useTokenBalance hook
 */
export interface UseTokenBalanceOptions {
  /** Token contract address */
  tokenAddress: string;
  /** Network type - "evm" or "starknet" */
  network?: BalanceNetworkType;
  /** Chain ID (EVM only, uses current chain if not specified) */
  chainId?: number;
  /** Known decimals to avoid extra RPC call */
  decimalsHint?: number;
  /** Symbol to include in return value */
  symbol?: string;
  /** Owner address to check balance for. Defaults to connected wallet. */
  ownerAddress?: string;
  /** Whether to enable automatic refetching */
  watch?: boolean;
  /** Refetch interval in milliseconds (default: 30000) */
  refetchInterval?: number;
}

/**
 * Return value from balance hooks
 */
export interface TokenBalanceResult {
  /** Raw balance as bigint (smallest units, e.g., wei) */
  balance: bigint;
  /** Alias for balance (wagmi compatibility) */
  value: bigint;
  /** Token decimals */
  decimals: number | undefined;
  /** Token symbol (if provided) */
  symbol: string | undefined;
  /** Human-readable formatted balance */
  formatted: string;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error message if isError is true */
  error?: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Options for the useNativeBalance hook
 */
export interface UseNativeBalanceOptions {
  /** Network type - "evm" or "starknet" */
  network?: BalanceNetworkType;
  /** Chain ID (EVM only) */
  chainId?: number;
  /** Owner address to check balance for. Defaults to connected wallet. */
  ownerAddress?: string;
  /** Whether to enable block-watching for updates (EVM only) */
  watch?: boolean;
}

/**
 * Options for fetching multiple token balances
 */
export interface UseMultiTokenBalanceOptions {
  /** Array of tokens to fetch balances for */
  tokens: TokenInfo[];
  /** Network type */
  network: BalanceNetworkType;
  /** Chain ID (EVM only) */
  chainId?: number;
  /** Owner address to check balance for. Defaults to connected wallet. */
  ownerAddress?: string;
}

/**
 * Result for multiple token balances
 */
export interface MultiTokenBalanceResult {
  /** Map of normalized token address to balance info */
  balances: Record<string, { balance: bigint; decimals?: number }>;
  /** Loading state */
  isLoading: boolean;
  /** Refetch function */
  refetch: () => void;
}
