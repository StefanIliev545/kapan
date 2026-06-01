import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { resolveTokenDisplayName } from "~~/contracts/tokenNameFallbacks";
import {
  toHexAddress,
  normalizePrice,
  computeUsdValue,
  parsePositionTuples,
  type PositionTuple,
} from "./useProtocolPositions";
import { usePositionLoadingState } from "./useProtocolPositions/usePositionLoadingState";

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

  // See note on V2 hook — paginate into small windows to stay under Starknet's
  // per-call step budget. Each window reads `pool.context()` per pair.
  const part0 = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 0n, 2n],
    watch: true,
  });
  const part1 = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 2n, 4n],
    watch: true,
  });
  const part2 = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 4n, 6n],
    watch: true,
  });
  const part3 = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 6n, 8n],
    watch: true,
  });
  const part4 = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    args: [userAddress, poolId, 8n, 10n],
    watch: true,
  });

  const parts = [part0, part1, part2, part3, part4] as const;

  useEffect(() => {
    parts.forEach((p, idx) => {
      if (p.error) {
        console.error(`Error fetching V1 user positions (part ${idx}):`, p.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part0.error, part1.error, part2.error, part3.error, part4.error]);

  const mergedUserPositions = useMemo(
    () => parts.flatMap(p => parsePositionTuples(p.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [part0.data, part1.data, part2.data, part3.data, part4.data],
  );

  const isLoadingPositions = parts.some(p => p.isLoading);
  const isFetchingPositions = parts.some(p => p.isFetching);
  const positionsError = parts.find(p => p.error)?.error;

  // Use shared loading state hook
  const { hasLoadedOnce, isUpdating, setCachedData, getCachedData } = usePositionLoadingState({
    isLoading: isLoadingPositions,
    isFetching: isFetchingPositions,
    userAddress,
    poolId: poolId.toString(),
    error: positionsError,
    data: mergedUserPositions.length > 0 ? mergedUserPositions : undefined,
  });

  const refetchPositions = useCallback(() => {
    if (!userAddress) return;
    parts.forEach(p => p.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, part0.refetch, part1.refetch, part2.refetch, part3.refetch, part4.refetch]);

  const refetchPositionsRef = useRef(refetchPositions);

  useEffect(() => {
    refetchPositionsRef.current = refetchPositions;
  }, [refetchPositions]);

  // Refetch when userAddress changes
  useEffect(() => {
    if (userAddress) {
      refetchPositionsRef.current?.();
    }
  }, [userAddress]);

  // Cache positions when loading completes
  useEffect(() => {
    if (!userAddress) {
      setCachedData<PositionTuple[]>([]);
      return;
    }
    if (!isLoadingPositions && mergedUserPositions.length > 0) {
      setCachedData(mergedUserPositions);
    }
  }, [mergedUserPositions, isLoadingPositions, userAddress, setCachedData]);

  const cachedPositions = getCachedData<PositionTuple[]>() ?? [];

  const suppliablePositions = useMemo<ProtocolPosition[]>(() => {
    const zeroCounterpart = normalizeStarknetAddress(0n);
    // Suppliable = union(collaterals, debts). A pool's debt-only asset (e.g.
    // USDC on Re7 Ecosystem V1) is still passively lent — users need to be
    // able to pick it as a deposit target. The gateway's allowlists are
    // UI-only hints anyway; the pool/extension is the real gatekeeper.
    return assetsWithRates
      .filter(asset => {
        const a = toHexAddress(asset.address);
        return collateralSet?.has(a) || debtSet?.has(a);
      })
      .map(asset => {
      const address = toHexAddress(asset.address);
      const symbol = resolveTokenDisplayName(feltToString(asset.symbol), address);
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
  }, [assetsWithRates, poolId, collateralSet, debtSet]);

  const borrowablePositions = useMemo<ProtocolPosition[]>(() => {
    return assetsWithRates
      .filter(asset => debtSet?.has(toHexAddress(asset.address)))
      .map(asset => {
      const address = toHexAddress(asset.address);
      const symbol = resolveTokenDisplayName(feltToString(asset.symbol), address);
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

      const collateralSymbol = resolveTokenDisplayName(
        feltToString(collateralMetadata.symbol),
        collateralAddress,
      );
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
        debtSymbol = resolveTokenDisplayName(feltToString(debtMetadata.symbol), debtAddress);
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
