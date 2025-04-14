import { FC, useEffect, useMemo, useState } from "react";
import { MarketRow } from "./MarketRow";
import { VesuPosition } from "./VesuPosition";
import { useAccount } from "@starknet-react/core";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";

// Constants
const YEAR_IN_SECONDS = 31536000; // 365 days
const SCALE = 10n ** 18n;

// Helper function to convert felt252 to string
const feltToString = (felt: bigint): string => {
  // Convert felt to hex string and remove leading zeros
  const hex = felt.toString(16).replace(/^0+/, "");
  // Convert hex to ASCII
  return Buffer.from(hex, "hex").toString("ascii");
};

// Rate calculation functions
const toAPR = (interestPerSecond: bigint): number => {
  return (Number(interestPerSecond) * YEAR_IN_SECONDS) / Number(SCALE);
};

const toAPY = (interestPerSecond: bigint): number => {
  return (1 + Number(interestPerSecond) / Number(SCALE)) ** YEAR_IN_SECONDS - 1;
};

const toAnnualRates = (
  interestPerSecond: bigint,
  total_nominal_debt: bigint,
  last_rate_accumulator: bigint,
  reserve: bigint,
  scale: bigint,
) => {
  const borrowAPR = toAPR(interestPerSecond);
  const totalBorrowed = Number((total_nominal_debt * last_rate_accumulator) / SCALE);
  const reserveScale = Number((reserve * SCALE) / scale);
  const supplyAPY = (toAPY(interestPerSecond) * totalBorrowed) / (reserveScale + totalBorrowed);
  return { borrowAPR, supplyAPY };
};

const formatRate = (rate: number): string => {
  if (rate < 0.01) {
    return `${(rate * 100).toFixed(3)}%`;
  }
  return `${(rate * 100).toFixed(2)}%`;
};

// Helper function to format token amounts with correct decimals
const formatTokenAmount = (amount: string, decimals: number): string => {
  try {
    const bigIntAmount = BigInt(amount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = bigIntAmount / divisor;
    const fraction = bigIntAmount % divisor;
    const fractionStr = fraction.toString().padStart(Number(decimals), '0');
    return `${whole}.${fractionStr}`;
  } catch (error) {
    console.error('Error formatting token amount:', error);
    return '0';
  }
};

// Helper function to format price
const formatPrice = (price: bigint): string => {
  // Convert price to number and format with 2 decimal places
  const priceNum = Number(price) / 1e18; // Assuming price is in wei
  return priceNum.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper function to format utilization
const formatUtilization = (utilization: bigint): string => {
  // Convert utilization to percentage with 2 decimal places
  const utilizationNum = (Number(utilization) / 1e18) * 100; // Assuming utilization is in wei
  return utilizationNum.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

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

// Add type for position data
type PositionData = {
  collateral_shares: bigint;
  collateral_amount: bigint;
  nominal_debt: bigint;
};

type PositionTuple = {
  0: bigint; // collateral_asset
  1: bigint; // debt_asset
  2: {
    collateral_shares: bigint;
    collateral_amount: bigint;
    nominal_debt: bigint;
    is_vtoken: boolean;
  };
};

// Add TokenMetadata type
type TokenMetadata = {
  address: bigint;
  symbol: bigint;
  decimals: number;
  rate_accumulator: bigint;
  utilization: bigint;
  fee_rate: bigint;
  price: {
    value: bigint;
    is_valid: boolean;
  };
  total_nominal_debt: bigint;
  last_rate_accumulator: bigint;
  reserve: bigint;
  scale: bigint;
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

  console.log("Supported Assets:", userAddress);
  // Fetch user positions if connected
  const { data: userPositions, error: positionsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_all_positions",
    args: [userAddress || "0x0"], // Use zero address if not connected
    refetchInterval: 0,
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
        />
      );
    });
  }, [supportedAssets]);

  // Memoize the position rows to prevent unnecessary re-renders
  const positionRows = useMemo(() => {
    if (!userPositions || !supportedAssets) return null;

    const positions = userPositions as unknown as PositionTuple[];
    console.log("Raw positions data:", positions); // Debug log

    return positions?.map((position, index) => {
      const collateralAsset = `0x${position[0].toString(16).padStart(64, "0")}`;
      const debtAsset = `0x${position[1].toString(16).padStart(64, "0")}`;
      const positionData = position[2];

      // Debug log for each position
      console.log("Processing position:", {
        index,
        collateralAsset,
        debtAsset,
        collateralShares: positionData.collateral_shares.toString(),
        collateralAmount: positionData.collateral_amount.toString(),
        nominalDebt: positionData.nominal_debt.toString(),
        isVtoken: positionData.is_vtoken,
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
          supportedAssets={supportedAssets as unknown as TokenMetadata[]}
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
                            formatTokenAmount(position.props.nominalDebt, debtMetadata.decimals),
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
            <div className="space-y-4">
              {positionRows?.length ? (
                positionRows
              ) : (
                <div className="text-center py-4 text-gray-500">No positions found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
