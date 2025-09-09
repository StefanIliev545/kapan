import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "~~/hooks/useAccount";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { VesuMarkets, POOL_IDS, ContractResponse } from "./VesuMarkets";
import { VesuPosition } from "./VesuPosition";
import { PositionData, TokenMetadata, formatTokenAmount, toAnnualRates } from "~~/utils/protocols";

type PositionTuple = {
  0: bigint; // collateral_asset
  1: bigint; // debt_asset
  2: PositionData;
};

export const VesuProtocolView: FC = () => {
  const { address: userAddress, status } = useAccount();
  const poolId = POOL_IDS["Genesis"];

  const { data: supportedAssets, error: assetsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
  }

  // Paginated user positions reads
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
    refetchInterval: 5000,
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
    refetchInterval: 5000,
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

  const isUpdating = isFetching1 || isFetching2;

  const refetchPositions = useCallback(() => {
    if (!userAddress) return;
    refetchPositionsPart1();
    refetchPositionsPart2();
  }, [userAddress, refetchPositionsPart1, refetchPositionsPart2]);

  // Keep previous positions while new data is loading to avoid UI flicker
  const [cachedPositions, setCachedPositions] = useState<PositionTuple[]>([]);

  useEffect(() => {
    if (!userAddress) {
      setCachedPositions([]);
      return;
    }
    if (!isUpdating) {
      setCachedPositions(mergedUserPositions);
    }
  }, [mergedUserPositions, isUpdating, userAddress]);

  useEffect(() => {
    if (userAddress) {
      refetchPositions();
    }
  }, [userAddress, refetchPositions]);

  useEffect(() => {
    const handler = () => refetchPositions();
    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [refetchPositions]);

  const positionRows = useMemo(() => {
    if (!supportedAssets) return null;
    const positions = cachedPositions as unknown as PositionTuple[];

    return positions?.map((position, index) => {
      const collateralAsset = `0x${position[0].toString(16).padStart(64, "0")}`;
      const debtAsset = `0x${position[1].toString(16).padStart(64, "0")}`;
      const positionData = position[2];

      const assetsWithRates = (supportedAssets as unknown as ContractResponse).map(asset => {
        if (asset.scale == 0n) {
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

      return (
        <VesuPosition
          key={`${collateralAsset}-${debtAsset}-${index}`}
          collateralAsset={collateralAsset}
          debtAsset={debtAsset}
          collateralShares={positionData.collateral_shares.toString()}
          collateralAmount={positionData.collateral_amount.toString()}
          nominalDebt={positionData.nominal_debt.toString()}
          isVtoken={positionData.is_vtoken}
          supportedAssets={assetsWithRates as unknown as TokenMetadata[]}
          poolId={poolId}
        />
      );
    });
  }, [cachedPositions, supportedAssets, poolId]);

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
    return <div>Error loading markets</div>;
  }

  return (
    <div className="space-y-4">
      <VesuMarkets
        supportedAssets={supportedAssets as ContractResponse | undefined}
        viewMode="grid"
        search=""
      />

      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="card-title text-lg">Your Positions</h2>
            {userAddress && positionRows?.length ? (
              <div className="text-right">
                <div className="text-sm text-gray-500">Total Net Balance</div>
                <div className="text-xl font-bold">
                  $
                  {positionRows
                    .reduce((total, position) => {
                      const collateralMetadata = position.props.supportedAssets.find(
                        (asset: TokenMetadata) =>
                          `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` ===
                          position.props.collateralAsset,
                      );
                      const debtMetadata = position.props.supportedAssets.find(
                        (asset: TokenMetadata) =>
                          `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` === position.props.debtAsset,
                      );

                      if (!collateralMetadata) return total;

                      const collateralAmtNum = parseFloat(
                        formatTokenAmount(position.props.collateralAmount, collateralMetadata.decimals),
                      );
                      const collateralPriceNum = parseFloat(
                        formatTokenAmount(collateralMetadata.price.value.toString(), 18),
                      );
                      const collateralValue = collateralAmtNum * collateralPriceNum;

                      let debtValue = 0;
                      if (position.props.nominalDebt !== "0" && debtMetadata) {
                        const debtAmtNum = parseFloat(formatTokenAmount(position.props.nominalDebt, 18));
                        const debtPriceNum = parseFloat(formatTokenAmount(debtMetadata.price.value.toString(), 18));
                        debtValue = debtAmtNum * debtPriceNum;
                      }

                      return total + (collateralValue - debtValue);
                    }, 0)
                    .toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                </div>
              </div>
            ) : null}
          </div>
          <div className={`flex flex-wrap gap-4 justify-start ${isUpdating ? "" : ""}`}>
            {status === "connecting" ? (
              <div className="text-center py-4 w-full">
                <span className="loading loading-spinner" />
              </div>
            ) : !userAddress ? (
              <div className="text-center py-4 text-gray-500 w-full">
                Connect your Starknet wallet to view
              </div>
            ) : positionRows?.length ? (
              positionRows
            ) : (
              <div className="text-center py-4 text-gray-500 w-full">No positions found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VesuProtocolView;
