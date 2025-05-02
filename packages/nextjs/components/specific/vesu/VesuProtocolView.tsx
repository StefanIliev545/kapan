import { FC, useEffect, useMemo, useState } from "react";
import { MarketRow } from "./MarketRow";
import { VesuPosition } from "./VesuPosition";
import { useAccount } from "@starknet-react/core";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import {
  YEAR_IN_SECONDS,
  SCALE,
  feltToString,
  toAPR,
  toAPY,
  toAnnualRates,
  formatRate,
  formatTokenAmount,
  formatPrice,
  formatUtilization,
  TokenMetadata,
  PositionData,
} from "~~/utils/protocols";

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

  // Fetch supported assets
  const { data: supportedAssets, error: assetsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [],
    refetchInterval: 0,
  });
  // Fetch user positions if connected
  const { data: userPositions, error: positionsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions",
    args: [userAddress || "0x0"], // Use zero address if not connected
    watch: true,
    refetchInterval: 10000,
  });

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

      return (
        <MarketRow
          key={address}
          icon={tokenNameToLogo(symbol.toLowerCase())}
          name={symbol}
          supplyRate={formatRate(supplyAPY)}
          borrowRate={formatRate(borrowAPR)}
          price={formatPrice(asset.price.value)}
          utilization={formatUtilization(asset.utilization)}
          address={address}
          networkType="starknet"
        />
      );
    });
  }, [supportedAssets]);

  // Memoize the position rows to prevent unnecessary re-renders
  const positionRows = useMemo(() => {
    if (!userPositions || !supportedAssets) return null;

    const positions = userPositions as unknown as PositionTuple[];

    return positions?.map((position, index) => {
      const collateralAsset = `0x${position[0].toString(16).padStart(64, "0")}`;
      const debtAsset = `0x${position[1].toString(16).padStart(64, "0")}`;
      const positionData = position[2];

      // Calculate rates for all supported assets
      const assetsWithRates = (supportedAssets as unknown as ContractResponse).map(asset => {
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
        />
      );
    });
  }, [userPositions, supportedAssets]);

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
    return <div>Error loading markets</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-4">
          <h2 className="card-title text-lg border-b border-base-200 pb-2">Vesu Markets</h2>
          <div className="space-y-2">{marketRows}</div>
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
                          const debtAmtNum = parseFloat(
                            formatTokenAmount(position.props.nominalDebt, 18),
                          );
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
