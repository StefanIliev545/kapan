/**
 * Unified Token Balance Hooks
 *
 * This module provides a consolidated set of hooks for fetching token balances
 * across EVM and Starknet networks. It unifies various balance-related hooks
 * into a single, consistent API.
 *
 * ## Quick Start
 *
 * ```tsx
 * import { useTokenBalance, useNativeBalance, useMultiTokenBalance } from "~~/hooks/balance";
 *
 * // Single token balance
 * const { balance, formatted, isLoading } = useTokenBalance({
 *   tokenAddress: "0x...",
 *   network: "evm",
 * });
 *
 * // Native currency (ETH)
 * const { balance: ethBalance } = useNativeBalance({ network: "evm" });
 *
 * // Multiple tokens
 * const { balances } = useMultiTokenBalance({
 *   tokens: [{ address: "0x..." }, { address: "0x..." }],
 *   network: "evm",
 * });
 * ```
 *
 * ## Hook Selection Guide
 *
 * | Use Case | Hook | Notes |
 * |----------|------|-------|
 * | Single ERC20 token | `useTokenBalance` | Supports both EVM and Starknet |
 * | Native currency (ETH) | `useNativeBalance` | With optional block-watching |
 * | Multiple tokens | `useMultiTokenBalance` | Efficient multicall on EVM |
 * | Scaffold contract | `useScaffoldTokenBalance` | Resolves contract names |
 *
 * ## Network Support
 *
 * All hooks support both "evm" and "starknet" networks:
 * - EVM: Uses wagmi/viem with multicall optimization
 * - Starknet: Uses starknet-react with parallel RPC calls
 *
 * ## Migration from Legacy Hooks
 *
 * The following legacy imports are still supported for backward compatibility:
 *
 * ```tsx
 * // These still work:
 * import { useTokenBalance } from "~~/hooks/useTokenBalance";
 * import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
 * import { useWatchBalance } from "~~/hooks/scaffold-eth/useWatchBalance";
 *
 * // New unified imports (preferred):
 * import { useTokenBalance, useNativeBalance, useMultiTokenBalance } from "~~/hooks/balance";
 * ```
 */

// Main hooks
export { useTokenBalance } from "~~/hooks/useTokenBalance";
export { useNativeBalance } from "./useNativeBalance";
export { useMultiTokenBalance } from "./useMultiTokenBalance";

// Types
export type {
  BalanceNetworkType,
  TokenInfo,
  UseTokenBalanceOptions,
  TokenBalanceResult,
  UseNativeBalanceOptions,
  UseMultiTokenBalanceOptions,
  MultiTokenBalanceResult,
} from "./types";

// Re-export legacy hooks for backward compatibility
export { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
export { useWatchBalance } from "~~/hooks/scaffold-eth/useWatchBalance";

// Re-export scaffold-stark balance hooks
export { useScaffoldTokenBalance } from "~~/hooks/scaffold-stark/useScaffoldTokenBalance";
export { default as useScaffoldEthBalance } from "~~/hooks/scaffold-stark/useScaffoldEthBalance";
export { default as useScaffoldStrkBalance } from "~~/hooks/scaffold-stark/useScaffoldStrkBalance";

// Utility
export { normalizeAddress } from "~~/hooks/useWalletTokenBalances";
