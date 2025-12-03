import { useQuery } from "@tanstack/react-query";
import { useProvider as useStarkProvider } from "@starknet-react/core";
import { Address } from "viem";
import { useAccount as useEvmAccount, usePublicClient } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useAccount as useStarkAccount } from "./useAccount";

type NetworkType = "evm" | "starknet";

type TokenBalanceInput = {
  address: string;
  decimals?: number;
};

type TokenBalanceResult = Record<string, { balance: bigint; decimals?: number }>;

const normalizeAddress = (address: string) => address.toLowerCase();

const useEvmBalances = (tokens: TokenBalanceInput[], chainId?: number) => {
  const { address } = useEvmAccount();
  const publicClient = usePublicClient({ chainId });

  const enabled = Boolean(address && publicClient && tokens.length > 0);

  return useQuery({
    queryKey: ["wallet-token-balances", "evm", chainId, address, tokens.map(t => normalizeAddress(t.address))],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<TokenBalanceResult> => {
      if (!publicClient || !address) return {};

      const contracts = tokens.map(token => ({
        address: token.address as Address,
        abi: ERC20ABI,
        functionName: "balanceOf",
        args: [address],
      }));

      const results = await publicClient.multicall({ contracts, allowFailure: true });

      return tokens.reduce((acc, token, index) => {
        const result = results[index];
        const balance = result.status === "success" && result.result != null ? BigInt(result.result as bigint) : 0n;
        acc[normalizeAddress(token.address)] = { balance, decimals: token.decimals };
        return acc;
      }, {} as TokenBalanceResult);
    },
  });
};

const useStarknetBalances = (tokens: TokenBalanceInput[]) => {
  const { address } = useStarkAccount();
  const { provider } = useStarkProvider();

  const enabled = Boolean(address && provider && tokens.length > 0);

  return useQuery({
    queryKey: ["wallet-token-balances", "starknet", address, tokens.map(t => normalizeAddress(t.address))],
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<TokenBalanceResult> => {
      if (!provider || !address) return {};

      const balances = await Promise.all(
        tokens.map(async token => {
          try {
            const response = await provider.callContract({
              contractAddress: token.address as `0x${string}`,
              entrypoint: "balance_of",
              calldata: [address as `0x${string}`],
            });

            const raw = response.result?.[0];
            return raw ? BigInt(raw) : 0n;
          } catch (error) {
            console.warn("Failed to fetch Starknet balance for", token.address, error);
            return 0n;
          }
        }),
      );

      return tokens.reduce((acc, token, index) => {
        acc[normalizeAddress(token.address)] = { balance: balances[index], decimals: token.decimals };
        return acc;
      }, {} as TokenBalanceResult);
    },
  });
};

export const useWalletTokenBalances = ({
  tokens,
  network,
  chainId,
}: {
  tokens: TokenBalanceInput[];
  network: NetworkType;
  chainId?: number;
}) => {
  const queryResult = network === "evm" ? useEvmBalances(tokens, chainId) : useStarknetBalances(tokens);

  return {
    balances: queryResult.data ?? {},
    isLoading: queryResult.isLoading || queryResult.isFetching,
    refetch: queryResult.refetch,
  };
};

export type WalletTokenBalancesHookReturn = ReturnType<typeof useWalletTokenBalances>;

