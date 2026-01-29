/**
 * useWalletTokenBalances Hook
 *
 * Core implementation for multi-token balance fetching across networks.
 * This hook is the internal workhorse that powers useTokenBalance and useMultiTokenBalance.
 *
 * **Features:**
 * - EVM: Uses multicall for efficient batched RPC calls
 * - Starknet: Parallel RPC calls with snake_case/camelCase fallback
 * - React Query caching with 30s stale time
 * - Automatic refetching every 30 seconds
 *
 * **For most use cases, prefer the higher-level hooks:**
 * - Single token: `useTokenBalance` from `~~/hooks/useTokenBalance`
 * - Multiple tokens: `useMultiTokenBalance` from `~~/hooks/balance`
 * - Native currency: `useNativeBalance` from `~~/hooks/balance`
 *
 * @module useWalletTokenBalances
 */

import { useQuery } from "@tanstack/react-query";
import { useProvider as useStarkProvider } from "@starknet-react/core";
import { Abi, Address } from "viem";
import { useAccount as useEvmAccount, usePublicClient } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useAccount as useStarkAccount } from "./useAccount";
import { addrKey } from "~~/utils/address";

/** Network type for balance fetching */
type NetworkType = "evm" | "starknet" | "stark";

/** Input for a single token balance query */
type TokenBalanceInput = {
  /** Token contract address */
  address: string;
  /** Known decimals (optional, fetched if not provided) */
  decimals?: number;
};

/** Result map: normalized address -> balance info */
type TokenBalanceResult = Record<string, { balance: bigint; decimals?: number }>;

/**
 * Normalize an address to lowercase for use as a map key.
 * @deprecated Use addrKey from ~~/utils/address instead
 */
export const normalizeAddress = addrKey;

const getCallResult = (response: unknown): string[] | undefined => {
  // starknet.js v6+ returns array directly, older versions return { result: [...] }
  if (Array.isArray(response)) {
    return response as string[];
  }
  return (response as { result?: string[] })?.result;
};

const useEvmBalances = (tokens: TokenBalanceInput[], chainId?: number, ownerAddress?: string) => {
  const { address: connectedAddress } = useEvmAccount();
  const publicClient = usePublicClient({ chainId });

  // Use provided owner address or fall back to connected wallet
  const address = (ownerAddress ?? connectedAddress) as Address | undefined;
  const enabled = Boolean(address && publicClient && tokens.length > 0);

  return useQuery({
    queryKey: ["wallet-token-balances", "evm", chainId, address, tokens.map(t => normalizeAddress(t.address))],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<TokenBalanceResult> => {
      if (!publicClient || !address) return {};

      type MulticallContract = {
        address: Address;
        abi: Abi;
        functionName: "balanceOf" | "decimals";
        args?: readonly [Address];
      };

      const contracts: MulticallContract[] = [];
      const balanceIndices: number[] = [];
      const decimalsIndices: Array<number | null> = [];

      tokens.forEach(token => {
        balanceIndices.push(contracts.length);
        contracts.push({
          address: token.address as Address,
          abi: ERC20ABI as Abi,
          functionName: "balanceOf",
          args: [address] as const,
        });

        if (token.decimals === undefined) {
          decimalsIndices.push(contracts.length);
          contracts.push({
            address: token.address as Address,
            abi: ERC20ABI as Abi,
            functionName: "decimals",
          });
        } else {
          decimalsIndices.push(null);
        }
      });

      const results = await publicClient.multicall({ contracts, allowFailure: true });

      return tokens.reduce((acc, token, index) => {
        const balanceResult = results[balanceIndices[index]];
        const balance =
          balanceResult.status === "success" && balanceResult.result != null ? BigInt(balanceResult.result as bigint) : 0n;

        const decimalsIndex = decimalsIndices[index];
        const decimalsResult = decimalsIndex != null ? results[decimalsIndex] : null;
        const decimalsValue =
          token.decimals !== undefined
            ? token.decimals
            : decimalsResult?.status === "success" && decimalsResult.result != null
              ? Number(decimalsResult.result as number)
              : undefined;

        acc[normalizeAddress(token.address)] = { balance, decimals: decimalsValue };
        return acc;
      }, {} as TokenBalanceResult);
    },
  });
};

const useStarknetBalances = (tokens: TokenBalanceInput[], ownerAddress?: string) => {
  const { address: connectedAddress } = useStarkAccount();
  const { provider } = useStarkProvider();

  // Use provided owner address or fall back to connected wallet
  const address = ownerAddress ?? connectedAddress;
  const enabled = Boolean(address && provider && tokens.length > 0);

  return useQuery({
    queryKey: ["wallet-token-balances", "starknet", address, tokens.map(t => normalizeAddress(t.address))],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<TokenBalanceResult> => {
      if (!provider || !address) return {};

      const parseUint256 = (response?: unknown) => {
        const result = getCallResult(response);

        if (!result || result.length === 0) return 0n;

        if (result.length >= 2) {
          const low = BigInt(result[0]);
          const high = BigInt(result[1]);
          return (high << 128n) + low;
        }

        return BigInt(result[0]);
      };

      const balancesAndDecimals = await Promise.all(
        tokens.map(async token => {
          const fetchBalance = async () => {
            try {
              const balanceResponse = await provider.callContract({
                contractAddress: token.address as `0x${string}`,
                entrypoint: "balance_of",
                calldata: [address as `0x${string}`],
              });

              return parseUint256(balanceResponse);
            } catch (balanceOfError) {
              try {
                const camelBalanceResponse = await provider.callContract({
                  contractAddress: token.address as `0x${string}`,
                  entrypoint: "balanceOf",
                  calldata: [address as `0x${string}`],
                });

                return parseUint256(camelBalanceResponse);
              } catch (camelBalanceError) {
                console.warn("Failed to fetch Starknet balance for", token.address, balanceOfError, camelBalanceError);
                return 0n;
              }
            }
          };

          const fetchDecimals = async () => {
            if (token.decimals !== undefined) return token.decimals;

            try {
              const decimalsResponse = await provider.callContract({
                contractAddress: token.address as `0x${string}`,
                entrypoint: "decimals",
                calldata: [],
              });

              const decimalsResult = getCallResult(decimalsResponse)?.[0];
              return decimalsResult !== undefined ? Number(BigInt(decimalsResult)) : undefined;
            } catch (decimalsError) {
              console.warn("Failed to fetch Starknet decimals for", token.address, decimalsError);
              return undefined;
            }
          };

          const [balance, decimals] = await Promise.all([fetchBalance(), fetchDecimals()]);

          return { balance, decimals };
        }),
      );

      return tokens.reduce((acc, token, index) => {
        const { balance, decimals } = balancesAndDecimals[index];
        acc[normalizeAddress(token.address)] = { balance, decimals };
        return acc;
      }, {} as TokenBalanceResult);
    },
  });
};

/**
 * Hook for fetching multiple token balances efficiently.
 *
 * This is the core multi-token balance hook. For most use cases, consider using
 * the higher-level `useMultiTokenBalance` from `~~/hooks/balance` instead.
 *
 * **EVM Implementation:**
 * - Uses viem's multicall to batch balanceOf and decimals calls
 * - Single RPC round-trip for all tokens
 *
 * **Starknet Implementation:**
 * - Parallel RPC calls (no native multicall)
 * - Tries snake_case (balance_of) then camelCase (balanceOf) for compatibility
 *
 * @example
 * ```tsx
 * const { balances, isLoading, refetch } = useWalletTokenBalances({
 *   tokens: [
 *     { address: "0xUSDC...", decimals: 6 },
 *     { address: "0xWETH..." }, // decimals will be fetched
 *   ],
 *   network: "evm",
 *   chainId: 42161,
 * });
 *
 * // Access balance by normalized (lowercase) address
 * const usdcBalance = balances["0xusdc..."]?.balance ?? 0n;
 * ```
 *
 * @param options - Configuration object
 * @returns Object with balances map, loading state, and refetch function
 */
export const useWalletTokenBalances = ({
  tokens,
  network,
  chainId,
  ownerAddress,
}: {
  /** Array of tokens to fetch balances for */
  tokens: TokenBalanceInput[];
  /** Network type: "evm", "starknet", or "stark" */
  network: NetworkType;
  /** Chain ID (EVM only, uses current chain if not specified) */
  chainId?: number;
  /** Owner address to check balance for. Defaults to connected wallet. */
  ownerAddress?: string;
}) => {
  const normalizedNetwork = network === "stark" ? "starknet" : network;
  const isEvm = normalizedNetwork === "evm";

  // Call both hooks unconditionally to satisfy React's rules of hooks
  // Pass empty arrays when not the active network to avoid unnecessary requests
  const evmResult = useEvmBalances(isEvm ? tokens : [], chainId, ownerAddress);
  const starkResult = useStarknetBalances(isEvm ? [] : tokens, ownerAddress);

  const queryResult = isEvm ? evmResult : starkResult;

  return {
    balances: queryResult.data ?? {},
    isLoading: queryResult.isLoading || queryResult.isFetching,
    refetch: queryResult.refetch,
  };
};

export type WalletTokenBalancesHookReturn = ReturnType<typeof useWalletTokenBalances>;

