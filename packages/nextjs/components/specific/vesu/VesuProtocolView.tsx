import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import Image from "next/image";
import { ProtocolPosition } from "../../ProtocolView";
import type { CollateralWithAmount } from "../../specific/collateral/CollateralSelector";
import { SupplyPosition } from "../../SupplyPosition";
import { BorrowPosition } from "../../BorrowPosition";
import { TokenSelectModalStark } from "../../modals/stark/TokenSelectModalStark";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useAccount } from "~~/hooks/useAccount";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { PositionManager } from "~~/utils/position";
import { feltToString, toAnnualRates, type TokenMetadata } from "~~/utils/protocols";
import { POOL_IDS } from "./VesuMarkets";
import { formatUnits } from "viem";
import type { VesuContext } from "~~/hooks/useLendingAction";
import { FiChevronDown, FiChevronUp, FiPlus } from "react-icons/fi";

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const normalizePrice = (price: { value: bigint; is_valid: boolean }) => (price.is_valid ? price.value / 10n ** 10n : 0n);

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return fallback;
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

type AssetWithRates = TokenMetadata & { borrowAPR: number; supplyAPY: number };

type VesuPositionRow = {
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

export const VesuProtocolView: FC = () => {
  const { address: userAddress, status } = useAccount();
  const poolId = POOL_IDS["Genesis"];

  const [positionsRefetchInterval, setPositionsRefetchInterval] = useState(2000);
  const refetchCounter = useRef(0);

  const { data: supportedAssets, error: assetsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
  }

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

  if (positionsError1) {
    console.error("Error fetching user positions (part 1):", positionsError1);
  }
  if (positionsError2) {
    console.error("Error fetching user positions (part 2):", positionsError2);
  }

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
  const [borrowSelection, setBorrowSelection] = useState<{
    tokens: AssetWithRates[];
    collateralAddress: string;
    vesuContext: VesuContext;
    position: PositionManager;
  } | null>(null);
  const [depositSelection, setDepositSelection] = useState<{
    tokens: AssetWithRates[];
    vesuContext?: VesuContext;
    position?: PositionManager;
  } | null>(null);
  const [isMarketsOpen, setIsMarketsOpen] = useState(!userAddress);
  const [marketsManuallyToggled, setMarketsManuallyToggled] = useState(false);

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
  }, [
    positionsError1,
    positionsError2,
    userAddress,
    userPositionsPart1,
    userPositionsPart2,
  ]);

  useEffect(() => {
    const handler = () => refetchPositions();
    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [refetchPositions]);

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

  const vesuRows = useMemo<VesuPositionRow[]>(() => {
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

  const netBalanceUsd = useMemo(() => {
    if (vesuRows.length === 0) {
      return 0;
    }

    let totalSupply = 0;
    let totalDebt = 0;

    vesuRows.forEach(row => {
      totalSupply += row.supply.balance;
      if (row.borrow) {
        totalDebt += Math.abs(row.borrow.balance);
      }
    });

    return totalSupply - totalDebt;
  }, [vesuRows]);

  const formatCurrency = useCallback((amount: number) => {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return formatter.format(amount);
  }, []);

  const hasPositions = vesuRows.length > 0;

  useEffect(() => {
    if (!userAddress) {
      setIsMarketsOpen(true);
      setMarketsManuallyToggled(false);
      return;
    }

    setMarketsManuallyToggled(false);
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress || marketsManuallyToggled) return;

    setIsMarketsOpen(!hasPositions);
  }, [userAddress, hasPositions, marketsManuallyToggled]);

  const handleToggleMarkets = () => {
    setIsMarketsOpen(previous => !previous);
    setMarketsManuallyToggled(true);
  };

  if (assetsError) {
    console.error("Error loading markets:", assetsError);
    return <div>Error loading markets</div>;
  }

  const isLoadingAssets = supportedAssets == null;

  return (
    <div className="w-full flex flex-col p-4 space-y-6">
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-4 space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 relative rounded-lg bg-base-200 p-1 flex items-center justify-center">
                <Image src="/logos/vesu.svg" alt="Vesu icon" width={36} height={36} className="object-contain" />
              </div>
              <div className="flex flex-col">
                <div className="text-xl font-bold tracking-tight">Vesu</div>
                <div className="text-xs text-base-content/70">Manage your Starknet lending positions</div>
                {userAddress && (
                  <div className="text-xs text-base-content/70 flex items-center gap-1 mt-1">
                    <span>Balance:</span>
                    <span
                      className={`font-semibold ${netBalanceUsd >= 0 ? "text-success" : "text-error"}`}
                    >
                      {formatCurrency(netBalanceUsd)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 md:items-end">
              {!userAddress ? (
                <span className="text-xs text-base-content/70 text-right">
                  Connect your Starknet wallet to view personalized positions
                </span>
              ) : hasPositions ? (
                <span className="text-xs text-base-content/70 text-right">
                  Markets are hidden while you manage your positions
                </span>
              ) : (
                <span className="text-xs text-base-content/70 text-right">
                  No active positions yet – explore the markets below
                </span>
              )}
              <button className="btn btn-sm btn-ghost border border-base-300" type="button" onClick={handleToggleMarkets}>
                <span className="mr-2">Markets</span>
                {isMarketsOpen ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isMarketsOpen && (
            <div className="space-y-4 border-t border-base-200 pt-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h2 className="card-title text-lg">Markets</h2>
                {isLoadingAssets && (
                  <div className="flex items-center text-xs text-base-content/60">
                    <span className="loading loading-spinner loading-xs mr-1" /> Loading markets
                  </div>
                )}
              </div>

              {isLoadingAssets ? (
                <div className="flex justify-center py-6">
                  <span className="loading loading-spinner loading-md" />
                </div>
              ) : assetsWithRates.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
                      Suppliable assets
                    </div>
                    {suppliablePositions.length > 0 ? (
                      suppliablePositions.map(position => (
                        <SupplyPosition
                          key={position.tokenAddress}
                          {...position}
                          protocolName="Vesu"
                          networkType="starknet"
                          disableMove
                          hideBalanceColumn
                          availableActions={{ deposit: false, withdraw: false, move: false }}
                          showInfoDropdown={false}
                        />
                      ))
                    ) : (
                      <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
                        No supply markets available
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
                      Borrowable assets
                    </div>
                    {borrowablePositions.length > 0 ? (
                      borrowablePositions.map(position => (
                        <BorrowPosition
                          key={position.tokenAddress}
                          {...position}
                          protocolName="Vesu"
                          networkType="starknet"
                          hideBalanceColumn
                          availableActions={{ borrow: false, repay: false, move: false }}
                          showInfoDropdown={false}
                        />
                      ))
                    ) : (
                      <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
                        No borrow markets available
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
                  No markets available
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-4 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="card-title text-lg">Your Vesu Positions</h2>
            <div className="flex items-center gap-4">
              {isUpdating && userAddress && (
                <div className="flex items-center text-xs text-base-content/60">
                  <span className="loading loading-spinner loading-xs mr-1" /> Updating
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {status === "connecting" || (userAddress && !hasLoadedOnce) ? (
              <div className="flex justify-center py-6">
                <span className="loading loading-spinner loading-md" />
              </div>
            ) : !userAddress ? (
              <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
                Connect your Starknet wallet to view your Vesu positions
              </div>
            ) : vesuRows.length > 0 ? (
              vesuRows.map(row => {
                const positionManager = PositionManager.fromPositions(
                  [row.supply],
                  row.borrow ? [row.borrow] : [],
                );

                const containerColumns = "grid-cols-1 md:grid-cols-2 md:divide-x";

                const availableBorrowTokens = assetsWithRates.filter(
                  asset => toHexAddress(asset.address) !== row.supply.tokenAddress,
                );
                const canInitiateBorrow =
                  !row.hasDebt && Boolean(row.borrowContext) && availableBorrowTokens.length > 0;
                const borrowButtonDisabled = row.supply.actionsDisabled;

                const handleBorrowFromSupply = (event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  if (!canInitiateBorrow || !row.borrowContext) return;
                  setBorrowSelection({
                    tokens: availableBorrowTokens,
                    collateralAddress: row.supply.tokenAddress,
                    vesuContext: row.borrowContext,
                    position: positionManager,
                  });
                };

                return (
                  <div
                    key={row.key}
                    className={`rounded-md border border-base-300 overflow-hidden`}
                  >
                    <div
                      className={`grid divide-y divide-base-300 md:divide-y-0 ${containerColumns}`}
                    >
                      <SupplyPosition
                        {...row.supply}
                        protocolName="Vesu"
                        networkType="starknet"
                        position={positionManager}
                        disableMove
                        subtitle={row.isVtoken ? "vToken" : undefined}
                        containerClassName="rounded-none"
                        showInfoDropdown={false}
                      />
                      {row.borrow ? (
                        <BorrowPosition
                          {...row.borrow}
                          protocolName="Vesu"
                          networkType="starknet"
                          position={positionManager}
                          containerClassName="rounded-none"
                          availableActions={
                            row.hasDebt ? { move: false } : { borrow: true, repay: false, move: false }
                          }
                          showNoDebtLabel={!row.hasDebt}
                          showInfoDropdown={false}
                          headerOpensMoveModal={row.hasDebt}
                        />
                      ) : (
                        <div className="p-3 bg-base-200/60 border border-dashed border-base-300 h-full flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-base-content/70">No debt</span>
                            <span className="text-xs text-base-content/50">
                              You are not borrowing against this collateral yet.
                            </span>
                          </div>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={handleBorrowFromSupply}
                            disabled={!canInitiateBorrow || borrowButtonDisabled}
                            title={
                              borrowButtonDisabled
                                ? row.supply.actionsDisabledReason
                                : canInitiateBorrow
                                  ? "Borrow against this collateral"
                                  : "No borrowable assets available"
                            }
                          >
                            Borrow
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
                No positions found
              </div>
            )}

            <div className="rounded-md border border-dashed border-base-300 overflow-hidden">
              <div className="grid divide-y divide-base-300 md:divide-y-0 grid-cols-1 md:grid-cols-2 md:divide-x">
                <div className="p-3 bg-base-200/60 h-full flex flex-col justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-base-content/70">Add collateral</span>
                    <span className="text-xs text-base-content/50">
                      Supply assets to start or grow your borrowing power.
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={event => {
                        event.stopPropagation();
                        if (assetsWithRates.length === 0) return;
                        setDepositSelection({
                          tokens: assetsWithRates,
                        });
                      }}
                      disabled={assetsWithRates.length === 0}
                      title={
                        assetsWithRates.length === 0
                          ? "No assets available to deposit"
                          : "Deposit collateral"
                      }
                    >
                      <FiPlus className="w-4 h-4" />
                      <span>Deposit</span>
                    </button>
                  </div>
                </div>
                <div className="hidden md:block" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {borrowSelection && (
        <TokenSelectModalStark
          isOpen={borrowSelection !== null}
          onClose={() => setBorrowSelection(null)}
          tokens={borrowSelection.tokens}
          protocolName="Vesu"
          collateralAsset={borrowSelection.collateralAddress}
          vesuContext={borrowSelection.vesuContext}
          position={borrowSelection.position}
        />
      )}
      {depositSelection && (
        <TokenSelectModalStark
          isOpen={depositSelection !== null}
          onClose={() => setDepositSelection(null)}
          tokens={depositSelection.tokens}
          protocolName="Vesu"
          vesuContext={depositSelection.vesuContext}
          position={depositSelection.position}
          action="deposit"
        />
      )}
    </div>
  );
};

export default VesuProtocolView;
