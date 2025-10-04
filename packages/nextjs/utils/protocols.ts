import formatPercentage from "./formatPercentage";

// Constants
export const YEAR_IN_SECONDS = 31536000; // 365 days
export const SCALE = 10n ** 18n;

// Helper function to convert felt252 to string
export const feltToString = (felt: bigint): string => {
  // Convert felt to hex string and remove leading zeros
  const hex = felt.toString(16).replace(/^0+/, "");
  // Convert hex to ASCII
  return Buffer.from(hex, "hex").toString("ascii");
};

const wadToNumber = (value: bigint): number => Number(value) / Number(SCALE);

const ratePerSecond = (interestPerSecond: bigint): number => {
  if (interestPerSecond === 0n) return 0;
  return wadToNumber(interestPerSecond);
};

// Rate calculation functions
export const toAPR = (interestPerSecond: bigint): number => {
  return ratePerSecond(interestPerSecond) * YEAR_IN_SECONDS;
};

export const toAPY = (interestPerSecond: bigint): number => {
  const perSecond = ratePerSecond(interestPerSecond);
  if (perSecond === 0) return 0;
  if (perSecond <= -1) return 0;

  return Math.expm1(Math.log1p(perSecond) * YEAR_IN_SECONDS);
};

const computeUtilization = (borrowed: bigint, reserve: bigint) => {
  if (borrowed === 0n) return 0;
  const totalAssets = borrowed + reserve;
  if (totalAssets === 0n) return 0;

  const utilizationWad = (borrowed * SCALE) / totalAssets;
  return Number(utilizationWad) / Number(SCALE);
};

export const toAnnualRates = (
  interestPerSecond: bigint,
  total_nominal_debt: bigint,
  last_rate_accumulator: bigint,
  reserve: bigint,
  scale: bigint,
) => {
  // Return early if scale is 0 to avoid division by zero
  if (scale === 0n) {
    return { borrowAPR: 0, supplyAPY: 0 };
  }

  const borrowAPR = toAPR(interestPerSecond);
  const totalBorrowed = (total_nominal_debt * last_rate_accumulator) / SCALE;
  const normalisedReserve = (reserve * SCALE) / scale;
  const utilization = computeUtilization(totalBorrowed, normalisedReserve);
  const supplyAPY = toAPY(interestPerSecond) * utilization;

  if (!Number.isFinite(supplyAPY) || !Number.isFinite(borrowAPR)) {
    return { borrowAPR: 0, supplyAPY: 0 };
  }

  return { borrowAPR, supplyAPY };
};

// Formatting functions
export const formatRate = (rate: number, dropLeadingZero = true): string => {
  const percentage = rate * 100;
  const digits = rate < 0.01 ? 3 : 2;
  return `${formatPercentage(percentage, digits, dropLeadingZero)}%`;
};

export const formatTokenAmount = (amount: string, decimals: number): string => {
  try {
    const bigIntAmount = BigInt(amount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = bigIntAmount / divisor;
    const fraction = bigIntAmount % divisor;
    const fractionStr = fraction.toString().padStart(Number(decimals), "0");
    const formatted = `${whole}.${fractionStr}`;

    // Ensure exactly 3 decimal places
    const parts = formatted.split(".");
    if (parts.length === 1) {
      return `${parts[0]}.000`;
    }
    const decimalPart = parts[1].slice(0, 3).padEnd(3, "0");
    return `${parts[0]}.${decimalPart}`;
  } catch (error) {
    console.error("Error formatting token amount:", error);
    return "0.000";
  }
};

export const formatPrice = (price: bigint): string => {
  // Convert price to number and format with 2 decimal places
  const priceNum = Number(price) / 1e18; // Assuming price is in wei
  return priceNum.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatUtilization = (utilization: bigint): string => {
  // Convert utilization to percentage with 2 decimal places
  const utilizationNum = (Number(utilization) / 1e18) * 100; // Assuming utilization is in wei
  // Use toFixed to avoid locale-specific separators which break progress bars
  return utilizationNum.toFixed(2);
};

// Common types
export type TokenMetadata = {
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
  borrowAPR?: number;
  supplyAPY?: number;
};

export type PositionData = {
  collateral_shares: bigint;
  collateral_amount: bigint;
  nominal_debt: bigint;
  is_vtoken: boolean;
};
