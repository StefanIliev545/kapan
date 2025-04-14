import { FC, useMemo, useEffect, useState } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { MarketRow } from "./MarketRow";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Constants
const YEAR_IN_SECONDS = 31536000; // 365 days
const SCALE = 10n ** 18n;

// Helper function to convert felt252 to string
const feltToString = (felt: bigint): string => {
  // Convert felt to hex string and remove leading zeros
  const hex = felt.toString(16).replace(/^0+/, '');
  // Convert hex to ASCII
  return Buffer.from(hex, 'hex').toString('ascii');
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
  return `${(rate * 100).toFixed(2)}%`;
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

export const VesuProtocolView: FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: supportedAssets, error: assetsError } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [],
  });

  // Set up refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Memoize the market rows to prevent unnecessary re-renders
  const marketRows = useMemo(() => {
    if (!supportedAssets) return null;

    return (supportedAssets as unknown as ContractResponse)?.map((asset: ContractResponse[number]) => {
      const address = `0x${BigInt(asset.address).toString(16).padStart(64, '0')}`;
      const symbol = feltToString(asset.symbol);
      
      // Log all asset data
      console.log(`\nAsset: ${symbol} (${address})`);
      console.log('Raw data:', {
        fee_rate: asset.fee_rate.toString(),
        total_nominal_debt: asset.total_nominal_debt.toString(),
        last_rate_accumulator: asset.last_rate_accumulator.toString(),
        reserve: asset.reserve.toString(),
        scale: asset.scale.toString(),
        rate_accumulator: asset.rate_accumulator.toString(),
        utilization: asset.utilization.toString()
      });

      // The fee_rate from the contract is already the onchain interest rate from the extension
      // It's calculated using extension.interest_rate() in the VesuGateway contract
      const interestPerSecond = asset.fee_rate;
      
      // Calculate rates using the Vesu protocol's rate calculation logic with asset config data
      const { borrowAPR, supplyAPY } = toAnnualRates(
        interestPerSecond,
        asset.total_nominal_debt,
        asset.last_rate_accumulator,
        asset.reserve,
        asset.scale
      );

      // Log calculated rates
      console.log('Calculated rates:', {
        interestPerSecond: interestPerSecond.toString(),
        borrowAPR: formatRate(borrowAPR),
        supplyAPY: formatRate(supplyAPY)
      });
      
      return (
        <MarketRow
          key={address}
          icon={tokenNameToLogo(symbol.toLowerCase())}
          name={symbol}
          supplyRate={formatRate(supplyAPY)}
          borrowRate={formatRate(borrowAPR)}
        />
      );
    });
  }, [supportedAssets, refreshKey]);

  if (assetsError) {
    console.error("Error fetching supported assets:", assetsError);
    return <div>Error loading markets</div>;
  }
  
  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body p-4">
        <h2 className="card-title text-lg border-b border-base-200 pb-2">Vesu Markets</h2>
        <div className="space-y-2">
          {marketRows}
        </div>
      </div>
    </div>
  );
}; 