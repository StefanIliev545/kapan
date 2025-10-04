import { useMemo, useEffect } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import type { TokenMetadata } from "~~/utils/protocols";
import { toAnnualRates } from "~~/utils/protocols";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";

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

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return fallback;
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

export const useVesuV2Assets = (poolAddress: string) => {
  // For now, use VesuGateway with a different pool address to simulate V2
  // This will be updated once VesuGatewayV2 is properly integrated
  const {
    data: supportedAssets,
    error: assetsError,
  } = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_supported_assets_ui",
    args: [poolAddress],
    refetchInterval: 0,
  });

  useEffect(() => {
    if (assetsError) {
      console.error("Error fetching V2 supported assets:", assetsError);
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
      const hexAddress = `0x${asset.address.toString(16).padStart(64, "0")}`;
      map.set(hexAddress, asset);
    });
    return map;
  }, [assetsWithRates]);

  return {
    assetsWithRates,
    assetMap,
    isLoading: supportedAssets == null,
    assetsError,
  };
};

export type UseVesuV2AssetsResult = ReturnType<typeof useVesuV2Assets>;
