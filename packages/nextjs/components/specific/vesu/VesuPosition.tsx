import { FC } from "react";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Constants
const YEAR_IN_SECONDS = 31536000; // 365 days
const SCALE = 10n ** 18n;

type PositionData = {
  collateral_shares: bigint;
  nominal_debt: bigint;
};

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

export type VesuPositionProps = {
  collateralAsset: string;
  debtAsset: string;
  collateralShares: string;
  collateralAmount: string;
  nominalDebt: string;
  isVtoken: boolean;
  supportedAssets: TokenMetadata[];
};

// Helper: Format BigInt values with a provided number of decimals (for display)
const formatBigInt = (value: bigint, decimals: number): string => {
  try {
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = value / divisor;
    const fractional = value % divisor;

    if (fractional === 0n) {
      return whole.toString();
    }

    const numDecimals = Number(decimals);
    const fractionalStr = fractional.toString().padStart(numDecimals, "0");
    return `${whole}.${fractionalStr}`;
  } catch (error) {
    console.error("Error formatting BigInt:", error);
    return "0";
  }
};

// Helper: Convert felt252 to string
const feltToString = (felt: bigint): string => {
  const hex = felt.toString(16).replace(/^0+/, "");
  return Buffer.from(hex, "hex").toString("ascii");
};

// Helper: Find token metadata by matching full address string
const getTokenMetadata = (address: string, assets: TokenMetadata[]): TokenMetadata | undefined => {
  return assets.find(asset => `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` === address);
};

// Helper: Format token amount from its raw string using token decimals.
const formatTokenAmount = (amount: string, decimals: number): string => {
  try {
    const bigAmount = BigInt(amount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = bigAmount / divisor;
    const fraction = bigAmount % divisor;

    let fractionStr = fraction.toString();
    const zerosNeeded = Number(decimals) - fractionStr.length;
    if (zerosNeeded > 0) {
      fractionStr = "0".repeat(zerosNeeded) + fractionStr;
    }

    return `${whole}.${fractionStr}`;
  } catch (error) {
    console.error("Error formatting token amount:", error);
    return "0";
  }
};

// Helper: Calculate rates based on protocol data (returns numbers)
const calculateRates = (
  interestPerSecond: bigint,
  total_nominal_debt: bigint,
  last_rate_accumulator: bigint,
  reserve: bigint,
  scale: bigint,
) => {
  const borrowAPR = (Number(interestPerSecond) * YEAR_IN_SECONDS) / Number(SCALE);
  const totalBorrowed = Number((total_nominal_debt * last_rate_accumulator) / SCALE);
  
  // Handle zero scale to avoid division by zero
  const reserveScale = scale === 0n ? 0 : Number((reserve * SCALE) / scale);
  const supplyAPY = (reserveScale + totalBorrowed) === 0 ? 0 : (borrowAPR * totalBorrowed) / (reserveScale + totalBorrowed);
  
  return { borrowAPR, supplyAPY };
};

export const VesuPosition: FC<VesuPositionProps> = ({
  collateralAsset,
  debtAsset,
  collateralShares,
  collateralAmount,
  nominalDebt,
  isVtoken,
  supportedAssets,
}) => {
  const collateralMetadata = getTokenMetadata(collateralAsset, supportedAssets);
  const debtMetadata = getTokenMetadata(debtAsset, supportedAssets);

  if (!collateralMetadata) {
    console.error("Missing collateral metadata for asset:", collateralAsset);
    return null;
  }

  // Format token amounts for display
  const formattedCollateral = formatTokenAmount(collateralAmount, collateralMetadata.decimals);
  const formattedDebt = nominalDebt === "0" ? "0" : formatTokenAmount(nominalDebt, debtMetadata?.decimals || 0);

  const collateralSymbol = feltToString(collateralMetadata.symbol);
  const debtSymbol = debtMetadata ? feltToString(debtMetadata.symbol) : "";

  // === USD Value Calculations ===
  const collateralAmtNum = parseFloat(formatTokenAmount(collateralAmount, collateralMetadata.decimals));
  const debtAmtNum = parseFloat(formatTokenAmount(nominalDebt, debtMetadata?.decimals || 0));

  const collateralPriceNum = parseFloat(formatTokenAmount(collateralMetadata.price.value.toString(), 18));
  const debtPriceNum = parseFloat(formatTokenAmount(debtMetadata?.price.value.toString() || "0", 18));

  const collateralValueNum = collateralAmtNum * collateralPriceNum;
  const debtValueNum = debtAmtNum * debtPriceNum;

  const formattedCollateralValue = collateralValueNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedDebtValue = debtValueNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // === Rates Calculation ===
  const collateralRates = calculateRates(
    collateralMetadata.fee_rate,
    collateralMetadata.total_nominal_debt,
    collateralMetadata.last_rate_accumulator,
    collateralMetadata.reserve,
    collateralMetadata.scale,
  );
  const debtRates = calculateRates(
    debtMetadata?.fee_rate || 0n,
    debtMetadata?.total_nominal_debt || 0n,
    debtMetadata?.last_rate_accumulator || 0n,
    debtMetadata?.reserve || 0n,
    debtMetadata?.scale || 0n,
  );

  // === Monthly Yield/Cost Calculations ===
  const monthlyYieldNum = (collateralRates.supplyAPY * collateralValueNum) / 12;
  const monthlyCostNum = (debtRates.borrowAPR * debtValueNum) / 12;

  const formattedMonthlyYield = monthlyYieldNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedMonthlyCost = monthlyCostNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // === LTV Calculation ===
  const ltv = collateralValueNum > 0 ? (debtValueNum / collateralValueNum) * 100 : 0;
  const formattedLtv = ltv.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body p-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <img src={tokenNameToLogo(collateralSymbol.toLowerCase())} alt={collateralSymbol} className="w-6 h-6" />
            <span className="font-medium">{collateralSymbol}</span>
            {isVtoken && (
              <span className="badge badge-sm badge-primary">vToken</span>
            )}
          </div>
          {nominalDebt !== "0" && (
            <div className="flex items-center gap-2">
              <img src={tokenNameToLogo(debtSymbol.toLowerCase())} alt={debtSymbol} className="w-6 h-6" />
              <span className="font-medium">{debtSymbol}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* Collateral Section */}
          <div className="space-y-2">
            <div className="text-2xl font-bold">
              {collateralSymbol === "ETH" ? parseFloat(formattedCollateral).toFixed(4) : formattedCollateral}
            </div>
            <div className="text-lg text-gray-500">${formattedCollateralValue}</div>

            <div className="divider my-1"></div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Supply APY</span>
                <span className="text-sm font-medium text-success">
                  {(collateralRates.supplyAPY * 100).toFixed(3)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Monthly yield</span>
                <span className="text-sm font-medium">${formattedMonthlyYield}</span>
              </div>
            </div>
          </div>

          {/* Debt Section */}
          <div className="space-y-2">
            {nominalDebt === "0" ? (
              <>
                <div className="text-2xl font-bold text-gray-400">No debt</div>
                <div className="text-lg text-gray-400">$0.00</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {debtSymbol === "ETH" ? parseFloat(formattedDebt).toFixed(4) : formattedDebt}
                </div>
                <div className="text-lg text-gray-500">${formattedDebtValue}</div>
              </>
            )}

            <div className="divider my-1"></div>

            <div className="space-y-1">
              {nominalDebt === "0" ? (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">No debt</span>
                  <span className="text-sm font-medium text-gray-400">-</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Borrow APR</span>
                    <span className="text-sm font-medium text-error">{(debtRates.borrowAPR * 100).toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Monthly cost</span>
                    <span className="text-sm font-medium">${formattedMonthlyCost}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="divider my-2"></div>

        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-sm text-gray-500">Loan-to-value</span>
            <span className="text-sm font-medium">{formattedLtv}%</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary">Modify</button>
            <button className="btn btn-sm btn-error">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
