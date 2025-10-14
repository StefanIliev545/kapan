import { useEffect, useMemo } from "react";

import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import type { TokenMetadata } from "~~/utils/protocols";
import { toAnnualRates } from "~~/utils/protocols";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";

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

export type AssetWithRates = TokenMetadata & { borrowAPR: number; supplyAPY: number };

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

  // Fetch explicit allowlists for collateral and debt to correctly mark supply/borrow capability
  const { data: supportedCollaterals } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_collateral_assets",
    args: [poolId],
    refetchInterval: 0,
  });
  const { data: supportedDebts } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_debt_assets",
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

      // Fallback for empty symbol names
      const symbol = asset.symbol as unknown as string;
      if (!symbol || (typeof symbol === "bigint" && symbol === 0n)) {
        const hexAddr = toHexAddress(asset.address);
        const fallback = getTokenNameFallback(hexAddr);
        if (fallback) {
          // cast to any to override type, we only use display string further downstream when bigint missing
          (asset as any).symbol = fallback;
        }
      }

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

  const toHex = (v: unknown) => (typeof v === "bigint" ? `0x${v.toString(16).padStart(64, "0")}` : undefined);
  const collateralSet = useMemo(() => {
    if (!Array.isArray(supportedCollaterals)) return new Set<string>();
    const set = new Set<string>();
    for (const v of supportedCollaterals as unknown[]) {
      const hex = toHex(v);
      if (hex) set.add(hex);
    }
    return set;
  }, [supportedCollaterals]);
  const debtSet = useMemo(() => {
    if (!Array.isArray(supportedDebts)) return new Set<string>();
    const set = new Set<string>();
    for (const v of supportedDebts as unknown[]) {
      const hex = toHex(v);
      if (hex) set.add(hex);
    }
    return set;
  }, [supportedDebts]);

  return {
    assetsWithRates,
    assetMap,
    collateralSet,
    debtSet,
    isLoading: supportedAssets == null,
    assetsError,
  };
};

export type UseVesuAssetsResult = ReturnType<typeof useVesuAssets>;
