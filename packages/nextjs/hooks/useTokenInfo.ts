import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!publicClient || tokenAddresses.length === 0) return;

    const fetchTokenInfo = async () => {
      const { cachedMap: newMap, uncached: uncachedAddresses } = partitionByCache(tokenAddresses, chainId);

      if (uncachedAddresses.length === 0) {
        setTokenInfoMap(newMap);
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
  }, [publicClient, tokenAddresses, chainId]);

  return tokenInfoMap;
}

// Single token helper hook
export function useSingleTokenInfo(tokenAddress: Address | undefined, chainId?: number): TokenInfo | null {
  const addresses = tokenAddress ? [tokenAddress] : [];
  const infoMap = useTokenInfo(addresses as Address[], chainId);
  
  if (!tokenAddress) return null;
  return infoMap.get(tokenAddress.toLowerCase()) ?? null;
}
