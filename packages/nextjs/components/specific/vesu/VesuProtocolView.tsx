import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { SupplyPosition } from "../../SupplyPosition";
import { BorrowPosition } from "../../BorrowPosition";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useAccount } from "~~/hooks/useAccount";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { PositionManager } from "~~/utils/position";
import { feltToString, toAnnualRates } from "~~/utils/protocols";
import type { ContractResponse } from "./VesuMarkets";
import { POOL_IDS } from "./VesuMarkets";
import { formatUnits } from "viem";

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const normalizePrice = (price: { value: bigint; is_valid: boolean }) => (price.is_valid ? price.value / 10n ** 10n : 0n);

const computeUsdValue = (amount: bigint, decimals: number, price: bigint): number => {
  if (amount === 0n || price === 0n) {
    return 0;
  }

  const amountAsNumber = Number(formatUnits(amount, decimals));
  const priceAsNumber = Number(price) / 1e8;

  return amountAsNumber * priceAsNumber;
};

type PositionTuple = {
  0: bigint; // collateral asset
  1: bigint; // debt asset
  2: {
    collateral_shares: bigint;
    collateral_amount: bigint;
    nominal_debt: bigint;
    is_vtoken: boolean;
  };
};

type AssetWithRates = ContractResponse[number] & { borrowAPR: number; supplyAPY: number };

type VesuPositionRow = {
  key: string;
  supply: ProtocolPosition;
  borrow?: ProtocolPosition;
  isVtoken: boolean;
  collateralSymbol: string;
  debtSymbol?: string;
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
    const p1 = (userPositionsPart1 as unknown as PositionTuple[]) || [];
    const p2 = (userPositionsPart2 as unknown as PositionTuple[]) || [];
    return [...p1, ...p2];
  }, [userPositionsPart1, userPositionsPart2]);

  useEffect(() => {
    if (!userAddress) return;
    refetchCounter.current += 1;
    if (refetchCounter.current >= 3) {
      setPositionsRefetchInterval(5000);
    }
  }, [mergedUserPositions, userAddress]);

  const isUpdating = isFetching1 || isFetching2;

  const refetchPositions = useCallback(() => {
    if (!userAddress) return;
    refetchPositionsPart1();
    refetchPositionsPart2();
  }, [userAddress, refetchPositionsPart1, refetchPositionsPart2]);

  const [cachedPositions, setCachedPositions] = useState<PositionTuple[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    refetchCounter.current = 0;
    setPositionsRefetchInterval(2000);
    setCachedPositions([]);
    setHasLoadedOnce(false);
    if (userAddress) {
      refetchPositions();
    }
  }, [userAddress, refetchPositions]);

  useEffect(() => {
    if (!userAddress) {
      setCachedPositions([]);
      return;
    }
    if (!isUpdating) {
      setCachedPositions(mergedUserPositions);
      setHasLoadedOnce(true);
    }
  }, [mergedUserPositions, isUpdating, userAddress]);

  useEffect(() => {
    const handler = () => refetchPositions();
    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [refetchPositions]);

  const assetsWithRates = useMemo<AssetWithRates[]>(() => {
    if (!supportedAssets) return [];

    return (supportedAssets as ContractResponse).map(asset => {
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
  }, [supportedAssets]);

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

    return cachedPositions
      .map((position, index) => {
        const collateralAddress = toHexAddress(position[0]);
        const debtAddress = toHexAddress(position[1]);
        const positionData = position[2];

        const collateralMetadata = assetMap.get(collateralAddress);
        if (!collateralMetadata) return null;

        const collateralSymbol = feltToString(collateralMetadata.symbol);
        const collateralPrice = normalizePrice(collateralMetadata.price);
        const collateralUsd = computeUsdValue(positionData.collateral_amount, collateralMetadata.decimals, collateralPrice);

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
        let borrowPosition: ProtocolPosition | undefined;
        let debtSymbol: string | undefined;

        if (positionData.nominal_debt > 0n && debtMetadata) {
          debtSymbol = feltToString(debtMetadata.symbol);
          const debtPrice = normalizePrice(debtMetadata.price);
          const debtUsd = computeUsdValue(positionData.nominal_debt, debtMetadata.decimals, debtPrice);

          borrowPosition = {
            icon: tokenNameToLogo(debtSymbol.toLowerCase()),
            name: debtSymbol,
            balance: -debtUsd,
            tokenBalance: positionData.nominal_debt,
            currentRate: (debtMetadata.borrowAPR ?? 0) * 100,
            tokenAddress: debtAddress,
            tokenDecimals: debtMetadata.decimals,
            tokenPrice: debtPrice,
            tokenSymbol: debtSymbol,
            collateralValue: collateralUsd,
            vesuContext: {
              borrow: { poolId, counterpartToken: collateralAddress },
              repay: { poolId, counterpartToken: collateralAddress },
            },
            actionsDisabled: positionData.is_vtoken,
            actionsDisabledReason: disabledReason,
          };
        } else if (debtMetadata) {
          debtSymbol = feltToString(debtMetadata.symbol);
        }

        return {
          key: `${collateralAddress}-${debtAddress}-${index}`,
          supply: supplyPosition,
          borrow: borrowPosition,
          isVtoken: positionData.is_vtoken,
          collateralSymbol,
          debtSymbol,
        };
      })
      .filter((row): row is VesuPositionRow => row !== null);
  }, [assetMap, cachedPositions, poolId]);

  const totalNetBalance = useMemo(() => {
    return vesuRows.reduce((total, row) => total + row.supply.balance + (row.borrow ? row.borrow.balance : 0), 0);
  }, [vesuRows]);

  if (assetsError) {
    console.error("Error loading markets:", assetsError);
    return <div>Error loading markets</div>;
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <div className="w-full flex flex-col p-4 space-y-6">
      <ProtocolView
        protocolName="Vesu"
        protocolIcon="/logos/vesu.svg"
        ltv={75}
        maxLtv={90}
        suppliedPositions={suppliablePositions}
        borrowedPositions={borrowablePositions}
        forceShowAll={!userAddress}
        networkType="starknet"
        disableMoveSupply
      />

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
              {userAddress && vesuRows.length > 0 && (
                <div className="text-right">
                  <div className="text-sm text-base-content/70">Total Net Balance</div>
                  <div className="text-xl font-bold">{formatCurrency(totalNetBalance)}</div>
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

                return (
                  <div key={row.key} className="grid gap-4 md:grid-cols-2">
                    <SupplyPosition
                      {...row.supply}
                      protocolName="Vesu"
                      networkType="starknet"
                      position={positionManager}
                      disableMove
                      afterInfoContent={
                        row.isVtoken ? <span className="badge badge-xs badge-primary ml-2">vToken</span> : undefined
                      }
                    />
                    {row.borrow ? (
                      <BorrowPosition
                        {...row.borrow}
                        protocolName="Vesu"
                        networkType="starknet"
                        position={positionManager}
                      />
                    ) : (
                      <div className="flex items-center justify-center rounded-md bg-base-200/60 p-4 text-sm text-base-content/70">
                        No active debt for {row.collateralSymbol}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
                No positions found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VesuProtocolView;
