import { useMemo } from "react";

import { feltToString } from "~~/utils/protocols";
import { useScaffoldReadContract } from "./scaffold-stark";
import { toHexAddress } from "./useProtocolPositions/utils";

export type NostraAsset = {
  address: string;
  symbol: string;
};

export type NostraRates = {
  borrowAPR: number;
  supplyAPY: number;
};

const parseAssetInfos = (assets: unknown): NostraAsset[] => {
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

const parseInterestRates = (rates: unknown, addresses: string[]): Record<string, NostraRates> => {
  if (!rates || addresses.length === 0) return {};

  const entries = Array.isArray(rates)
    ? rates
    : typeof rates === "object"
      ? Object.values(rates as Record<string, unknown>)
      : [];

  return entries.reduce<Record<string, NostraRates>>((acc, entry, index) => {
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

export const useNostraAssets = () => {
  const assetInfoQuery = useScaffoldReadContract({
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: ["0x0"],
  });

  const assets = useMemo(() => parseAssetInfos(assetInfoQuery.data), [assetInfoQuery.data]);
  const tokenAddresses = useMemo(() => assets.map(asset => asset.address), [assets]);

  const interestRatesQuery = useScaffoldReadContract({
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [tokenAddresses],
    refetchInterval: 0,
  });

  const tokenPricesQuery = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [tokenAddresses],
  });

  const tokenDecimalsQuery = useScaffoldReadContract({
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
    isLoading,
  };
};

export type UseNostraAssetsResult = ReturnType<typeof useNostraAssets>;
