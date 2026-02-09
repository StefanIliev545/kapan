import { useMemo, useEffect, useRef, useCallback } from "react";
import { formatUnits } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useVesuV2Assets } from "./useVesuV2Assets";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import type { VesuPositionRow } from "~~/hooks/useVesuLendingPositions";
import type { CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { feltToString } from "~~/utils/protocols";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { createVesuContextV2, normalizeStarknetAddress, type VesuProtocolKey } from "~~/utils/vesu";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import {
  normalizePrice,
  computeUsdValue,
  parsePositionTuples,
  toHexAddress,
  type PositionTuple,
} from "./useProtocolPositions";
import { usePositionLoadingState } from "./useProtocolPositions/usePositionLoadingState";

const ZERO_ADDRESS = normalizeStarknetAddress(0n);

const resolveSymbol = (symbol: unknown, address: string): string => {
  if (typeof symbol === "bigint") {
    const symbolStr = feltToString(symbol);
    if (symbolStr && symbolStr.trim().length > 0) return symbolStr;
  }
  return getTokenNameFallback(address) ?? "UNKNOWN";
};

const buildVesuContext = (
  poolAddress: string,
  counterpart: string,
  isVtoken: boolean,
  collateralAddress: string,
) => {
  const baseContext = createVesuContextV2(poolAddress, counterpart);
  return isVtoken
    ? { ...baseContext, isVtoken: true, collateralToken: collateralAddress }
    : baseContext;
};

type DebtPositionResult = {
  borrowPosition: ProtocolPosition | undefined;
  debtSymbol: string | undefined;
  ltvPercent: number | null;
  debtUsd: number | null;
};

const buildDebtPosition = (
  debtAsset: AssetWithRates | undefined,
  debtAddress: string,
  collateralUsd: number,
  collateralAddress: string,
  nominalDebt: bigint,
  hasDebt: boolean,
  borrowCtxForV2: ReturnType<typeof createVesuContextV2> & { isVtoken: boolean; collateralToken: string },
  normalizedPoolAddress: string,
  moveCollaterals: CollateralWithAmount[],
): DebtPositionResult => {
  if (!debtAsset) {
    return { borrowPosition: undefined, debtSymbol: undefined, ltvPercent: null, debtUsd: null };
  }

  const debtSymbol = resolveSymbol(debtAsset.symbol, debtAddress);
  const debtPrice = normalizePrice(debtAsset.price);
  const debtUsd = computeUsdValue(nominalDebt, debtAsset.decimals, debtPrice);
  const ltvPercent = collateralUsd > 0 && debtUsd > 0 ? (debtUsd / collateralUsd) * 100 : null;

  const baseBorrowPosition: ProtocolPosition = {
    icon: tokenNameToLogo(debtSymbol.toLowerCase()),
    name: debtSymbol,
    balance: 0,
    tokenBalance: nominalDebt,
    currentRate: (debtAsset.borrowAPR ?? 0) * 100,
    tokenAddress: debtAddress,
    tokenDecimals: debtAsset.decimals,
    tokenPrice: debtPrice,
    tokenSymbol: debtSymbol,
    collateralValue: collateralUsd,
    vesuContext: {
      borrow: borrowCtxForV2,
      ...(hasDebt ? { repay: createVesuContextV2(normalizedPoolAddress, collateralAddress) } : {}),
    },
    actionsDisabled: false,
    actionsDisabledReason: undefined,
  };

  const borrowPosition = hasDebt
    ? {
        ...baseBorrowPosition,
        balance: -(debtUsd ?? 0),
        moveSupport: {
          preselectedCollaterals: moveCollaterals,
          disableCollateralSelection: true,
        },
      }
    : baseBorrowPosition;

  return { borrowPosition, debtSymbol, ltvPercent, debtUsd };
};

interface UseVesuV2LendingPositionsResult {
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

export const useVesuV2LendingPositions = (
  userAddress: string | undefined,
  poolAddress: string,
): UseVesuV2LendingPositionsResult => {
  const normalizedPoolAddress = normalizeStarknetAddress(poolAddress);
  const { assetsWithRates, assetMap, collateralSet, debtSet, isLoading: isLoadingAssets, assetsError } = useVesuV2Assets(normalizedPoolAddress);

  const {
    data: userPositionsPart1,
    error: positionsError1,
    isFetching: isFetching1,
    isLoading: isLoading1,
    refetch: refetchPositionsPart1,
  } = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, 0n, 3n],
    watch: true,
  });

  const {
    data: userPositionsPart2,
    error: positionsError2,
    isFetching: isFetching2,
    isLoading: isLoading2,
    refetch: refetchPositionsPart2,
  } = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, 3n, 10n],
    watch: true,
  });

  useEffect(() => {
    if (positionsError1) {
      console.error("Error fetching V2 user positions (part 1):", positionsError1);
    }
  }, [positionsError1]);

  useEffect(() => {
    if (positionsError2) {
      console.error("Error fetching V2 user positions (part 2):", positionsError2);
    }
  }, [positionsError2]);

  const mergedUserPositions = useMemo(() => {
    const firstBatch = parsePositionTuples(userPositionsPart1);
    const secondBatch = parsePositionTuples(userPositionsPart2);
    return [...firstBatch, ...secondBatch];
  }, [userPositionsPart1, userPositionsPart2]);

  const isLoadingPositions = isLoading1 || isLoading2;
  const isFetchingPositions = isFetching1 || isFetching2;
  const positionsError = positionsError1 || positionsError2;

  // Use shared loading state hook
  const { hasLoadedOnce, isUpdating, setCachedData, getCachedData } = usePositionLoadingState({
    isLoading: isLoadingPositions,
    isFetching: isFetchingPositions,
    userAddress,
    poolId: normalizedPoolAddress,
    error: positionsError,
    data: mergedUserPositions.length > 0 ? mergedUserPositions : undefined,
  });

  const refetchPositions = useCallback(() => {
    if (!userAddress) return;
    refetchPositionsPart1();
    refetchPositionsPart2();
  }, [userAddress, refetchPositionsPart1, refetchPositionsPart2]);

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

  const suppliablePositions = useMemo(() => {
    return assetsWithRates
      .filter(asset => collateralSet?.has(`0x${asset.address.toString(16).padStart(64, "0")}`))
      .map(asset => {
      const address = `0x${asset.address.toString(16).padStart(64, "0")}`;
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
          deposit: createVesuContextV2(normalizedPoolAddress, ZERO_ADDRESS),
        },
      };
      });
  }, [assetsWithRates, normalizedPoolAddress, collateralSet]);

  const borrowablePositions = useMemo(() => {
    return assetsWithRates
      .filter(asset => debtSet?.has(`0x${asset.address.toString(16).padStart(64, "0")}`))
      .map(asset => {
      const address = `0x${asset.address.toString(16).padStart(64, "0")}`;
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

  const rows = useMemo(() => {
    if (!userAddress || cachedPositions.length === 0) {
      return [];
    }

    return cachedPositions
      .map((position, index) => {
        const [collateralAddressRaw, debtAddressRaw, stats] = position;
        const isEmptyPosition = stats.collateral_amount === 0n && stats.nominal_debt === 0n;
        if (isEmptyPosition) return null;

        const collateralAddress = toHexAddress(collateralAddressRaw);
        const debtAddress = toHexAddress(debtAddressRaw);
        const collateralAsset = assetMap.get(collateralAddress);
        if (!collateralAsset) return null;

        const debtAsset = assetMap.get(debtAddress);
        const hasDebt = stats.nominal_debt > 0n;
        const counterpartForContext = debtAddressRaw !== 0n ? debtAddress : ZERO_ADDRESS;

        const withdrawContext = buildVesuContext(normalizedPoolAddress, counterpartForContext, stats.is_vtoken, collateralAddress);
        const depositContext = buildVesuContext(normalizedPoolAddress, counterpartForContext, stats.is_vtoken, collateralAddress);

        // Prepare borrow context targeting the collateral token (needed for vToken positions with zero-debt)
        const borrowCtxForV2 = {
          ...createVesuContextV2(normalizedPoolAddress, collateralAddress),
          isVtoken: stats.is_vtoken,
          collateralToken: collateralAddress,
        } as const;

        const collateralSymbol = resolveSymbol(collateralAsset.symbol, collateralAddress);
        const collateralPrice = normalizePrice(collateralAsset.price);
        const collateralUsd = computeUsdValue(stats.collateral_amount, collateralAsset.decimals, collateralPrice);
        const formattedCollateral = formatUnits(stats.collateral_amount, collateralAsset.decimals ?? 18);

        const moveCollaterals: CollateralWithAmount[] = [
          {
            token: collateralAddress,
            amount: stats.collateral_amount,
            symbol: collateralSymbol,
            decimals: collateralAsset.decimals,
            maxAmount: stats.collateral_amount,
            supported: true,
            inputValue: formattedCollateral,
          },
        ];

        const supplyPosition: ProtocolPosition = {
          icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
          name: collateralSymbol,
          balance: collateralUsd,
          tokenBalance: stats.collateral_amount,
          currentRate: (collateralAsset.supplyAPY ?? 0) * 100,
          tokenAddress: collateralAddress,
          tokenDecimals: collateralAsset.decimals,
          tokenPrice: collateralPrice,
          tokenSymbol: collateralSymbol,
          vesuContext: { deposit: depositContext, withdraw: withdrawContext },
          actionsDisabled: false,
          actionsDisabledReason: undefined,
        };

        const { borrowPosition, debtSymbol, ltvPercent } = buildDebtPosition(
          debtAsset,
          debtAddress,
          collateralUsd,
          collateralAddress,
          stats.nominal_debt,
          hasDebt,
          borrowCtxForV2,
          normalizedPoolAddress,
          moveCollaterals,
        );

        return {
          key: `${collateralAddress}-${debtAddress}-${index}`,
          supply: supplyPosition,
          borrow: borrowPosition,
          hasDebt,
          isVtoken: stats.is_vtoken,
          collateralSymbol,
          debtSymbol,
          collateralAsset,
          debtAsset,
          borrowContext: borrowCtxForV2,
          ltvPercent,
          moveCollaterals,
          poolKey: normalizedPoolAddress,
          protocolKey: "vesu_v2" as VesuProtocolKey,
        } satisfies VesuPositionRow;
      })
      .filter(Boolean) as VesuPositionRow[];
  }, [assetMap, cachedPositions, normalizedPoolAddress, userAddress]);

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

export default useVesuV2LendingPositions;
