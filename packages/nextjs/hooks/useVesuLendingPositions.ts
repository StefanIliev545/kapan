import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import {
  createVesuContextV1,
  normalizeStarknetAddress,
  type VesuContext,
  type VesuProtocolKey,
} from "~~/utils/vesu";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useVesuAssets } from "~~/hooks/useVesuAssets";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import { feltToString } from "~~/utils/protocols";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import {
  toHexAddress,
  normalizePrice,
  computeUsdValue,
  parsePositionTuples,
  type PositionTuple,
} from "./useProtocolPositions";

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
  ltvPercent?: number | null;
  moveCollaterals?: CollateralWithAmount[];
  poolKey: string;
  protocolKey: VesuProtocolKey;
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
  const { assetsWithRates, assetMap, collateralSet, debtSet, isLoading: isLoadingAssets, assetsError } = useVesuAssets(poolId);

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
    const zeroCounterpart = normalizeStarknetAddress(0n);
    return assetsWithRates
      .filter(asset => collateralSet?.has(toHexAddress(asset.address)))
      .map(asset => {
      const address = toHexAddress(asset.address);
      let symbol = feltToString(asset.symbol);
      if (!symbol || symbol.trim().length === 0) {
        symbol = getTokenNameFallback(address) ?? "UNKNOWN";
      }
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
        vesuContext: {
          deposit: createVesuContextV1(poolId, zeroCounterpart),
        },
      };
      });
  }, [assetsWithRates, poolId, collateralSet]);

  const borrowablePositions = useMemo<ProtocolPosition[]>(() => {
    return assetsWithRates
      .filter(asset => debtSet?.has(toHexAddress(asset.address)))
      .map(asset => {
      const address = toHexAddress(asset.address);
      let symbol = feltToString(asset.symbol);
      if (!symbol || symbol.trim().length === 0) {
        symbol = getTokenNameFallback(address) ?? "UNKNOWN";
      }
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
  }, [assetsWithRates, debtSet]);

  const rows = useMemo<VesuPositionRow[]>(() => {
    if (assetMap.size === 0) return [];

    return cachedPositions.flatMap((position, index) => {
      const collateralAddress = toHexAddress(position[0]);
      const debtAddress = toHexAddress(position[1]);
      const positionData = position[2];

      const collateralMetadata = assetMap.get(collateralAddress);
      if (!collateralMetadata) return [];

      let collateralSymbol = feltToString(collateralMetadata.symbol);
      if (!collateralSymbol || collateralSymbol.trim().length === 0) {
        collateralSymbol = getTokenNameFallback(collateralAddress) ?? "UNKNOWN";
      }
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

      const withdrawContext = createVesuContextV1(poolId, debtAddress);
      const depositContext = createVesuContextV1(poolId, debtAddress);

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
          deposit: depositContext,
          withdraw: withdrawContext,
        },
        actionsDisabled: positionData.is_vtoken,
        actionsDisabledReason: disabledReason,
      };

      const debtMetadata = assetMap.get(debtAddress);
      const borrowContext: VesuContext = createVesuContextV1(poolId, collateralAddress);
      const hasDebt = positionData.nominal_debt > 0n && Boolean(debtMetadata);

      let borrowPosition: ProtocolPosition | undefined;
      let debtSymbol: string | undefined;
      let ltvPercent: number | null = null;
      let debtUsd: number | null = null;

      if (debtMetadata) {
        let resolvedDebtSymbol = feltToString(debtMetadata.symbol);
        if (!resolvedDebtSymbol || resolvedDebtSymbol.trim().length === 0) {
          resolvedDebtSymbol = getTokenNameFallback(debtAddress) ?? "UNKNOWN";
        }
        debtSymbol = resolvedDebtSymbol;
        const debtPrice = normalizePrice(debtMetadata.price);

        debtUsd = computeUsdValue(positionData.nominal_debt, debtMetadata.decimals, debtPrice);
        if (collateralUsd > 0 && debtUsd > 0) {
          ltvPercent = (debtUsd / collateralUsd) * 100;
        }

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
            ...(hasDebt ? { repay: createVesuContextV1(poolId, collateralAddress) } : {}),
          },
          actionsDisabled: positionData.is_vtoken,
          actionsDisabledReason: disabledReason,
        };

        if (hasDebt) {
          borrowPosition = {
            ...baseBorrowPosition,
            balance: -(debtUsd ?? 0),
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
          ltvPercent,
          moveCollaterals,
          poolKey: `0x${poolId.toString(16)}`,
          protocolKey: "vesu",
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
