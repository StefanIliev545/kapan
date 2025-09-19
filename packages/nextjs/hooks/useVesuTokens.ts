import { useEffect, useMemo } from "react";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import type { TokenMetadata } from "~~/utils/protocols";
import { feltToString, toAnnualRates } from "~~/utils/protocols";

export const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

export const normalizePrice = (price: { value: bigint; is_valid: boolean }) =>
  price.is_valid ? price.value / 10n ** 10n : 0n;

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return fallback;
};

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

const parseSupportedAssets = (assets: unknown): TokenMetadata[] => {
  if (!Array.isArray(assets)) return [];

  return assets.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];

    const candidate = entry as {
      address?: unknown;
      symbol?: unknown;
      decimals?: unknown;
      rate_accumulator?: unknown;
      utilization?: unknown;
      fee_rate?: unknown;
      price?: unknown;
      total_nominal_debt?: unknown;
      last_rate_accumulator?: unknown;
      reserve?: unknown;
      scale?: unknown;
    };

    const priceCandidate = candidate.price as { value?: unknown; is_valid?: unknown } | undefined;

    if (
      typeof candidate.address !== "bigint" ||
      typeof candidate.symbol !== "bigint" ||
      typeof candidate.rate_accumulator !== "bigint" ||
      typeof candidate.utilization !== "bigint" ||
      typeof candidate.fee_rate !== "bigint" ||
      typeof candidate.total_nominal_debt !== "bigint" ||
      typeof candidate.last_rate_accumulator !== "bigint" ||
      typeof candidate.reserve !== "bigint" ||
      typeof candidate.scale !== "bigint" ||
      !priceCandidate ||
      typeof priceCandidate.value !== "bigint"
    ) {
      return [];
    }

    const decimals = normalizeDecimals(candidate.decimals);
    if (decimals === null) return [];

    return [
      {
        address: candidate.address,
        symbol: candidate.symbol,
        decimals,
        rate_accumulator: candidate.rate_accumulator,
        utilization: candidate.utilization,
        fee_rate: candidate.fee_rate,
        price: {
          value: priceCandidate.value,
          is_valid: toBoolean(priceCandidate.is_valid, false),
        },
        total_nominal_debt: candidate.total_nominal_debt,
        last_rate_accumulator: candidate.last_rate_accumulator,
        reserve: candidate.reserve,
        scale: candidate.scale,
      },
    ];
  });
};

export type AssetWithRates = TokenMetadata & { borrowAPR: number; supplyAPY: number };

export interface UseVesuTokensDataResult {
  assetsWithRates: AssetWithRates[];
  suppliablePositions: ProtocolPosition[];
  borrowablePositions: ProtocolPosition[];
  assetMap: Map<string, AssetWithRates>;
  isLoadingAssets: boolean;
  assetsError?: unknown;
}

export const useVesuTokensData = (poolId: bigint): UseVesuTokensDataResult => {
  const {
    data: supportedAssets,
    error: assetsError,
  } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });

  useEffect(() => {
    if (assetsError) {
      console.error("Error fetching Vesu supported assets:", assetsError);
    }
  }, [assetsError]);

  const normalizedAssets = useMemo(() => parseSupportedAssets(supportedAssets), [supportedAssets]);

  const assetsWithRates = useMemo<AssetWithRates[]>(() => {
    return normalizedAssets.map(asset => {
      if (asset.scale === 0n) {
        return { ...asset, borrowAPR: 0, supplyAPY: 0 };
      }

      const { borrowAPR, supplyAPY } = toAnnualRates(
        asset.fee_rate,
        asset.total_nominal_debt,
        asset.last_rate_accumulator,
        asset.reserve,
        asset.scale,
      );

      return { ...asset, borrowAPR, supplyAPY };
    });
  }, [normalizedAssets]);

  const assetMap = useMemo(() => {
    const map = new Map<string, AssetWithRates>();
    assetsWithRates.forEach(asset => {
      map.set(toHexAddress(asset.address), asset);
    });
    return map;
  }, [assetsWithRates]);

  const suppliablePositions = useMemo<ProtocolPosition[]>(() => {
    return assetsWithRates.map(asset => {
      const address = toHexAddress(asset.address);
      const symbol = feltToString(asset.symbol);
      const price = normalizePrice(asset.price);

      return {
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: 0,
        tokenBalance: 0n,
        currentRate: (asset.supplyAPY ?? 0) * 100,
        tokenAddress: address,
        tokenDecimals: asset.decimals,
        tokenPrice: price,
        tokenSymbol: symbol,
      };
    });
  }, [assetsWithRates]);

  const borrowablePositions = useMemo<ProtocolPosition[]>(() => {
    return assetsWithRates.map(asset => {
      const address = toHexAddress(asset.address);
      const symbol = feltToString(asset.symbol);
      const price = normalizePrice(asset.price);

      return {
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: 0,
        tokenBalance: 0n,
        currentRate: (asset.borrowAPR ?? 0) * 100,
        tokenAddress: address,
        tokenDecimals: asset.decimals,
        tokenPrice: price,
        tokenSymbol: symbol,
      };
    });
  }, [assetsWithRates]);

  const isLoadingAssets = supportedAssets == null;

  return {
    assetsWithRates,
    suppliablePositions,
    borrowablePositions,
    assetMap,
    isLoadingAssets,
    assetsError,
  };
};
