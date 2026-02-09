import { formatUnits } from "ethers";
import { normalizeAddress, useWalletTokenBalances } from "./useWalletTokenBalances";

/**
 * Network type for balance fetching.
 * - "evm": Ethereum and EVM-compatible chains
 * - "stark" / "starknet": Starknet L2
 */
export type Network = "evm" | "stark" | "starknet";

/**
 * Options for the useTokenBalance hook.
 *
 * @see {@link ../balance/types.ts} for the canonical type definitions
 */
export type UseTokenBalanceOptions = {
  /** Token contract address */
  tokenAddress: string;
  /** Network type - "evm", "stark", or "starknet" */
  network?: Network;
  /** Chain ID (EVM only, uses current chain if not specified) */
  chainId?: number;
  /** Known decimals to avoid extra RPC call */
  decimalsHint?: number;
  /** Symbol to include in return value */
  symbol?: string;
  /** Owner address to check balance for. Defaults to connected wallet. */
  ownerAddress?: string;
};

/**
 * Return type for useTokenBalance hook.
 *
 * Provides a unified interface matching wagmi's balance structure
 * while supporting both EVM and Starknet networks.
 */
export type UseTokenBalanceReturn = {
  /** Raw balance as bigint (in smallest units, e.g., wei) */
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
  /** Error object if isError is true */
  error?: Error | null;
  /** Refetch function to manually trigger a balance update */
  refetch: () => void;
};

/**
 * Unified hook for fetching ERC20 token balances on EVM or Starknet.
 *
 * This is the primary hook for token balance fetching across networks.
 * It handles the differences between EVM (wagmi/viem) and Starknet (starknet-react)
 * internally, providing a consistent interface.
 *
 * **When to use this hook:**
 * - Fetching ERC20 token balances on any supported network
 * - When you need a unified interface for cross-network components
 *
 * **When to use other hooks:**
 * - For native ETH balance: use `useNativeBalance` from `~~/hooks/balance`
 * - For multiple tokens: use `useMultiTokenBalance` from `~~/hooks/balance`
 * - For scaffold contract names: use `useScaffoldTokenBalance` from scaffold-stark
 *
 * @example Basic usage with object options (recommended)
 * ```tsx
 * const { balance, formatted, isLoading } = useTokenBalance({
 *   tokenAddress: "0xUSDC...",
 *   network: "evm",
 *   chainId: 42161,  // Arbitrum
 *   decimalsHint: 6,
 *   symbol: "USDC",
 * });
 *
 * // Display the balance
 * return <span>{isLoading ? "..." : formatted} USDC</span>;
 * ```
 *
 * @example Starknet token balance
 * ```tsx
 * const { balance, formatted } = useTokenBalance({
 *   tokenAddress: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
 *   network: "starknet",
 *   decimalsHint: 18,
 *   symbol: "ETH",
 * });
 * ```
 *
 * @example Check another address's balance
 * ```tsx
 * const { balance } = useTokenBalance({
 *   tokenAddress: "0x...",
 *   network: "evm",
 *   ownerAddress: "0x1234...",  // Check this address instead of connected wallet
 * });
 * ```
 *
 * @example Legacy signature (deprecated, for backward compatibility)
 * ```ts
 * const { balance, decimals } = useTokenBalance(tokenAddress, network, chainId, decimalsHint);
 * ```
 *
 * @see useNativeBalance - For native currency (ETH) balances
 * @see useMultiTokenBalance - For fetching multiple token balances efficiently
 */
export function useTokenBalance(options: UseTokenBalanceOptions): UseTokenBalanceReturn;
/**
 * @deprecated Use object signature instead: useTokenBalance({ tokenAddress, network, chainId, decimalsHint })
 */
export function useTokenBalance(
  tokenAddress: string,
  network?: Network,
  chainId?: number,
  decimalsHint?: number,
): UseTokenBalanceReturn;
export function useTokenBalance(
  optionsOrAddress: UseTokenBalanceOptions | string,
  networkArg?: Network,
  chainIdArg?: number,
  decimalsHintArg?: number,
): UseTokenBalanceReturn {
  // Normalize arguments to options object
  const options: UseTokenBalanceOptions =
    typeof optionsOrAddress === "string"
      ? {
          tokenAddress: optionsOrAddress,
          network: networkArg,
          chainId: chainIdArg,
          decimalsHint: decimalsHintArg,
        }
      : optionsOrAddress;

  const { tokenAddress, network = "evm", chainId, decimalsHint, symbol, ownerAddress } = options;

  // Normalize "stark" to "starknet" for internal hook
  const normalizedNetwork = network === "stark" || network === "starknet" ? "starknet" : "evm";
  const { balances, isLoading, refetch } = useWalletTokenBalances({
    tokens: [{ address: tokenAddress, decimals: decimalsHint }],
    network: normalizedNetwork,
    chainId,
    ownerAddress,
  });

  const tokenKey = normalizeAddress(tokenAddress);
  const entry = balances[tokenKey];

  const balance = entry?.balance ?? 0n;
  const decimals = entry?.decimals ?? decimalsHint;
  const formatted = decimals !== undefined ? formatUnits(balance, decimals) : "0";

  return {
    balance,
    value: balance,
    decimals,
    symbol,
    formatted,
    isLoading,
    isError: false, // useWalletTokenBalances doesn't expose error state currently
    error: null,
    refetch,
  };
}
