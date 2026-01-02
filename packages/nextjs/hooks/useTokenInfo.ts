import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { type Address, type Abi } from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";

export interface TokenInfo {
  symbol: string;
  decimals: number;
}

// Cache for token info to avoid redundant RPC calls
const tokenInfoCache = new Map<string, TokenInfo>();

export function useTokenInfo(
  tokenAddresses: Address[],
  chainId?: number
): Map<string, TokenInfo> {
  const publicClient = usePublicClient({ chainId });
  const [tokenInfoMap, setTokenInfoMap] = useState<Map<string, TokenInfo>>(new Map());

  useEffect(() => {
    if (!publicClient || tokenAddresses.length === 0) return;

    const fetchTokenInfo = async () => {
      const newMap = new Map<string, TokenInfo>();
      const uncachedAddresses: Address[] = [];

      // Check cache first
      for (const address of tokenAddresses) {
        const key = `${chainId ?? "default"}-${address.toLowerCase()}`;
        const cached = tokenInfoCache.get(key);
        if (cached) {
          newMap.set(address.toLowerCase(), cached);
        } else {
          uncachedAddresses.push(address);
        }
      }

      // Fetch uncached tokens
      if (uncachedAddresses.length > 0) {
        const calls = uncachedAddresses.flatMap(address => [
          {
            address,
            abi: ERC20ABI as Abi,
            functionName: "symbol",
          },
          {
            address,
            abi: ERC20ABI as Abi,
            functionName: "decimals",
          },
        ]);

        try {
          const results = await publicClient.multicall({ contracts: calls });
          
          for (let i = 0; i < uncachedAddresses.length; i++) {
            const address = uncachedAddresses[i];
            const symbolResult = results[i * 2];
            const decimalsResult = results[i * 2 + 1];
            
            const symbol = symbolResult.status === "success" 
              ? (symbolResult.result as string)
              : `${address.slice(0, 6)}...${address.slice(-4)}`;
            
            const decimals = decimalsResult.status === "success"
              ? Number(decimalsResult.result)
              : 18;
            
            const info: TokenInfo = { symbol, decimals };
            const key = `${chainId ?? "default"}-${address.toLowerCase()}`;
            tokenInfoCache.set(key, info);
            newMap.set(address.toLowerCase(), info);
          }
        } catch (error) {
          console.error("Failed to fetch token info:", error);
          // Fallback for failed fetches
          for (const address of uncachedAddresses) {
            newMap.set(address.toLowerCase(), {
              symbol: `${address.slice(0, 6)}...${address.slice(-4)}`,
              decimals: 18,
            });
          }
        }
      }

      setTokenInfoMap(newMap);
    };

    fetchTokenInfo();
  }, [publicClient, tokenAddresses.join(","), chainId]);

  return tokenInfoMap;
}

// Single token helper hook
export function useSingleTokenInfo(tokenAddress: Address | undefined, chainId?: number): TokenInfo | null {
  const addresses = tokenAddress ? [tokenAddress] : [];
  const infoMap = useTokenInfo(addresses as Address[], chainId);
  
  if (!tokenAddress) return null;
  return infoMap.get(tokenAddress.toLowerCase()) ?? null;
}
