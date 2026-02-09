import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { type Address, type Abi } from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { truncateAddress } from "~~/utils/address";

export interface TokenInfo {
  symbol: string;
  decimals: number;
}

// Cache for token info to avoid redundant RPC calls
const tokenInfoCache = new Map<string, TokenInfo>();

const makeCacheKey = (chainId: number | undefined, address: string): string =>
  `${chainId ?? "default"}-${address.toLowerCase()}`;

const buildMulticallContracts = (addresses: Address[]) =>
  addresses.flatMap(address => [
    { address, abi: ERC20ABI as Abi, functionName: "symbol" },
    { address, abi: ERC20ABI as Abi, functionName: "decimals" },
  ]);

type MulticallResult = { status: "success" | "failure"; result?: unknown };

const parseTokenInfoFromResults = (
  address: Address,
  symbolResult: MulticallResult,
  decimalsResult: MulticallResult,
): TokenInfo => {
  const symbol = symbolResult.status === "success"
    ? (symbolResult.result as string)
    : truncateAddress(address);
  const decimals = decimalsResult.status === "success"
    ? Number(decimalsResult.result)
    : 18;
  return { symbol, decimals };
};

const createFallbackInfo = (address: Address): TokenInfo => ({
  symbol: truncateAddress(address),
  decimals: 18,
});

const partitionByCache = (
  addresses: Address[],
  chainId: number | undefined,
): { cachedMap: Map<string, TokenInfo>; uncached: Address[] } => {
  const cachedMap = new Map<string, TokenInfo>();
  const uncached: Address[] = [];

  for (const address of addresses) {
    const key = makeCacheKey(chainId, address);
    const cached = tokenInfoCache.get(key);
    if (cached) {
      cachedMap.set(address.toLowerCase(), cached);
    } else {
      uncached.push(address);
    }
  }
  return { cachedMap, uncached };
};

export function useTokenInfo(
  tokenAddresses: Address[],
  chainId?: number
): Map<string, TokenInfo> {
  const publicClient = usePublicClient({ chainId });
  const [tokenInfoMap, setTokenInfoMap] = useState<Map<string, TokenInfo>>(new Map());

  // Stabilize tokenAddresses by serializing to a string key
  // This prevents infinite loops when callers pass new array references
  const addressesKey = useMemo(
    () => tokenAddresses.map(a => a.toLowerCase()).sort().join(","),
    [tokenAddresses]
  );

  // Memoize the normalized addresses to use in the effect
  const normalizedAddresses = useMemo(
    () => tokenAddresses.map(a => a as Address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addressesKey]
  );

  useEffect(() => {
    if (!publicClient || normalizedAddresses.length === 0) return;

    const fetchTokenInfo = async () => {
      const { cachedMap: newMap, uncached: uncachedAddresses } = partitionByCache(normalizedAddresses, chainId);

      if (uncachedAddresses.length === 0) {
        // Only update state if the map content is different
        setTokenInfoMap(prev => {
          if (prev.size === newMap.size) {
            let isSame = true;
            for (const [key, value] of newMap) {
              const prevValue = prev.get(key);
              if (!prevValue || prevValue.symbol !== value.symbol || prevValue.decimals !== value.decimals) {
                isSame = false;
                break;
              }
            }
            if (isSame) return prev;
          }
          return newMap;
        });
        return;
      }

      const calls = buildMulticallContracts(uncachedAddresses);
      try {
        const results = await publicClient.multicall({ contracts: calls });
        for (let i = 0; i < uncachedAddresses.length; i++) {
          const address = uncachedAddresses[i];
          const info = parseTokenInfoFromResults(address, results[i * 2], results[i * 2 + 1]);
          tokenInfoCache.set(makeCacheKey(chainId, address), info);
          newMap.set(address.toLowerCase(), info);
        }
      } catch (error) {
        console.error("Failed to fetch token info:", error);
        for (const address of uncachedAddresses) {
          newMap.set(address.toLowerCase(), createFallbackInfo(address));
        }
      }

      setTokenInfoMap(newMap);
    };

    fetchTokenInfo();
  }, [publicClient, normalizedAddresses, chainId]);

  return tokenInfoMap;
}

// Single token helper hook
export function useSingleTokenInfo(tokenAddress: Address | undefined, chainId?: number): TokenInfo | null {
  // Memoize the addresses array to prevent recreating on every render
  const addresses = useMemo(
    () => (tokenAddress ? [tokenAddress] : []),
    [tokenAddress]
  );
  const infoMap = useTokenInfo(addresses as Address[], chainId);

  if (!tokenAddress) return null;
  return infoMap.get(tokenAddress.toLowerCase()) ?? null;
}
