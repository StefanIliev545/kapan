import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { MarketCard } from "./MarketCard";
import { MarketRow } from "./MarketRow";
import { VesuPosition } from "./VesuPosition";
import { useAccount } from "@starknet-react/core";
import { ListBulletIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import {
  PositionData,
  SCALE,
  TokenMetadata,
  YEAR_IN_SECONDS,
  feltToString,
  formatPrice,
  formatRate,
  formatTokenAmount,
  formatUtilization,
  toAPR,
  toAPY,
  toAnnualRates,
} from "~~/utils/protocols";

// Define pool IDs
const POOL_IDS = {
  Genesis: 2198503327643286920898110335698706244522220458610657370981979460625005526824n,
  "Re7 USDC": 3592370751539490711610556844458488648008775713878064059760995781404350938653n,
  "Alterscope wstETH": 2612229586214495842527551768232431476062656055007024497123940017576986139174n,
} as const;

type ContractResponse = {
  readonly type: "core::array::Array::<kapan::gateways::VesuGateway::TokenMetadata>";
  readonly address: bigint;
  readonly symbol: bigint;
  readonly decimals: number;
  readonly rate_accumulator: bigint;
  readonly utilization: bigint;
  readonly fee_rate: bigint;
  readonly price: {
    value: bigint;
    is_valid: boolean;
  };
  readonly total_nominal_debt: bigint;
  readonly last_rate_accumulator: bigint;
  readonly reserve: bigint;
  readonly scale: bigint;
}[];

type PositionTuple = {
  0: bigint; // collateral_asset
  1: bigint; // debt_asset
  2: PositionData;
};

export const VesuProtocolView: FC = () => {
  const { address: userAddress } = useAccount();
  const [selectedPoolId, setSelectedPoolId] = useState<bigint>(POOL_IDS["Genesis"]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Fetch supported assets
  const { data: supportedAssets, error: assetsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [selectedPoolId],
    refetchInterval: 0,
  });

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
  }

  // Paginated user positions reads
  const { data: userPositionsPart1, error: positionsError1 } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    // start at 0, end at 50 (exclusive). Adjust page size as needed.
    args: [userAddress || "0x0", selectedPoolId, 0n, 3n],
    watch: true,
    refetchInterval: 5000,
  });
  const { data: userPositionsPart2, error: positionsError2 } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions_range",
    // second page 50..100
    args: [userAddress || "0x0", selectedPoolId, 3n, 10n],
    watch: true,
    refetchInterval: 5000,
  });

  if (positionsError1) {
    console.error("Error fetching user positions (part 1):", positionsError1);
  }
  if (positionsError2) {
    console.error("Error fetching user positions (part 2):", positionsError2);
  }

  // Merge paginated results
  const mergedUserPositions = useMemo(() => {
    const p1 = (userPositionsPart1 as unknown as PositionTuple[]) || [];
    const p2 = (userPositionsPart2 as unknown as PositionTuple[]) || [];
    return [...p1, ...p2];
  }, [userPositionsPart1, userPositionsPart2]);

  // Memoize the market rows to prevent unnecessary re-renders
  const marketRows = useMemo(() => {
    if (!supportedAssets) return null;

    return (supportedAssets as unknown as ContractResponse)?.map((asset: ContractResponse[number]) => {
      const address = `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;
      const symbol = feltToString(asset.symbol);

      // The fee_rate from the contract is already the onchain interest rate from the extension
      // It's calculated using extension.interest_rate() in the VesuGateway contract
      const interestPerSecond = asset.fee_rate;

      // Calculate rates using the Vesu protocol's rate calculation logic with asset config data
      const { borrowAPR, supplyAPY } = toAnnualRates(
        interestPerSecond,
        asset.total_nominal_debt,
        asset.last_rate_accumulator,
        asset.reserve,
        asset.scale,
      );

      const props = {
        key: address,
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        supplyRate: formatRate(supplyAPY),
        borrowRate: formatRate(borrowAPR),
        price: formatPrice(asset.price.value),
        utilization: formatUtilization(asset.utilization),
        address,
        networkType: "starknet" as const,
      };

      return viewMode === "grid" ? <MarketCard {...props} /> : <MarketRow {...props} />;
    });
  }, [supportedAssets, viewMode]);

  // Memoize the position rows to prevent unnecessary re-renders
  const positionRows = useMemo(() => {
    if (!mergedUserPositions || !supportedAssets) return null;

    const positions = mergedUserPositions as unknown as PositionTuple[];

    return positions?.map((position, index) => {
      const collateralAsset = `0x${position[0].toString(16).padStart(64, "0")}`;
      const debtAsset = `0x${position[1].toString(16).padStart(64, "0")}`;
      const positionData = position[2];

      // Calculate rates for all supported assets
      const assetsWithRates = (supportedAssets as unknown as ContractResponse).map(asset => {
        if (asset.scale == 0n) {
          return {
            ...asset,
            borrowAPR: 0,
            supplyAPY: 0,
          };
        }
        const { borrowAPR, supplyAPY } = toAnnualRates(
          asset.fee_rate,
          asset.total_nominal_debt,
          asset.last_rate_accumulator,
          asset.reserve,
          asset.scale,
        );

        return {
          ...asset,
          borrowAPR,
          supplyAPY,
        };
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
          poolId={selectedPoolId}
        />
      );
    });
  }, [mergedUserPositions, supportedAssets, selectedPoolId]);

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
    return <div>Error loading markets</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-4">
          <div className="flex items-center justify-between border-b border-base-200 pb-2 mb-4">
            <h2 className="card-title text-lg">Vesu Markets</h2>
            <div className="join">
              <button
                className={`btn btn-xs join-item ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setViewMode("list")}
                aria-label="List view"
              >
                <ListBulletIcon className="h-4 w-4" />
              </button>
              <button
                className={`btn btn-xs join-item ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
              >
                <Squares2X2Icon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Pool Selection Tabs */}
          <div className="tabs tabs-boxed mb-4">
            <button
              className={`tab ${selectedPoolId === POOL_IDS["Genesis"] ? "tab-active" : ""}`}
              onClick={() => setSelectedPoolId(POOL_IDS["Genesis"])}
            >
              <Image src="/logos/vesu.svg" alt="Vesu" width={20} height={20} className="rounded-full min-w-[20px]" />
              Genesis
            </button>
            <button
              className={`tab ${selectedPoolId === POOL_IDS["Re7 USDC"] ? "tab-active" : ""}`}
              onClick={() => setSelectedPoolId(POOL_IDS["Re7 USDC"])}
            >
              <Image src="/logos/re7.svg" alt="Re7" width={20} height={20} className="rounded-full min-w-[20px]" />
              Re7 USDC
            </button>
            <button
              className={`tab ${selectedPoolId === POOL_IDS["Alterscope wstETH"] ? "tab-active" : ""}`}
              onClick={() => setSelectedPoolId(POOL_IDS["Alterscope wstETH"])}
            >
              <Image
                src="/logos/alterscope_symbol_black.svg"
                alt="Alterscope"
                width={20}
                height={20}
                className="rounded-full min-w-[20px] dark:hidden"
              />
              <Image
                src="/logos/alterscope_symbol_white.svg"
                alt="Alterscope"
                width={20}
                height={20}
                className="rounded-full min-w-[20px] hidden dark:block"
              />
              Alterscope wstETH
            </button>
          </div>

          <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
            {marketRows}
          </div>
        </div>
      </div>

      {userAddress && (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="card-title text-lg">Your Positions</h2>
              {positionRows?.length ? (
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

                        // Calculate collateral value
                        const collateralAmtNum = parseFloat(
                          formatTokenAmount(position.props.collateralAmount, collateralMetadata.decimals),
                        );
                        const collateralPriceNum = parseFloat(
                          formatTokenAmount(collateralMetadata.price.value.toString(), 18),
                        );
                        const collateralValue = collateralAmtNum * collateralPriceNum;

                        // Calculate debt value
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
            <div className="flex flex-wrap gap-4 justify-start">
              {positionRows?.length ? (
                positionRows
              ) : (
                <div className="text-center py-4 text-gray-500 w-full">No positions found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
