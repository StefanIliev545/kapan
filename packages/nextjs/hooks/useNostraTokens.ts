import { useMemo } from "react";

import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";

type ParsedAsset = {
  address: string;
  symbol: string;
};

type ParsedRates = {
  borrowAPR: number;
  supplyAPY: number;
};

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const parseAssetInfos = (assets: unknown): ParsedAsset[] => {
  if (!assets) return [];

  const entries = Array.isArray(assets)
    ? assets
    : typeof assets === "object"
      ? Object.values(assets as Record<string, unknown>)
      : [];

  return entries.flatMap(entry => {
    if (!entry) return [];

    let addressRaw: unknown;
    let symbolRaw: unknown;
    if (Array.isArray(entry)) {
      if (entry.length < 2) return [];
      [addressRaw, symbolRaw] = entry;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      addressRaw = obj[0] ?? obj["0"] ?? obj.address;
      symbolRaw = obj[1] ?? obj["1"] ?? obj.symbol;
    } else {
      return [];
    }

    if (typeof addressRaw !== "bigint" || typeof symbolRaw !== "bigint") {
      return [];
    }

    return [
      {
        address: toHexAddress(addressRaw),
        symbol: feltToString(symbolRaw),
      },
    ];
  });
};

const parseTokenDecimals = (decimals: unknown, addresses: string[]): Record<string, number> => {
  if (!decimals || addresses.length === 0) return {};

  const entries = Array.isArray(decimals)
    ? decimals
    : typeof decimals === "object"
      ? Object.values(decimals as Record<string, unknown>)
      : [];

  return addresses.reduce<Record<string, number>>((acc, address, index) => {
    const value = entries[index];
    if (typeof value === "bigint" || typeof value === "number") {
      const normalized = Number(value);
      if (Number.isFinite(normalized)) {
        acc[address] = normalized;
      }
    }
    return acc;
  }, {});
};

const parseInterestRates = (rates: unknown, addresses: string[]): Record<string, ParsedRates> => {
  if (!rates || addresses.length === 0) return {};

  const entries = Array.isArray(rates)
    ? rates
    : typeof rates === "object"
      ? Object.values(rates as Record<string, unknown>)
      : [];

  return entries.reduce<Record<string, ParsedRates>>((acc, entry, index) => {
    if (!entry || typeof entry !== "object") return acc;

    const { lending_rate, borrowing_rate } = entry as { lending_rate?: unknown; borrowing_rate?: unknown };

    if (typeof lending_rate !== "bigint" || typeof borrowing_rate !== "bigint") {
      return acc;
    }

    const address = addresses[index];
    if (!address) {
      return acc;
    }

    acc[address] = {
      supplyAPY: Number(lending_rate) / 1e16,
      borrowAPR: Number(borrowing_rate) / 1e16,
    };

    return acc;
  }, {});
};

const PRICE_SCALE = 10n ** 10n;

const parsePrices = (prices: unknown, addresses: string[]): Record<string, bigint> => {
  if (!prices || addresses.length === 0) return {};

  const entries = Array.isArray(prices)
    ? prices
    : typeof prices === "object"
      ? Object.values(prices as Record<string, unknown>)
      : [];

  return addresses.reduce<Record<string, bigint>>((acc, address, index) => {
    const price = entries[index];
    if (typeof price === "bigint") {
      acc[address] = price / PRICE_SCALE;
    }
    return acc;
  }, {});
};

export interface NostraTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  supplyAPY: number;
  borrowAPR: number;
  priceWithEightDecimals: bigint;
}

export interface UseNostraTokensDataResult {
  assets: ParsedAsset[];
  tokenAddresses: string[];
  rateMap: Record<string, ParsedRates>;
  priceMap: Record<string, bigint>;
  decimalsMap: Record<string, number>;
  tokens: NostraTokenInfo[];
  isLoading: boolean;
  assetInfoError?: unknown;
  interestRatesError?: unknown;
  tokenPricesError?: unknown;
  tokenDecimalsError?: unknown;
}

export const useNostraTokensData = (): UseNostraTokensDataResult => {
  const assetInfoQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  const assets = useMemo(() => parseAssetInfos(assetInfoQuery.data), [assetInfoQuery.data]);
  const tokenAddresses = useMemo(() => assets.map(asset => asset.address), [assets]);

  const interestRatesQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [tokenAddresses],
    refetchInterval: 0,
  });

  const tokenPricesQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [tokenAddresses],
  });

  const tokenDecimalsQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_token_decimals",
    args: [tokenAddresses],
  });

  const rateMap = useMemo(
    () => parseInterestRates(interestRatesQuery.data, tokenAddresses),
    [interestRatesQuery.data, tokenAddresses],
  );

  const priceMap = useMemo(
    () => parsePrices(tokenPricesQuery.data, tokenAddresses),
    [tokenPricesQuery.data, tokenAddresses],
  );

  const decimalsMap = useMemo(
    () => parseTokenDecimals(tokenDecimalsQuery.data, tokenAddresses),
    [tokenDecimalsQuery.data, tokenAddresses],
  );

  const tokens = useMemo<NostraTokenInfo[]>(() => {
    return assets.map(asset => {
      const supplyAPY = rateMap[asset.address]?.supplyAPY ?? 0;
      const borrowAPR = rateMap[asset.address]?.borrowAPR ?? 0;
      const decimals = decimalsMap[asset.address] ?? 18;
      const priceWithEightDecimals = priceMap[asset.address] ?? 0n;

      return {
        address: asset.address,
        symbol: asset.symbol,
        decimals,
        supplyAPY,
        borrowAPR,
        priceWithEightDecimals,
      };
    });
  }, [assets, rateMap, decimalsMap, priceMap]);

  const isLoading =
    assetInfoQuery.isLoading ||
    interestRatesQuery.isLoading ||
    tokenPricesQuery.isLoading ||
    tokenDecimalsQuery.isLoading;

  return {
    assets,
    tokenAddresses,
    rateMap,
    priceMap,
    decimalsMap,
    tokens,
    isLoading,
    assetInfoError: assetInfoQuery.error,
    interestRatesError: interestRatesQuery.error,
    tokenPricesError: tokenPricesQuery.error,
    tokenDecimalsError: tokenDecimalsQuery.error,
  };
};
