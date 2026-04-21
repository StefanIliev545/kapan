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
import { resolveTokenDisplayName } from "~~/contracts/tokenNameFallbacks";
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
  const onChain = typeof symbol === "bigint" ? feltToString(symbol) : "";
  return resolveTokenDisplayName(onChain, address);
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

  // Paginate `get_all_positions_range` into small windows. Each call iterates
  // `end - start` pairs and does a `pool.context()` read per pair — the wider
  // the window, the closer we get to Starknet's per-call step limit. The Vesu
  // V2 Prime pool recently started reverting at window width 7; width 2 is
  // safely below the budget for all current pools. Windows 0..10 cover 10
  // (collateral, debt) pairs per user — bump WINDOW count if pools grow
  // further.
  const windows = useMemo(
    () => [
      [0n, 2n],
      [2n, 4n],
      [4n, 6n],
      [6n, 8n],
      [8n, 10n],
    ] as const,
    [],
  );

  const part0 = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, windows[0][0], windows[0][1]],
    watch: true,
  });
  const part1 = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, windows[1][0], windows[1][1]],
    watch: true,
  });
  const part2 = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, windows[2][0], windows[2][1]],
    watch: true,
  });
  const part3 = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, windows[3][0], windows[3][1]],
    watch: true,
  });
  const part4 = useScaffoldReadContract({
    contractName: "VesuGatewayV2",
    functionName: "get_all_positions_range",
    args: [userAddress, poolAddress, windows[4][0], windows[4][1]],
    watch: true,
  });

  const parts = [part0, part1, part2, part3, part4] as const;

  useEffect(() => {
    parts.forEach((p, idx) => {
      if (p.error) {
        console.error(`Error fetching V2 user positions (part ${idx}):`, p.error);
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
    poolId: normalizedPoolAddress,
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

  const suppliablePositions = useMemo(() => {
    // Suppliable = union(collaterals, debts). Re7 USDC pools list USDC as a
    // debt-only asset but users still lend it passively to earn yield — it
    // must show up in the deposit picker. Gateway allowlists are UI-only;
    // the pool itself is the real gatekeeper on the write path.
    return assetsWithRates
      .filter(asset => {
        const a = `0x${asset.address.toString(16).padStart(64, "0")}`;
        return collateralSet?.has(a) || debtSet?.has(a);
      })
      .map(asset => {
      const address = `0x${asset.address.toString(16).padStart(64, "0")}`;
      const symbol = resolveSymbol(asset.symbol, address);
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
  }, [assetsWithRates, normalizedPoolAddress, collateralSet, debtSet]);

  const borrowablePositions = useMemo(() => {
    return assetsWithRates
      .filter(asset => debtSet?.has(`0x${asset.address.toString(16).padStart(64, "0")}`))
      .map(asset => {
      const address = `0x${asset.address.toString(16).padStart(64, "0")}`;
      const symbol = resolveSymbol(asset.symbol, address);
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
