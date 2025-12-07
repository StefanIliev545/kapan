import { useQuery } from "@tanstack/react-query";
import { useProvider as useStarkProvider } from "@starknet-react/core";
import { Abi, Address } from "viem";
import { useAccount as useEvmAccount, usePublicClient } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useAccount as useStarkAccount } from "./useAccount";

type NetworkType = "evm" | "starknet" | "stark";

type TokenBalanceInput = {
  address: string;
  decimals?: number;
};

type TokenBalanceResult = Record<string, { balance: bigint; decimals?: number }>;

export const normalizeAddress = (address: string) => address.toLowerCase();

const getCallResult = (response: unknown) => (response as { result?: string[] })?.result;

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

      const parseBalanceResponse = (response?: unknown) => {
        const balanceRaw = getCallResult(response)?.[0];
        return balanceRaw ? BigInt(balanceRaw) : 0n;
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

              return parseBalanceResponse(balanceResponse);
            } catch (balanceOfError) {
              try {
                const camelBalanceResponse = await provider.callContract({
                  contractAddress: token.address as `0x${string}`,
                  entrypoint: "balanceOf",
                  calldata: [address as `0x${string}`],
                });

                return parseBalanceResponse(camelBalanceResponse);
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

export const useWalletTokenBalances = ({
  tokens,
  network,
  chainId,
}: {
  tokens: TokenBalanceInput[];
  network: NetworkType;
  chainId?: number;
}) => {
  const normalizedNetwork = network === "stark" ? "starknet" : network;
  const queryResult = normalizedNetwork === "evm" ? useEvmBalances(tokens, chainId) : useStarknetBalances(tokens);

  return {
    balances: queryResult.data ?? {},
    isLoading: queryResult.isLoading || queryResult.isFetching,
    refetch: queryResult.refetch,
  };
};

export type WalletTokenBalancesHookReturn = ReturnType<typeof useWalletTokenBalances>;

