import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import type { VesuContext } from "~~/utils/vesu";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useVesuAssets } from "~~/hooks/useVesuAssets";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import { feltToString } from "~~/utils/protocols";

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const normalizePrice = (price: { value: bigint; is_valid: boolean }) => (price.is_valid ? price.value / 10n ** 10n : 0n);

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return fallback;
};

type PositionTuple = [
  bigint,
  bigint,
  {
    collateral_shares: bigint;
    collateral_amount: bigint;
    nominal_debt: bigint;
    is_vtoken: boolean;
  },
];

const parsePositionTuples = (positions: unknown): PositionTuple[] => {
  if (!positions) return [];

  const entries = Array.isArray(positions)
    ? positions
    : typeof positions === "object"
      ? Object.values(positions as Record<string, unknown>)
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
      collateral_shares?: unknown;
      collateral_amount?: unknown;
      nominal_debt?: unknown;
      is_vtoken?: unknown;
    };

    const collateralShares = stats.collateral_shares;
    const collateralAmount = stats.collateral_amount;
    const nominalDebt = stats.nominal_debt;

    if (
      typeof collateralShares !== "bigint" ||
      typeof collateralAmount !== "bigint" ||
      typeof nominalDebt !== "bigint"
    ) {
      return [];
    }

    const tuple: PositionTuple = [
      collateralRaw,
      debtRaw,
      {
        collateral_shares: collateralShares,
        collateral_amount: collateralAmount,
        nominal_debt: nominalDebt,
        is_vtoken: toBoolean(stats.is_vtoken, false),
      },
    ];

    return [tuple];
  });
};

const computeUsdValue = (amount: bigint, decimals: number, price: bigint): number => {
  if (amount === 0n || price === 0n) {
    return 0;
  }

  const safeDecimals = Number.isFinite(decimals) ? decimals : 18;
  const amountAsNumber = Number(formatUnits(amount, safeDecimals));
  const priceAsNumber = Number(price) / 1e8;

  return amountAsNumber * priceAsNumber;
};

export type VesuPositionRow = {
  key: string;
  supply: ProtocolPosition;
  borrow?: ProtocolPosition;
  isVtoken: boolean;
  collateralSymbol: string;
  debtSymbol?: string;
  collateralAsset: AssetWithRates;
  debtAsset?: AssetWithRates;
  borrowContext: VesuContext;
  hasDebt: boolean;
  moveCollaterals?: CollateralWithAmount[];
};

interface UseVesuLendingPositionsResult {
  assetsWithRates: AssetWithRates[];
  suppliablePositions: ProtocolPosition[];
  borrowablePositions: ProtocolPosition[];
  rows: VesuPositionRow[];
  isUpdating: boolean;
  hasLoadedOnce: boolean;
  isLoadingPositions: boolean;
  isLoadingAssets: boolean;
  refetchPositions: () => void;
  assetsError?: unknown;
}

export const useVesuLendingPositions = (
  userAddress: string | undefined,
  poolId: bigint,
): UseVesuLendingPositionsResult => {
  const [positionsRefetchInterval, setPositionsRefetchInterval] = useState(2000);
  const refetchCounter = useRef(0);

  const { assetsWithRates, assetMap, isLoading: isLoadingAssets, assetsError } = useVesuAssets(poolId);

  const {
    data: userPositionsPart1,
    error: positionsError1,
    isFetching: isFetching1,
    isLoading: isLoading1,
    refetch: refetchPositionsPart1,
  } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 0n, 3n],
    watch: true,
    refetchInterval: positionsRefetchInterval,
  });

  const {
    data: userPositionsPart2,
    error: positionsError2,
    isFetching: isFetching2,
    isLoading: isLoading2,
    refetch: refetchPositionsPart2,
  } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 3n, 10n],
    watch: true,
    refetchInterval: positionsRefetchInterval,
  });

  useEffect(() => {
    if (positionsError1) {
      console.error("Error fetching user positions (part 1):", positionsError1);
    }
  }, [positionsError1]);

  useEffect(() => {
    if (positionsError2) {
      console.error("Error fetching user positions (part 2):", positionsError2);
    }
  }, [positionsError2]);

  const mergedUserPositions = useMemo(() => {
    const firstBatch = parsePositionTuples(userPositionsPart1);
    const secondBatch = parsePositionTuples(userPositionsPart2);
    return [...firstBatch, ...secondBatch];
  }, [userPositionsPart1, userPositionsPart2]);

  useEffect(() => {
    if (!userAddress) return;
    refetchCounter.current += 1;
    if (refetchCounter.current >= 3) {
      setPositionsRefetchInterval(5000);
    }
  }, [mergedUserPositions, userAddress]);

  const isUpdating = (isFetching1 && !isLoading1) || (isFetching2 && !isLoading2);
  const isLoadingPositions = isLoading1 || isLoading2;

  const refetchPositions = useCallback(() => {
    if (!userAddress) return;
    refetchPositionsPart1();
    refetchPositionsPart2();
  }, [userAddress, refetchPositionsPart1, refetchPositionsPart2]);

  const refetchPositionsRef = useRef(refetchPositions);

  useEffect(() => {
    refetchPositionsRef.current = refetchPositions;
  }, [refetchPositions]);

  const [cachedPositions, setCachedPositions] = useState<PositionTuple[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    refetchCounter.current = 0;
    setPositionsRefetchInterval(2000);
    setCachedPositions([]);
    setHasLoadedOnce(false);
    if (userAddress) {
      refetchPositionsRef.current?.();
    }
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress) {
      setCachedPositions([]);
      return;
    }
    if (!isLoading1 && !isLoading2) {
      setCachedPositions(mergedUserPositions);
      setHasLoadedOnce(true);
    }
  }, [mergedUserPositions, isLoading1, isLoading2, userAddress]);

  useEffect(() => {
    if (!userAddress) return;
    if (positionsError1 || positionsError2) {
      setHasLoadedOnce(true);
      return;
    }
    if (userPositionsPart1 !== undefined || userPositionsPart2 !== undefined) {
      setHasLoadedOnce(true);
    }
  }, [positionsError1, positionsError2, userAddress, userPositionsPart1, userPositionsPart2]);

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

  const rows = useMemo<VesuPositionRow[]>(() => {
    if (assetMap.size === 0) return [];

    return cachedPositions.flatMap((position, index) => {
      const collateralAddress = toHexAddress(position[0]);
      const debtAddress = toHexAddress(position[1]);
      const positionData = position[2];

      const collateralMetadata = assetMap.get(collateralAddress);
      if (!collateralMetadata) return [];

      const collateralSymbol = feltToString(collateralMetadata.symbol);
      const collateralPrice = normalizePrice(collateralMetadata.price);
      const collateralUsd = computeUsdValue(positionData.collateral_amount, collateralMetadata.decimals, collateralPrice);
      const formattedCollateral = formatUnits(positionData.collateral_amount, collateralMetadata.decimals);
      const moveCollaterals: CollateralWithAmount[] = [
        {
          token: collateralAddress,
          amount: positionData.collateral_amount,
          symbol: collateralSymbol,
          decimals: collateralMetadata.decimals,
          maxAmount: positionData.collateral_amount,
          supported: true,
          inputValue: formattedCollateral,
        },
      ];

      const disabledReason = positionData.is_vtoken ? "Managing vToken positions is not supported" : undefined;

      const supplyPosition: ProtocolPosition = {
        icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
        name: collateralSymbol,
        balance: collateralUsd,
        tokenBalance: positionData.collateral_amount,
        currentRate: (collateralMetadata.supplyAPY ?? 0) * 100,
        tokenAddress: collateralAddress,
        tokenDecimals: collateralMetadata.decimals,
        tokenPrice: collateralPrice,
        tokenSymbol: collateralSymbol,
        vesuContext: {
          deposit: positionData.nominal_debt > 0n ? { poolId, counterpartToken: debtAddress } : undefined,
          withdraw: { poolId, counterpartToken: debtAddress },
        },
        actionsDisabled: positionData.is_vtoken,
        actionsDisabledReason: disabledReason,
      };

      const debtMetadata = assetMap.get(debtAddress);
      const borrowContext: VesuContext = { poolId, counterpartToken: collateralAddress };
      const hasDebt = positionData.nominal_debt > 0n && Boolean(debtMetadata);

      let borrowPosition: ProtocolPosition | undefined;
      let debtSymbol: string | undefined;

      if (debtMetadata) {
        debtSymbol = feltToString(debtMetadata.symbol);
        const debtPrice = normalizePrice(debtMetadata.price);

        const baseBorrowPosition: ProtocolPosition = {
          icon: tokenNameToLogo(debtSymbol.toLowerCase()),
          name: debtSymbol,
          balance: 0,
          tokenBalance: positionData.nominal_debt,
          currentRate: (debtMetadata.borrowAPR ?? 0) * 100,
          tokenAddress: debtAddress,
          tokenDecimals: debtMetadata.decimals,
          tokenPrice: debtPrice,
          tokenSymbol: debtSymbol,
          collateralValue: collateralUsd,
          vesuContext: {
            borrow: borrowContext,
            ...(hasDebt ? { repay: { poolId, counterpartToken: collateralAddress } } : {}),
          },
          actionsDisabled: positionData.is_vtoken,
          actionsDisabledReason: disabledReason,
        };

        if (hasDebt) {
          const debtUsd = computeUsdValue(positionData.nominal_debt, debtMetadata.decimals, debtPrice);

          borrowPosition = {
            ...baseBorrowPosition,
            balance: -debtUsd,
            moveSupport: {
              preselectedCollaterals: moveCollaterals,
              disableCollateralSelection: true,
            },
          };
        } else {
          borrowPosition = baseBorrowPosition;
        }
      }

      return [
        {
          key: `${collateralAddress}-${debtAddress}-${index}`,
          supply: supplyPosition,
          borrow: borrowPosition,
          isVtoken: positionData.is_vtoken,
          collateralSymbol,
          debtSymbol,
          collateralAsset: collateralMetadata,
          debtAsset: debtMetadata,
          borrowContext,
          hasDebt,
          moveCollaterals,
        },
      ];
    });
  }, [assetMap, cachedPositions, poolId]);

  return {
    assetsWithRates,
    suppliablePositions,
    borrowablePositions,
    rows,
    isUpdating,
    hasLoadedOnce,
    isLoadingPositions,
    isLoadingAssets,
    refetchPositions,
    assetsError,
  };
};

export default useVesuLendingPositions;
