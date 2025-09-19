import { useMemo } from "react";
import { formatUnits } from "viem";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useAccount } from "~~/hooks/useAccount";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const normalizeDecimals = (value: unknown): number | null => {
  if (value === undefined || value === null) return 18;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

type ParsedAsset = {
  address: string;
  symbol: string;
  decimals: number;
};

type ParsedPosition = {
  debtBalance: bigint;
  collateralBalance: bigint;
};

type ParsedRates = {
  borrowAPR: number;
  supplyAPY: number;
};

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
    let decimalsRaw: unknown;

    if (Array.isArray(entry)) {
      if (entry.length < 3) return [];
      [addressRaw, symbolRaw, decimalsRaw] = entry;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      addressRaw = obj[0] ?? obj["0"] ?? obj.address;
      symbolRaw = obj[1] ?? obj["1"] ?? obj.symbol;
      decimalsRaw = obj[2] ?? obj["2"] ?? obj.decimals;
    } else {
      return [];
    }

    if (typeof addressRaw !== "bigint" || typeof symbolRaw !== "bigint") {
      return [];
    }

    const decimals = normalizeDecimals(decimalsRaw);
    if (decimals === null) return [];

    return [
      {
        address: toHexAddress(addressRaw),
        symbol: feltToString(symbolRaw),
        decimals,
      },
    ];
  });
};

const parseUserPositions = (positions: unknown): Record<string, ParsedPosition> => {
  if (!positions) return {};

  const entries = Array.isArray(positions)
    ? positions
    : typeof positions === "object"
      ? Object.values(positions as Record<string, unknown>)
      : [];

  return entries.reduce<Record<string, ParsedPosition>>((acc, entry) => {
    if (!entry) return acc;

    let addressRaw: unknown;
    let debtRaw: unknown;
    let collateralRaw: unknown;

    if (Array.isArray(entry)) {
      if (entry.length < 4) return acc;
      [addressRaw, , debtRaw, collateralRaw] = entry;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      addressRaw = obj[0] ?? obj["0"] ?? obj.address;
      debtRaw = obj[2] ?? obj["2"] ?? obj.debt_balance;
      collateralRaw = obj[3] ?? obj["3"] ?? obj.collateral_balance;
    } else {
      return acc;
    }

    if (typeof addressRaw !== "bigint" || typeof debtRaw !== "bigint" || typeof collateralRaw !== "bigint") {
      return acc;
    }

    acc[toHexAddress(addressRaw)] = {
      debtBalance: debtRaw,
      collateralBalance: collateralRaw,
    };

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

const computeUsdValue = (amount: bigint, decimals: number, priceWithEightDecimals: bigint): number => {
  if (amount === 0n || priceWithEightDecimals === 0n) {
    return 0;
  }

  const tokenAmount = Number(formatUnits(amount, decimals));
  const priceAsNumber = Number(priceWithEightDecimals) / 1e8;

  return tokenAmount * priceAsNumber;
};

export const useNostraLendingPositions = () => {
  const { address } = useAccount();
  const queryAddress = address ? BigInt(address) : 0n;

  const assetInfoQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  const assets = useMemo(() => parseAssetInfos(assetInfoQuery.data), [assetInfoQuery.data]);
  const tokenAddresses = useMemo(() => assets.map(asset => asset.address), [assets]);

  const userPositionsQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 10000,
  });

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

  const positionMap = useMemo(
    () => parseUserPositions(userPositionsQuery.data),
    [userPositionsQuery.data],
  );

  const rateMap = useMemo(
    () => parseInterestRates(interestRatesQuery.data, tokenAddresses),
    [interestRatesQuery.data, tokenAddresses],
  );

  const priceMap = useMemo(
    () => parsePrices(tokenPricesQuery.data, tokenAddresses),
    [tokenPricesQuery.data, tokenAddresses],
  );

  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    assets.forEach(asset => {
      const { address: tokenAddress, symbol, decimals } = asset;
      const position = positionMap[tokenAddress];
      const debtBalance = position?.debtBalance ?? 0n;
      const collateralBalance = position?.collateralBalance ?? 0n;
      const rates = rateMap[tokenAddress];
      const priceWithEightDecimals = priceMap[tokenAddress] ?? 0n;

      const supplyAPY = rates?.supplyAPY ?? 0;
      const borrowAPR = rates?.borrowAPR ?? 0;

      const suppliedValue = computeUsdValue(collateralBalance, decimals, priceWithEightDecimals);
      const borrowedValue = computeUsdValue(debtBalance, decimals, priceWithEightDecimals);

      supplied.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: suppliedValue,
        tokenBalance: collateralBalance,
        currentRate: supplyAPY,
        tokenAddress,
        tokenDecimals: decimals,
        tokenPrice: priceWithEightDecimals,
        tokenSymbol: symbol,
      });

      borrowed.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: -borrowedValue,
        tokenBalance: debtBalance,
        currentRate: borrowAPR,
        tokenAddress,
        tokenDecimals: decimals,
        tokenPrice: priceWithEightDecimals,
        tokenSymbol: symbol,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [assets, positionMap, rateMap, priceMap]);

  const isLoading =
    assetInfoQuery.isLoading ||
    userPositionsQuery.isLoading ||
    interestRatesQuery.isLoading ||
    tokenPricesQuery.isLoading;

  return {
    suppliedPositions,
    borrowedPositions,
    isLoading,
  };
};

export type UseNostraLendingPositionsResult = ReturnType<typeof useNostraLendingPositions>;
