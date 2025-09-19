import { useMemo } from "react";
import { formatUnits } from "viem";

import { POOL_IDS } from "~~/components/specific/vesu/VesuMarkets";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useAccount } from "~~/hooks/useAccount";
import { feltToString } from "~~/utils/protocols";

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return false;
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

const computePrefixedAmount = (decimals: number): bigint => {
  const exponent = Math.max(decimals - 3, 0);
  const amount = 10n ** BigInt(exponent);
  return amount > 0n ? amount : 1n;
};

type ParsedAsset = {
  address: string;
  symbol: string;
  decimals: number;
  icon: string;
};

const parseSupportedAssets = (raw: unknown): ParsedAsset[] => {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];

    const candidate = entry as {
      address?: unknown;
      symbol?: unknown;
      decimals?: unknown;
    };

    if (typeof candidate.address !== "bigint" || typeof candidate.symbol !== "bigint") {
      return [];
    }

    const decimals = normalizeDecimals(candidate.decimals);
    if (decimals === null) return [];

    const address = toHexAddress(candidate.address);
    const symbol = feltToString(candidate.symbol);

    return [
      {
        address,
        symbol,
        decimals,
        icon: tokenNameToLogo(symbol.toLowerCase()),
      },
    ];
  });
};

type ParsedPosition = {
  collateralAddress: string;
  debtAddress: string;
  collateralAmount: bigint;
  nominalDebt: bigint;
  isVtoken: boolean;
};

const parsePositions = (raw: unknown): ParsedPosition[] => {
  if (!raw) return [];

  const entries = Array.isArray(raw)
    ? raw
    : typeof raw === "object"
      ? Object.values(raw as Record<string, unknown>)
      : [];

  return entries.flatMap(entry => {
    if (!entry) return [];

    let collateralRaw: unknown;
    let debtRaw: unknown;
    let statsRaw: unknown;

    if (Array.isArray(entry)) {
      if (entry.length < 3) return [];
      [collateralRaw, debtRaw, statsRaw] = entry;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      collateralRaw = obj[0] ?? obj["0"];
      debtRaw = obj[1] ?? obj["1"];
      statsRaw = obj[2] ?? obj["2"];
    } else {
      return [];
    }

    if (typeof collateralRaw !== "bigint" || typeof debtRaw !== "bigint" || !statsRaw || typeof statsRaw !== "object") {
      return [];
    }

    const stats = statsRaw as {
      collateral_amount?: unknown;
      nominal_debt?: unknown;
      is_vtoken?: unknown;
    };

    if (typeof stats.collateral_amount !== "bigint" || typeof stats.nominal_debt !== "bigint") {
      return [];
    }

    return [
      {
        collateralAddress: toHexAddress(collateralRaw),
        debtAddress: toHexAddress(debtRaw),
        collateralAmount: stats.collateral_amount,
        nominalDebt: stats.nominal_debt,
        isVtoken: toBoolean(stats.is_vtoken),
      },
    ];
  });
};

export interface VesuGasCollateralOption {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  icon: string;
  formattedBalance: string;
  formattedEstimate: string;
  estimateAmount: bigint;
  poolId: bigint;
  poolIdString: string;
  counterpartToken: string;
  counterpartSymbol?: string;
}

export interface VesuGasBorrowOption {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  icon: string;
  formattedOutstanding: string;
  formattedEstimate: string;
  estimateAmount: bigint;
  poolId: bigint;
  poolIdString: string;
  counterpartToken: string;
  counterpartSymbol?: string;
}

export interface VesuGasOptionPair {
  id: string;
  collateral?: VesuGasCollateralOption;
  debt?: VesuGasBorrowOption;
}

interface UseVesuGasSourcesResult {
  collateralOptions: VesuGasCollateralOption[];
  debtOptions: VesuGasBorrowOption[];
  pairs: VesuGasOptionPair[];
  isLoading: boolean;
  error?: Error | null;
}

export const useVesuGasSources = (): UseVesuGasSourcesResult => {
  const { address: userAddress } = useAccount();
  const poolId = POOL_IDS["Genesis"];
  const poolIdString = useMemo(() => poolId.toString(), [poolId]);

  const { data: supportedAssets, error: assetsError, isLoading: isAssetsLoading } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });

  const {
    data: userPositionsPart1,
    error: positionsError1,
    isFetching: isFetchingPart1,
  } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 0n, 3n],
    watch: true,
    refetchInterval: userAddress ? 5000 : 0,
  });

  const {
    data: userPositionsPart2,
    error: positionsError2,
    isFetching: isFetchingPart2,
  } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 3n, 10n],
    watch: true,
    refetchInterval: userAddress ? 5000 : 0,
  });

  const parsedAssets = useMemo(() => parseSupportedAssets(supportedAssets), [supportedAssets]);

  const assetMap = useMemo(() => {
    const map = new Map<string, ParsedAsset>();
    parsedAssets.forEach(asset => {
      map.set(asset.address.toLowerCase(), asset);
    });
    return map;
  }, [parsedAssets]);

  const mergedPositions = useMemo(() => {
    const firstBatch = parsePositions(userPositionsPart1);
    const secondBatch = parsePositions(userPositionsPart2);
    return [...firstBatch, ...secondBatch];
  }, [userPositionsPart1, userPositionsPart2]);

  const collateralOptions = useMemo<VesuGasCollateralOption[]>(() => {
    if (assetMap.size === 0) return [];

    return mergedPositions
      .filter(position => position.collateralAmount > 0n && !position.isVtoken)
      .map(position => {
        const collateral = assetMap.get(position.collateralAddress.toLowerCase());
        if (!collateral) return null;

        const debt = assetMap.get(position.debtAddress.toLowerCase());
        const estimateAmount = computePrefixedAmount(collateral.decimals);
        const normalizedEstimate = position.collateralAmount < estimateAmount ? position.collateralAmount : estimateAmount;
        if (normalizedEstimate <= 0n) return null;

        return {
          id: `${position.collateralAddress}-${position.debtAddress}-collateral`,
          tokenAddress: position.collateralAddress,
          tokenSymbol: collateral.symbol,
          tokenDecimals: collateral.decimals,
          icon: collateral.icon,
          formattedBalance: formatUnits(position.collateralAmount, collateral.decimals),
          formattedEstimate: formatUnits(normalizedEstimate, collateral.decimals),
          estimateAmount: normalizedEstimate,
          poolId,
          poolIdString,
          counterpartToken: position.debtAddress,
          counterpartSymbol: debt?.symbol,
        } as VesuGasCollateralOption;
      })
      .filter((option): option is VesuGasCollateralOption => option !== null);
  }, [assetMap, mergedPositions, poolId]);

  const debtOptions = useMemo<VesuGasBorrowOption[]>(() => {
    if (assetMap.size === 0) return [];

    return mergedPositions
      .map(position => {
        const debt = assetMap.get(position.debtAddress.toLowerCase());
        const collateral = assetMap.get(position.collateralAddress.toLowerCase());
        if (!debt || position.isVtoken) return null;

        const estimateAmount = computePrefixedAmount(debt.decimals);
        return {
          id: `${position.collateralAddress}-${position.debtAddress}-borrow`,
          tokenAddress: position.debtAddress,
          tokenSymbol: debt.symbol,
          tokenDecimals: debt.decimals,
          icon: debt.icon,
          formattedOutstanding: formatUnits(position.nominalDebt, debt.decimals),
          formattedEstimate: formatUnits(estimateAmount, debt.decimals),
          estimateAmount,
          poolId,
          poolIdString,
          counterpartToken: position.collateralAddress,
          counterpartSymbol: collateral?.symbol,
        } as VesuGasBorrowOption;
      })
      .filter((option): option is VesuGasBorrowOption => option !== null);
  }, [assetMap, mergedPositions, poolId]);

  const optionPairs = useMemo<VesuGasOptionPair[]>(() => {
    if (mergedPositions.length === 0) return [];

    const map = new Map<string, VesuGasOptionPair>();

    const getKey = (collateralAddress: string, debtAddress: string) =>
      `${collateralAddress.toLowerCase()}-${debtAddress.toLowerCase()}`;

    collateralOptions.forEach(option => {
      const key = getKey(option.tokenAddress, option.counterpartToken);
      const existing = map.get(key) ?? { id: key };
      map.set(key, { ...existing, id: key, collateral: option });
    });

    debtOptions.forEach(option => {
      const key = getKey(option.counterpartToken, option.tokenAddress);
      const existing = map.get(key) ?? { id: key };
      map.set(key, { ...existing, id: key, debt: option });
    });

    return Array.from(map.values()).sort((a, b) => {
      const aHasCollateral = a.collateral ? 1 : 0;
      const bHasCollateral = b.collateral ? 1 : 0;
      if (aHasCollateral !== bHasCollateral) {
        return bHasCollateral - aHasCollateral;
      }

      const aHasDebt = a.debt ? 1 : 0;
      const bHasDebt = b.debt ? 1 : 0;
      if (aHasDebt !== bHasDebt) {
        return bHasDebt - aHasDebt;
      }

      return a.id.localeCompare(b.id);
    });
  }, [collateralOptions, debtOptions, mergedPositions]);

  const combinedError = assetsError || positionsError1 || positionsError2;

  const isInitialAssetsLoading = !supportedAssets && isAssetsLoading;
  const isInitialPositionsLoading = Boolean(
    userAddress &&
      ((userPositionsPart1 === undefined && isFetchingPart1) || (userPositionsPart2 === undefined && isFetchingPart2)),
  );

  const isLoading = Boolean(isInitialAssetsLoading || isInitialPositionsLoading);

  return {
    collateralOptions,
    debtOptions,
    pairs: optionPairs,
    isLoading,
    error: combinedError ?? null,
  };
};

export default useVesuGasSources;
