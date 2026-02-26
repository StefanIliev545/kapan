import { useEffect, useMemo, useState } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import type { TokenMetadata } from "~~/utils/protocols";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import { useLogError } from "~~/hooks/common";

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

const toValueString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "bigint") return value.toString();
  return undefined;
};

const toDecimalsNumber = (decimals: unknown): number => {
  if (typeof decimals === "number") return decimals;
  if (typeof decimals === "string") return Number(decimals);
  if (typeof decimals === "bigint") return Number(decimals);
  return 18;
};

type RateField = { value?: unknown; decimals?: unknown } | null | undefined;

const extractRateValue = (field: RateField): number => {
  if (!field || typeof field !== "object") return 0;
  const { value, decimals } = field as { value?: unknown; decimals?: unknown };

  const valueStr = toValueString(value);
  if (!valueStr) return 0;

  const decimalsNum = toDecimalsNumber(decimals);
  if (!Number.isFinite(decimalsNum)) return 0;

  const decimalsInt = Math.max(0, Math.floor(decimalsNum));

  const base = Number(valueStr);
  if (!Number.isFinite(base)) return 0;

  const scale = 10 ** decimalsInt;
  return scale === 0 ? 0 : base / scale;
};

/**
 * Compute effective supply APY from Vesu API stats.
 * Yields are additive: base lending yield + LST staking yield + incentives.
 * - supplyApy: base yield from lending utilization
 * - lstApr: underlying LST staking yield (wstETH, xSTRK, BTC LSTs, etc.)
 * - defiSpringSupplyApr / btcFiSupplyApr: incentive programs
 */
const computeSupplyAPY = (stats: {
  supplyApy?: RateField;
  lstApr?: RateField;
  defiSpringSupplyApr?: RateField;
  btcFiSupplyApr?: RateField;
} | null | undefined): number => {
  const base = extractRateValue(stats?.supplyApy);
  const lst = extractRateValue(stats?.lstApr);
  const defiSpring = extractRateValue(stats?.defiSpringSupplyApr);
  const btcFi = extractRateValue(stats?.btcFiSupplyApr);
  return base + lst + defiSpring + btcFi;
};

type ApiAsset = {
  address?: unknown;
  stats?: {
    borrowApr?: RateField;
    supplyApy?: RateField;
    lstApr?: RateField;
    defiSpringSupplyApr?: RateField;
    btcFiSupplyApr?: RateField;
  } | null;
};

const processApiAssets = (
  assets: ApiAsset[],
): Record<string, { borrowAPR: number; supplyAPY: number }> => {
  const nextRates: Record<string, { borrowAPR: number; supplyAPY: number }> = {};

  for (const asset of assets) {
    const address = typeof asset.address === "string" ? asset.address.toLowerCase() : undefined;
    if (!address) continue;

    const stats = asset.stats ?? undefined;
    nextRates[address] = {
      borrowAPR: extractRateValue(stats?.borrowApr),
      supplyAPY: computeSupplyAPY(stats),
    };
  }

  return nextRates;
};

const isAbortError = (error: unknown): boolean =>
  typeof DOMException !== "undefined" &&
  error instanceof DOMException &&
  error.name === "AbortError";

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

  useLogError(assetsError, "Error fetching V2 supported assets:");

  const [poolRates, setPoolRates] = useState<Record<string, { borrowAPR: number; supplyAPY: number }>>({});
  const [ratesError, setRatesError] = useState<Error | null>(null);
  const [isRatesLoading, setIsRatesLoading] = useState(false);

  useEffect(() => {
    if (!poolAddress) {
      setPoolRates({});
      return;
    }

    const abortController = new AbortController();
    let isMounted = true;

    const fetchRates = async () => {
      setIsRatesLoading(true);
      setRatesError(null);

      try {
        const normalizedPoolAddress = poolAddress.toLowerCase();
        const response = await fetch(
          `https://api.vesu.xyz/pools/${normalizedPoolAddress}?onlyEnabledAssets=true`,
          { signal: abortController.signal },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch Vesu V2 rates: ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as { data?: { assets?: ApiAsset[] } };
        const assets = Array.isArray(json?.data?.assets) ? (json?.data?.assets as ApiAsset[]) : [];
        const nextRates = processApiAssets(assets);

        if (isMounted) {
          setPoolRates(nextRates);
        }
      } catch (error) {
        if (!isMounted) return;
        if (isAbortError(error)) return;
        console.error("Error fetching Vesu V2 rates:", error);
        setRatesError(error instanceof Error ? error : new Error("Unknown error fetching Vesu V2 rates"));
        setPoolRates({});
      } finally {
        if (isMounted) {
          setIsRatesLoading(false);
        }
      }
    };

    fetchRates();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [poolAddress]);

  const normalizedAssets = useMemo(() => parseSupportedAssets(supportedAssets), [supportedAssets]);

  // Fetch explicit allowlists for collateral and debt (V2 variant)
  const { data: supportedCollaterals } = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_supported_collateral_assets",
    args: [poolAddress],
    refetchInterval: 0,
  });
  const { data: supportedDebts } = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_supported_debt_assets",
    args: [poolAddress],
    refetchInterval: 0,
  });

  const assetsWithRates = useMemo<AssetWithRates[]>(() => {
    return normalizedAssets.map((asset: any) => {
      const hexAddress = `0x${asset.address.toString(16).padStart(64, "0")}`;
      const normalizedAddress = hexAddress.toLowerCase();
      const rates = poolRates[normalizedAddress];

      if (!asset.symbol || (typeof asset.symbol === "bigint" && asset.symbol === 0n)) {
        const fallback = getTokenNameFallback(hexAddress);
        if (fallback) {
          asset.symbol = fallback;
        }
      }

      return {
        ...asset,
        borrowAPR: rates?.borrowAPR ?? 0,
        supplyAPY: rates?.supplyAPY ?? 0,
      };
    });
  }, [normalizedAssets, poolRates]);

  const assetMap = useMemo(() => {
    const map = new Map<string, AssetWithRates>();
    assetsWithRates.forEach(asset => {
      const hexAddress = `0x${asset.address.toString(16).padStart(64, "0")}`;
      map.set(hexAddress, asset);
    });
    return map;
  }, [assetsWithRates]);

  const toHex = (v: unknown) => (typeof v === "bigint" ? `0x${v.toString(16).padStart(64, "0")}` : typeof v === "string" ? v.toLowerCase() : undefined);
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
    isLoading: supportedAssets == null || isRatesLoading,
    assetsError: assetsError ?? ratesError,
  };
};

export type UseVesuV2AssetsResult = ReturnType<typeof useVesuV2Assets>;
