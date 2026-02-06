import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { type Address, erc20Abi, formatUnits } from "viem";
import { useExternalYields, type ExternalYield } from "./useExternalYields";
import { useMorphoMarkets } from "./useMorphoLendingPositions";
import { useTokenPrices } from "./useTokenPrice";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Major tokens whitelist (addresses by chainId)
// These are always shown if user has balance
const MAJOR_TOKENS: Record<number, Array<{ address: Address; symbol: string; decimals: number }>> = {
  1: [ // Ethereum
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EescdeCB5e8fBe6", symbol: "DAI", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
    { address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", symbol: "wstETH", decimals: 18 },
    { address: "0xae78736Cd615f374D3085123A210448E74Fc6393", symbol: "rETH", decimals: 18 },
    { address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", symbol: "cbETH", decimals: 18 },
    // Maple syrup tokens
    { address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b", symbol: "syrupUSDC", decimals: 6 },
    { address: "0x82784f72f6c5e11c90490cc3e14df7447c4dde39", symbol: "syrupUSDT", decimals: 6 },
  ],
  42161: [ // Arbitrum
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18 },
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 },
    { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", symbol: "USDC.e", decimals: 6 },
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6 },
    { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI", decimals: 18 },
    { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", symbol: "WBTC", decimals: 8 },
    { address: "0x5979D7b546E38E414F7E9822514be443A4800529", symbol: "wstETH", decimals: 18 },
    { address: "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8", symbol: "rETH", decimals: 18 },
  ],
  8453: [ // Base
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 },
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
    { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", symbol: "USDbC", decimals: 6 },
    { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", decimals: 18 },
    { address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", symbol: "wstETH", decimals: 18 },
    { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", symbol: "cbETH", decimals: 18 },
  ],
};

export interface WalletToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: number;
  usdValue: number;
  price: number; // USD price
  icon: string;
  externalYield?: ExternalYield;
  source: "major" | "morpho" | "pendle" | "maple";
}

interface TokenMetadata {
  address: Address;
  symbol: string;
  decimals: number;
  price?: number;
  source: WalletToken["source"];
}

/**
 * Hook to fetch wallet token balances with spam filtering
 * Uses whitelist approach: only shows tokens from known sources
 */
export function useWalletTokens(chainId?: number) {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { findYield } = useExternalYields(chainId);
  // useMorphoMarkets requires chainId, default to mainnet (1) if not provided
  const effectiveChainId = chainId ?? 1;
  const { marketPairs } = useMorphoMarkets(effectiveChainId, undefined);

  // Build whitelist of known tokens
  const { tokenWhitelist, symbolsNeedingPrices } = useMemo(() => {
    const tokens = new Map<string, TokenMetadata>();
    const needPrices: string[] = [];

    // Add major tokens for this chain
    const majorTokens = MAJOR_TOKENS[chainId || 1] || [];
    for (const token of majorTokens) {
      tokens.set(token.address.toLowerCase(), {
        ...token,
        address: token.address.toLowerCase() as Address,
        source: "major",
      });
      needPrices.push(token.symbol);
    }

    // Add tokens from Morpho markets (these have prices from Morpho API)
    if (marketPairs) {
      // marketPairs is Map<string, MorphoMarket[]>
      for (const markets of marketPairs.values()) {
        for (const market of markets) {
          if (market.collateralAsset?.address) {
            const addr = market.collateralAsset.address.toLowerCase();
            if (!tokens.has(addr)) {
              tokens.set(addr, {
                address: addr as Address,
                symbol: market.collateralAsset.symbol,
                decimals: market.collateralAsset.decimals || 18,
                price: market.collateralAsset.priceUsd ?? undefined,
                source: "morpho",
              });
            } else if (market.collateralAsset.priceUsd) {
              // Update price if Morpho has it
              const existing = tokens.get(addr)!;
              existing.price = market.collateralAsset.priceUsd;
            }
          }
          if (market.loanAsset?.address) {
            const addr = market.loanAsset.address.toLowerCase();
            if (!tokens.has(addr)) {
              tokens.set(addr, {
                address: addr as Address,
                symbol: market.loanAsset.symbol,
                decimals: market.loanAsset.decimals || 18,
                price: market.loanAsset.priceUsd ?? undefined,
                source: "morpho",
              });
            } else if (market.loanAsset.priceUsd) {
              // Update price if Morpho has it
              const existing = tokens.get(addr)!;
              existing.price = market.loanAsset.priceUsd;
            }
          }
        }
      }
    }

    // Collect symbols that still need prices (include ETH for native balance)
    const symbolsWithoutPrice = Array.from(tokens.values())
      .filter(t => !t.price)
      .map(t => t.symbol);

    return { tokenWhitelist: tokens, symbolsNeedingPrices: [...new Set(["ETH", ...needPrices, ...symbolsWithoutPrice])] };
  }, [chainId, marketPairs]);

  // Fetch prices for tokens without Morpho prices
  const { prices: fetchedPrices } = useTokenPrices(symbolsNeedingPrices);

  // Fetch balances for whitelisted tokens
  const query = useQuery({
    queryKey: ["wallet-tokens", chainId, userAddress, tokenWhitelist.size, Object.keys(fetchedPrices).length],
    queryFn: async (): Promise<WalletToken[]> => {
      if (!userAddress || !publicClient || tokenWhitelist.size === 0) {
        return [];
      }

      const tokenList = Array.from(tokenWhitelist.values());
      const results: WalletToken[] = [];

      // Fetch native ETH balance
      try {
        const nativeBalance = await publicClient.getBalance({ address: userAddress });
        if (nativeBalance > 0n) {
          const balanceFormatted = parseFloat(formatUnits(nativeBalance, 18));
          const ethPrice = fetchedPrices["eth"] || fetchedPrices["weth"] || 0;
          const usdValue = balanceFormatted * ethPrice;

          results.push({
            address: "0x0000000000000000000000000000000000000000" as Address,
            symbol: "ETH",
            name: "Ether",
            decimals: 18,
            balance: nativeBalance,
            balanceFormatted,
            usdValue,
            price: ethPrice,
            icon: tokenNameToLogo("eth"),
            externalYield: undefined,
            source: "major",
          });
        }
      } catch (error) {
        console.error("[useWalletTokens] Failed to fetch native balance:", error);
      }

      // Batch fetch ERC20 balances using multicall
      const balanceCalls = tokenList.map((token) => ({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [userAddress] as const,
      }));

      try {
        const balances = await publicClient.multicall({
          contracts: balanceCalls,
          allowFailure: true,
        });

        for (let i = 0; i < tokenList.length; i++) {
          const token = tokenList[i];
          const balanceResult = balances[i];

          if (balanceResult.status === "success" && balanceResult.result) {
            const balance = balanceResult.result as bigint;

            // Skip zero balances
            if (balance === 0n) continue;

            const balanceFormatted = parseFloat(formatUnits(balance, token.decimals));

            // Look up external yield data (do this first to get Pendle prices for PT tokens)
            const externalYield = findYield(token.address, token.symbol);

            // Use price sources in order of preference:
            // 1. Pendle PT price (for PT tokens - ensures consistency with displayed APY)
            // 2. Morpho price (from market data)
            // 3. CoinGecko price (fallback)
            let price = token.price || fetchedPrices[token.symbol.toLowerCase()] || 0;
            if (externalYield?.source === "pendle" && externalYield.metadata?.ptPriceUsd) {
              price = externalYield.metadata.ptPriceUsd;
            }
            const usdValue = balanceFormatted * price;

            results.push({
              address: token.address,
              symbol: token.symbol,
              name: token.symbol, // Could fetch from contract if needed
              decimals: token.decimals,
              balance,
              balanceFormatted,
              usdValue,
              price,
              icon: tokenNameToLogo(token.symbol.toLowerCase()),
              externalYield,
              source: token.source,
            });
          }
        }

        // Sort by USD value descending
        results.sort((a, b) => b.usdValue - a.usdValue);

        return results;
      } catch (error) {
        console.error("[useWalletTokens] Failed to fetch balances:", error);
        return [];
      }
    },
    enabled: !!userAddress && !!publicClient && tokenWhitelist.size > 0,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  // Calculate totals
  const totals = useMemo(() => {
    const tokens = query.data || [];
    const totalValue = tokens.reduce((sum, t) => sum + t.usdValue, 0);
    const tokenCount = tokens.length;
    return { totalValue, tokenCount };
  }, [query.data]);

  return {
    tokens: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    totalValue: totals.totalValue,
    tokenCount: totals.tokenCount,
  };
}
