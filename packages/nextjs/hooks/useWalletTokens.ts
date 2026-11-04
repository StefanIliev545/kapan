import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { type Address, type PublicClient, erc20Abi, formatUnits, isAddress } from "viem";
import { useExternalYields, type ExternalYield } from "./useExternalYields";
import { fetchMorphoMarkets } from "~~/utils/morpho/marketApi";
import { usePendlePortfolio, getPendlePortfolioKey, type UsePendlePortfolioResult } from "./usePendlePortfolio";
import { usePendleTokens, type PendleToken } from "./usePendleTokens";
import { useTokenPricesByAddress } from "./useTokenPrice";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useGlobalState } from "~~/services/store/store";
import { fetchHoldings, validDecimals, type Holding, type HoldingsIssue } from "~~/utils/wallet/holdings";
// Major tokens whitelist (addresses by chainId)
// These are always shown if user has balance
const MAJOR_TOKENS: Record<
  number,
  Array<{
    address: Address;
    symbol: string;
    decimals: number;
  }>
> = {
  1: [
    {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "WETH",
      decimals: 18,
    },
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
    },
    {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6,
    },
    {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      symbol: "DAI",
      decimals: 18,
    },
    {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      decimals: 8,
    },
    {
      address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      symbol: "wstETH",
      decimals: 18,
    },
    {
      address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
      symbol: "rETH",
      decimals: 18,
    },
    {
      address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
      symbol: "cbETH",
      decimals: 18,
    },
    {
      address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b",
      symbol: "syrupUSDC",
      decimals: 6,
    },
    {
      address: "0x82784f72f6c5e11c90490cc3e14df7447c4dde39",
      symbol: "syrupUSDT",
      decimals: 6,
    },
  ],
  42161: [
    {
      address: "0x0A1a1A107E45b7Ced86833863f482BC5f4ed82EF",
      symbol: "USDai",
      decimals: 18,
    },
    {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      symbol: "WETH",
      decimals: 18,
    },
    {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "USDC",
      decimals: 6,
    },
    {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      symbol: "USDC.e",
      decimals: 6,
    },
    {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "USDT",
      decimals: 6,
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      symbol: "DAI",
      decimals: 18,
    },
    {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      symbol: "WBTC",
      decimals: 8,
    },
    {
      address: "0x5979D7b546E38E414F7E9822514be443A4800529",
      symbol: "wstETH",
      decimals: 18,
    },
    {
      address: "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8",
      symbol: "rETH",
      decimals: 18,
    },
  ],
  8453: [
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
    },
    {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
    },
    {
      address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
      symbol: "USDbC",
      decimals: 6,
    },
    {
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      symbol: "DAI",
      decimals: 18,
    },
    {
      address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
      symbol: "wstETH",
      decimals: 18,
    },
    {
      address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
      symbol: "cbETH",
      decimals: 18,
    },
  ],
  9745: [
    {
      address: "0x6100E367285b01F48D07953803A2d8dCA5D19873",
      symbol: "WXPL",
      decimals: 18,
    },
    {
      address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      symbol: "USDT0",
      decimals: 6,
    },
    {
      address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
      symbol: "USDe",
      decimals: 18,
    },
    {
      address: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
      symbol: "sUSDe",
      decimals: 18,
    },
    {
      address: "0x9895D81bB462A195b4922ED7De0e3ACD007c32CB",
      symbol: "WETH",
      decimals: 18,
    },
    {
      address: "0xA3D68b74bF0528fdD07263c60d6488749044914b",
      symbol: "weETH",
      decimals: 18,
    },
    {
      address: "0xe48D935e6C9e735463ccCf29a7F11e32bC09136E",
      symbol: "wstETH",
      decimals: 18,
    },
    {
      address: "0xe561FE05C39075312Aa9Bc6af79DdaE981461359",
      symbol: "wrsETH",
      decimals: 18,
    },
    {
      address: "0xb77E872A68C62CfC0dFb02C067Ecc3DA23B4bbf3",
      symbol: "GHO",
      decimals: 18,
    },
    {
      address: "0x1B64B9025EEbb9A6239575dF9Ea4b9Ac46D4d193",
      symbol: "XAUt0",
      decimals: 6,
    },
    {
      address: "0xC4374775489CB9C56003BF2C9b12495fC64F0771",
      symbol: "syrupUSDT",
      decimals: 6,
    },
    // PT tokens (the bulk of Plasma's Aave reserves) are discovered dynamically via usePendleTokens.
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
  source: "major" | "morpho" | "pendle" | "maple" | "indexed";
  valuationAvailable?: boolean;
}
interface TokenMetadata {
  address: Address;
  symbol: string;
  decimals: number | null;
  price?: number;
  source: WalletToken["source"];
  holding?: Holding;
}
export interface UnresolvedHolding {
  address: Address;
  rawBalance: string | null;
  reason: "decimals" | "balance" | "amount";
}
/** A Morpho-style asset with optional address, symbol, decimals, priceUsd. */
interface MorphoAssetLike {
  address?: string;
  symbol: string;
  decimals?: number;
  priceUsd?: number | null;
}
/**
 * Insert a token into the map, or update its price if it already exists and
 * the incoming price is defined.
 */
function upsertTokenMetadata(
  tokens: Map<string, TokenMetadata>,
  addr: string,
  symbol: string,
  decimals: number | null | undefined,
  price: number | undefined,
  source: WalletToken["source"],
): void {
  // Guard against malformed addresses (e.g. a typo in the whitelist or bad API data).
  // A single invalid address would otherwise make the whole balance multicall throw at
  // encoding time, blanking the entire wallet section. strict:false accepts any valid
  // casing (Pendle/Morpho sources may be lowercased).
  if (
    !isAddress(addr, {
      strict: false,
    })
  ) {
    console.warn(`[useWalletTokens] Skipping invalid token address: ${addr} (${symbol})`);
    return;
  }
  const key = addr.toLowerCase();
  const existing = tokens.get(key);
  if (!existing) {
    tokens.set(key, {
      address: key as Address,
      symbol,
      decimals: validDecimals(decimals) ? decimals : null,
      price,
      source,
    });
    return;
  }
  // Update price when the new source provides one
  if (price !== undefined) {
    existing.price = price;
  }
}
/**
 * Walk every discovered Morpho market and upsert both collateral & loan tokens into the map.
 */
function addMorphoMarketTokens(
  tokens: Map<string, TokenMetadata>,
  markets: {
    collateralAsset: MorphoAssetLike | null;
    loanAsset: MorphoAssetLike;
  }[],
): void {
  for (const market of markets) {
    const collateral = market.collateralAsset;
    if (collateral?.address) {
      upsertTokenMetadata(
        tokens,
        collateral.address,
        collateral.symbol,
        collateral.decimals,
        collateral.priceUsd ?? undefined,
        "morpho",
      );
    }
    const loan = market.loanAsset;
    if (loan?.address) {
      upsertTokenMetadata(tokens, loan.address, loan.symbol, loan.decimals, loan.priceUsd ?? undefined, "morpho");
    }
  }
}
/**
 * Resolve the USD price for a token using a 3-tier fallback:
 *   1. Pendle PT price (for PT tokens -- ensures consistency with displayed APY)
 *   2. Morpho price (from market data, stored in TokenMetadata)
 *   3. CoinGecko price (fetched by contract address)
 */
function resolveTokenPrice(
  token: TokenMetadata,
  externalYield: ExternalYield | undefined,
  fetchedPrices: Record<string, number>,
): number {
  // Pendle PT price takes highest priority
  if (
    externalYield?.source === "pendle" &&
    externalYield.metadata?.ptPriceUsd &&
    Number.isFinite(externalYield.metadata.ptPriceUsd) &&
    externalYield.metadata.ptPriceUsd > 0
  ) {
    return externalYield.metadata.ptPriceUsd;
  }
  // Then Morpho-provided price, then CoinGecko (keyed by lowercase address)
  const price = token.price || fetchedPrices[token.address.toLowerCase()] || 0;
  return Number.isFinite(price) && price > 0 ? price : 0;
}
async function recoverMissingDecimals(
  tokens: TokenMetadata[],
  client: Pick<PublicClient, "multicall">,
): Promise<Map<Address, number | null>> {
  const missingDecimals = tokens.filter((token) => {
    return token.decimals === null;
  });
  const decimalsResults = missingDecimals.length
    ? await client
        .multicall({
          contracts: missingDecimals.map((token) => {
            return {
              address: token.address,
              abi: erc20Abi,
              functionName: "decimals" as const,
            };
          }),
          allowFailure: true,
        })
        .catch(() => {
          return [];
        })
    : [];
  return new Map(
    missingDecimals.map((token, index) => {
      const response = decimalsResults[index];
      return [token.address, response?.status === "success" && validDecimals(response.result) ? response.result : null];
    }),
  );
}
function resolveWalletYield(
  token: TokenMetadata,
  chainId: number,
  pendleTokens: PendleToken[],
  portfolioByPt: UsePendlePortfolioResult["byPtAddress"],
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined,
): ExternalYield | undefined {
  const pt = pendleTokens.find((candidate) => {
    return (
      candidate.chainId === chainId && candidate.type === "PT" && candidate.address.toLowerCase() === token.address
    );
  });
  const position = portfolioByPt.get(getPendlePortfolioKey(chainId, token.address));
  const matchesPosition = position?.chainId === chainId && position.ptAddress.toLowerCase() === token.address;
  const entry = matchesPosition ? position : undefined;
  const entryApy = entry?.entryApyPercent;
  const marketApy = pt?.impliedApy === undefined ? undefined : pt.impliedApy * 100;
  const apy = typeof entryApy === "number" && Number.isFinite(entryApy) ? entryApy : marketApy;
  if (pt && typeof apy === "number" && Number.isFinite(apy)) {
    return {
      address: token.address,
      symbol: pt.symbol,
      name: pt.name,
      apy,
      fixedApy: apy,
      source: "pendle",
      metadata: {
        ptPriceUsd: pt.priceUsd,
        daysToExpiry: pt.daysToExpiry,
        underlyingSymbol: pt.underlying?.symbol,
        underlyingAddress: pt.underlying?.address,
        ...(typeof entryApy === "number" && Number.isFinite(entryApy)
          ? {
              entryApyPercent: entryApy,
            }
          : {}),
        ...(entry
          ? {
              valuationUsd: entry.valuationUsd,
            }
          : {}),
        ...(entry?.unrealizedPnlUsd != null
          ? {
              unrealizedPnlUsd: entry.unrealizedPnlUsd,
            }
          : {}),
      },
    };
  }
  // The shared LST/Maple sources identify Ethereum contracts, not cross-chain deployments.
  if (chainId !== 1) {
    return undefined;
  }
  const yieldData = findYield(token.address);
  return yieldData?.address.toLowerCase() === token.address && yieldData.source !== "pendle" ? yieldData : undefined;
}
function addMajorTokens(tokens: Map<string, TokenMetadata>, chainId: number): void {
  for (const token of MAJOR_TOKENS[chainId] ?? []) {
    upsertTokenMetadata(tokens, token.address, token.symbol, token.decimals, undefined, "major");
  }
}
function addPendleTokens(tokens: Map<string, TokenMetadata>, pendleTokens: PendleToken[], chainId: number): void {
  for (const token of pendleTokens) {
    if (token.chainId !== chainId) {
      continue;
    }
    upsertTokenMetadata(tokens, token.address, token.symbol, token.decimals, token.priceUsd, "pendle");
  }
}
function buildWalletTokenWhitelist(
  chainId: number,
  markets:
    | {
        collateralAsset: MorphoAssetLike | null;
        loanAsset: MorphoAssetLike;
      }[]
    | undefined,
  pendleTokens: PendleToken[],
): Map<string, TokenMetadata> {
  const tokens = new Map<string, TokenMetadata>();
  addMajorTokens(tokens, chainId);
  addMorphoMarketTokens(tokens, markets ?? []);
  addPendleTokens(tokens, pendleTokens, chainId);
  return tokens;
}
function getAddressesNeedingPrices(tokens: Map<string, TokenMetadata>): Address[] {
  return Array.from(tokens.values())
    .filter((token) => {
      return !token.price;
    })
    .map((token) => {
      return token.address;
    });
}
function useWalletMorphoDiscovery(chainId: number) {
  return useQuery({
    queryKey: ["wallet-morpho-markets", chainId],
    queryFn: () => {
      return fetchMorphoMarkets(chainId, {
        walletDiscovery: true,
      });
    },
    enabled: chainId > 0,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
interface BalanceState {
  tokens: WalletToken[];
  unresolved: UnresolvedHolding[];
  issues: HoldingsIssue[];
}
interface BalanceContext {
  publicClient: PublicClient;
  userAddress: Address;
  chainId: number;
  tokenWhitelist: Map<string, TokenMetadata>;
  fetchedPricesByAddress: Record<string, number>;
  globalEthPrice: number;
  pendlePTTokens: PendleToken[];
  portfolioByPt: UsePendlePortfolioResult["byPtAddress"];
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined;
}
function resolveNativePrice(symbol: string, context: BalanceContext): number {
  const wrappedToken = MAJOR_TOKENS[context.chainId]?.find((token) => {
    return token.symbol === `W${symbol}`;
  });
  const key = wrappedToken?.address.toLowerCase();
  const knownPrice = key ? context.tokenWhitelist.get(key)?.price : undefined;
  const addressPrice = key ? context.fetchedPricesByAddress[key] : undefined;
  const ethFallback = symbol === "ETH" ? context.globalEthPrice : 0;
  const price = knownPrice || addressPrice || ethFallback || 0;
  return Number.isFinite(price) && price > 0 ? price : 0;
}
function nativeWalletToken(balance: bigint, context: BalanceContext): WalletToken {
  const currency = context.publicClient.chain?.nativeCurrency;
  const symbol = currency?.symbol ?? "ETH";
  const decimals = currency?.decimals ?? 18;
  const balanceFormatted = Number(formatUnits(balance, decimals));
  const price = resolveNativePrice(symbol, context);
  const usdValue = balanceFormatted * price;
  return {
    address: "0x0000000000000000000000000000000000000000",
    symbol,
    name: currency?.name ?? "Ether",
    decimals,
    balance,
    balanceFormatted,
    usdValue: Number.isFinite(usdValue) ? usdValue : 0,
    price,
    icon: tokenNameToLogo(symbol.toLowerCase()),
    source: "major",
    valuationAvailable: price > 0 && Number.isFinite(usdValue),
  };
}
async function readNativeBalance(context: BalanceContext, state: BalanceState): Promise<void> {
  try {
    const balance = await context.publicClient.getBalance({
      address: context.userAddress,
    });
    if (balance > 0n) {
      state.tokens.push(nativeWalletToken(balance, context));
    }
  } catch {
    state.issues.push({
      kind: "balance",
      code: "unavailable",
    });
  }
}
function retainFailedBalance(token: TokenMetadata, state: BalanceState): void {
  state.issues.push({
    kind: "balance",
    code: "unavailable",
    address: token.address,
  });
  if (token.holding && token.holding.rawBalance !== "0") {
    state.unresolved.push({
      address: token.address,
      rawBalance: token.holding.rawBalance,
      reason: "balance",
    });
  }
}
function appendResolvedBalance(
  token: TokenMetadata,
  balance: bigint,
  recovered: Map<Address, number | null>,
  context: BalanceContext,
  state: BalanceState,
): void {
  const { chainId: effectiveChainId, pendlePTTokens, portfolioByPt, findYield, fetchedPricesByAddress } = context;
  if (balance === 0n) {
    return;
  }
  const decimals = token.decimals ?? recovered.get(token.address);
  if (!validDecimals(decimals)) {
    state.unresolved.push({
      address: token.address,
      rawBalance: balance.toString(),
      reason: "decimals",
    });
    return;
  }
  const balanceFormatted = Number(formatUnits(balance, decimals));
  if (!Number.isFinite(balanceFormatted) || balanceFormatted === 0) {
    state.unresolved.push({
      address: token.address,
      rawBalance: balance.toString(),
      reason: "amount",
    });
    return;
  }
  // Look up external yield data (do this first to get Pendle prices for PT tokens)
  const externalYield = resolveWalletYield(token, effectiveChainId, pendlePTTokens, portfolioByPt, findYield);
  const price = resolveTokenPrice(token, externalYield, fetchedPricesByAddress);
  const usdValue = balanceFormatted * price;
  state.tokens.push({
    address: token.address,
    symbol: token.symbol,
    name: token.holding?.name ?? token.symbol,
    decimals,
    balance,
    balanceFormatted,
    usdValue: Number.isFinite(usdValue) ? usdValue : 0,
    price,
    icon: tokenNameToLogo(token.symbol.toLowerCase()),
    externalYield,
    source: token.source,
    valuationAvailable: price > 0 && Number.isFinite(usdValue),
  });
}
async function readTokenBatch(batch: TokenMetadata[], context: BalanceContext, state: BalanceState): Promise<void> {
  const balances = await context.publicClient
    .multicall({
      contracts: batch.map((token) => {
        return {
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [context.userAddress] as const,
        };
      }),
      allowFailure: true,
    })
    .catch(() => {
      return [];
    });
  const recovered = await recoverMissingDecimals(batch, context.publicClient);
  for (let index = 0; index < batch.length; index++) {
    const token = batch[index];
    const result = balances[index];
    const readableBalance = result?.status === "success" && typeof result.result === "bigint" && result.result >= 0n;
    if (!readableBalance) {
      retainFailedBalance(token, state);
      continue;
    }
    appendResolvedBalance(token, result.result as bigint, recovered, context, state);
  }
}
async function readWalletBalances(context: BalanceContext, signal: AbortSignal): Promise<BalanceState> {
  const state: BalanceState = {
    tokens: [],
    unresolved: [],
    issues: [],
  };
  signal.throwIfAborted();
  await readNativeBalance(context, state);
  const tokens = Array.from(context.tokenWhitelist.values());
  for (let offset = 0; offset < tokens.length; offset += 50) {
    signal.throwIfAborted();
    await readTokenBatch(tokens.slice(offset, offset + 50), context, state);
  }
  signal.throwIfAborted();
  state.tokens.sort((a, b) => {
    return b.usdValue - a.usdValue;
  });
  return state;
}
function mergeIndexedHoldings(candidates: Map<string, TokenMetadata>, holdings: Holding[]): Map<string, TokenMetadata> {
  for (const holding of holdings) {
    const key = holding.address.toLowerCase();
    const known = candidates.get(key);
    candidates.set(key, {
      address: key as Address,
      symbol: known?.symbol ?? holding.symbol ?? key,
      decimals: known?.decimals ?? holding.decimals,
      price: known?.price ?? holding.price ?? undefined,
      source: known?.source ?? "indexed",
      holding,
    });
  }
  return candidates;
}
export function useWalletTokens(chainId?: number) {
  const queryClient = useQueryClient();
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient({
    chainId,
  });
  const { findYield } = useExternalYields(chainId ?? 1);
  const { byPtAddress: portfolioByPt } = usePendlePortfolio();
  // Global ETH price (fetched from Uniswap by scaffold-eth) as a reliable fallback
  const globalEthPrice = useGlobalState((s) => {
    return s.nativeCurrencyPrice;
  });
  // Keep wallet discovery separate from investment market display filters.
  const effectiveChainId = chainId ?? 1;
  const discovery = useWalletMorphoDiscovery(effectiveChainId);
  // Fetch Pendle PT tokens so we discover PT tokens the user holds even without a Morpho market
  const { tokens: pendlePTTokens } = usePendleTokens({
    chainId: effectiveChainId,
  });
  const holdings = useQuery({
    queryKey: ["wallet-holdings", effectiveChainId, userAddress?.toLowerCase()],
    queryFn: ({ signal }) => {
      return fetchHoldings(effectiveChainId, userAddress!, signal);
    },
    enabled: !!userAddress,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const tokenWhitelist = useMemo(() => {
    const candidates = buildWalletTokenWhitelist(effectiveChainId, discovery.data, pendlePTTokens);
    return mergeIndexedHoldings(candidates, holdings.data?.holdings ?? []);
  }, [effectiveChainId, discovery.data, pendlePTTokens, holdings.data]);
  const addressesNeedingPrices = useMemo(() => {
    return getAddressesNeedingPrices(tokenWhitelist);
  }, [tokenWhitelist]);
  // Fetch prices by contract address (no symbol ambiguity)
  const { prices: fetchedPricesByAddress, refetch: refreshPrices } = useTokenPricesByAddress(
    chainId ?? 1,
    addressesNeedingPrices,
    {
      enabled: addressesNeedingPrices.length > 0,
    },
  );
  // Protocol metadata enriches indexed holdings without restricting membership.
  const query = useQuery({
    queryKey: [
      "wallet-tokens",
      effectiveChainId,
      userAddress,
      Array.from(tokenWhitelist.values()),
      fetchedPricesByAddress,
      globalEthPrice,
      pendlePTTokens,
      Array.from(portfolioByPt.entries()),
    ],
    queryFn: async ({ signal }) => {
      if (!userAddress || !publicClient) {
        return {
          tokens: [],
          unresolved: [],
          issues: [],
        } as BalanceState;
      }
      return readWalletBalances(
        {
          publicClient,
          userAddress,
          chainId: effectiveChainId,
          tokenWhitelist,
          fetchedPricesByAddress,
          globalEthPrice,
          pendlePTTokens,
          portfolioByPt,
          findYield,
        },
        signal,
      );
    },
    enabled: !!userAddress && !!publicClient,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });
  const refreshDiscovery = discovery.refetch;
  const refreshHoldings = holdings.refetch;
  const refreshBalances = query.refetch;
  const refetch = useCallback(async () => {
    await Promise.all([
      refreshDiscovery(),
      refreshHoldings(),
      queryClient.refetchQueries({
        queryKey: ["pendle-pt-tokens", effectiveChainId],
      }),
      refreshPrices?.(),
    ]);
    return refreshBalances();
  }, [refreshDiscovery, refreshHoldings, queryClient, effectiveChainId, refreshPrices, refreshBalances]);
  // Calculate totals
  const totals = useMemo(() => {
    const tokens = query.data?.tokens ?? [];
    const totalValue = tokens.reduce((sum, t) => {
      return sum + t.usdValue;
    }, 0);
    const tokenCount = tokens.length + (query.data?.unresolved.length ?? 0);
    return {
      totalValue,
      tokenCount,
    };
  }, [query.data]);
  return {
    tokens: query.data?.tokens ?? [],
    unresolvedHoldings: query.data?.unresolved ?? [],
    visibilityScope: `${effectiveChainId}:${userAddress?.toLowerCase() ?? ""}`,
    valuationAvailable:
      Number.isFinite(totals.totalValue) &&
      query.data?.unresolved.length === 0 &&
      query.data.tokens.every((token) => {
        return token.valuationAvailable;
      }),
    issues: [
      ...(holdings.data?.issues ?? []),
      ...(holdings.data?.holdings.flatMap((holding) => {
        return holding.issues;
      }) ?? []),
      ...(query.data?.issues ?? []),
    ],
    isLoading: !!userAddress && (query.isLoading || discovery.isLoading || holdings.isLoading),
    isError:
      !!userAddress &&
      (!publicClient ||
        query.isError ||
        discovery.isError ||
        holdings.isError ||
        !holdings.data?.enumerationComplete ||
        (query.data?.issues.length ?? 0) > 0 ||
        (query.data?.unresolved.length ?? 0) > 0),
    error: query.error ?? discovery.error,
    refetch,
    totalValue: totals.totalValue,
    tokenCount: totals.tokenCount,
  };
}
