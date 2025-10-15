import { useEffect, useMemo } from "react";

import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import type { TokenMetadata } from "~~/utils/protocols";
import { toAnnualRates } from "~~/utils/protocols";

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
      max_utilization?: unknown;
      floor?: unknown;
      last_full_utilization_rate?: unknown;
      target_rate_percent?: unknown;
      fee_shares?: unknown;
      last_updated?: unknown;
      min_target_utilization?: unknown;
      max_target_utilization?: unknown;
      rate_half_life?: unknown;
      max_full_utilization_rate?: unknown;
      min_full_utilization_rate?: unknown;
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
        max_utilization:
          typeof candidate.max_utilization === "bigint" ? candidate.max_utilization : undefined,
        floor: typeof candidate.floor === "bigint" ? candidate.floor : undefined,
        last_full_utilization_rate:
          typeof candidate.last_full_utilization_rate === "bigint"
            ? candidate.last_full_utilization_rate
            : undefined,
        target_rate_percent:
          typeof candidate.target_rate_percent === "bigint" ? candidate.target_rate_percent : undefined,
        fee_shares: typeof candidate.fee_shares === "bigint" ? candidate.fee_shares : undefined,
        last_updated: typeof candidate.last_updated === "bigint" ? candidate.last_updated : undefined,
        min_target_utilization:
          typeof candidate.min_target_utilization === "bigint" ? candidate.min_target_utilization : undefined,
        max_target_utilization:
          typeof candidate.max_target_utilization === "bigint" ? candidate.max_target_utilization : undefined,
        rate_half_life: typeof candidate.rate_half_life === "bigint" ? candidate.rate_half_life : undefined,
        max_full_utilization_rate:
          typeof candidate.max_full_utilization_rate === "bigint"
            ? candidate.max_full_utilization_rate
            : undefined,
        min_full_utilization_rate:
          typeof candidate.min_full_utilization_rate === "bigint"
            ? candidate.min_full_utilization_rate
            : undefined,
      },
    ];
  });
};

export type AssetWithRates = TokenMetadata & {
  borrowAPR: number;
  supplyAPY: number;
  interestRatePerSecond?: bigint;
  targetRate?: bigint;
};

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

export const useVesuAssets = (poolId: bigint) => {
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
      console.error("Error fetching supported assets:", assetsError);
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

  return {
    assetsWithRates,
    assetMap,
    isLoading: supportedAssets == null,
    assetsError,
  };
};

export type UseVesuAssetsResult = ReturnType<typeof useVesuAssets>;
