import { useMemo, useEffect, useState, useRef, useCallback } from "react";
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

const ZERO_ADDRESS = normalizeStarknetAddress(0n);

const normalizePrice = (price: { value: bigint; is_valid: boolean }) => (price.is_valid ? price.value / 10n ** 10n : 0n);

const computeUsdValue = (amount: bigint, decimals: number, price: bigint): number => {
  if (amount === 0n || price === 0n) {
    return 0;
  }

  const safeDecimals = Number.isFinite(decimals) ? decimals : 18;
  const amountAsNumber = Number(formatUnits(amount, safeDecimals));
  const priceAsNumber = Number(price) / 1e8;

  return amountAsNumber * priceAsNumber;
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

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return fallback;
};

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
  const [positionsRefetchInterval, setPositionsRefetchInterval] = useState(2000);
  const refetchCounter = useRef(0);

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
    refetchInterval: positionsRefetchInterval,
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
    refetchInterval: positionsRefetchInterval,
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

  const [cachedPositions, setCachedPositions] = useState<any[]>([]);
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
        const collateralAddress = `0x${collateralAddressRaw.toString(16).padStart(64, "0")}`;
        const debtAddress = `0x${debtAddressRaw.toString(16).padStart(64, "0")}`;

        const collateralAsset = assetMap.get(collateralAddress);
        const debtAsset = assetMap.get(debtAddress);

        const hasDebt = stats.nominal_debt > 0n;
        const hasDebtCounterpart = debtAddressRaw !== 0n;
        const counterpartForContext = hasDebtCounterpart ? debtAddress : ZERO_ADDRESS;
        const baseWithdrawContext = createVesuContextV2(normalizedPoolAddress, counterpartForContext);
        const baseDepositContext = createVesuContextV2(normalizedPoolAddress, counterpartForContext);
        const withdrawContext = stats.is_vtoken
          ? { ...baseWithdrawContext, isVtoken: true, collateralToken: collateralAddress }
          : baseWithdrawContext;
        const depositContext = stats.is_vtoken
          ? { ...baseDepositContext, isVtoken: true, collateralToken: collateralAddress }
          : baseDepositContext;

        // Prepare borrow context targeting the collateral token (needed for vToken positions with zero-debt)
        const borrowCtxForV2 = {
          ...createVesuContextV2(normalizedPoolAddress, collateralAddress),
          isVtoken: stats.is_vtoken,
          collateralToken: collateralAddress,
        } as const;

        if (!collateralAsset) {
          return null;
        }

        let collateralSymbol = feltToString(collateralAsset.symbol);
        if (!collateralSymbol || collateralSymbol.trim().length === 0) {
          collateralSymbol = getTokenNameFallback(collateralAddress) ?? "UNKNOWN";
        }
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

        // VesuV2 supports managing vToken positions (deposit/withdraw)
        const disabledReason = undefined;

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
          vesuContext: {
            deposit: depositContext,
            withdraw: withdrawContext,
          },
          actionsDisabled: false, // VesuV2 supports vToken management
          actionsDisabledReason: disabledReason,
        };

        let borrowPosition: ProtocolPosition | undefined;
        let debtSymbol: string | undefined;
        let ltvPercent: number | null = null;
        let debtUsd: number | null = null;
        if (debtAsset) {
          let resolvedDebtSymbol = feltToString(debtAsset.symbol);
          if (!resolvedDebtSymbol || resolvedDebtSymbol.trim().length === 0) {
            resolvedDebtSymbol = getTokenNameFallback(debtAddress) ?? "UNKNOWN";
          }
          debtSymbol = resolvedDebtSymbol;
          const debtPrice = normalizePrice(debtAsset.price);
          debtUsd = computeUsdValue(stats.nominal_debt, debtAsset.decimals, debtPrice);
          if (collateralUsd > 0 && debtUsd > 0) {
            ltvPercent = (debtUsd / collateralUsd) * 100;
          }

          const baseBorrowPosition: ProtocolPosition = {
            icon: tokenNameToLogo(debtSymbol.toLowerCase()),
            name: debtSymbol,
            balance: 0,
            tokenBalance: stats.nominal_debt,
            currentRate: (debtAsset.borrowAPR ?? 0) * 100,
            tokenAddress: debtAddress,
            tokenDecimals: debtAsset.decimals,
            tokenPrice: debtPrice,
            tokenSymbol: debtSymbol,
            collateralValue: collateralUsd,
            vesuContext: {
              borrow: borrowCtxForV2,
              ...(hasDebt
                ? { repay: createVesuContextV2(normalizedPoolAddress, collateralAddress) }
                : {}),
            },
            actionsDisabled: false, // VesuV2 supports vToken management
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
          // Always provide a borrow context that targets collateral for vToken migration
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
