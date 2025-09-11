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

// Rate calculation functions
export const toAPR = (interestPerSecond: bigint): number => {
  return (Number(interestPerSecond) * YEAR_IN_SECONDS) / Number(SCALE);
};

export const toAPY = (interestPerSecond: bigint): number => {
  return (1 + Number(interestPerSecond) / Number(SCALE)) ** YEAR_IN_SECONDS - 1;
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
  const totalBorrowed = Number((total_nominal_debt * last_rate_accumulator) / SCALE);
  const reserveScale = Number((reserve * SCALE) / scale);
  const supplyAPY = (toAPY(interestPerSecond) * totalBorrowed) / (reserveScale + totalBorrowed);
  return { borrowAPR, supplyAPY };
};

// Formatting functions
export const formatRate = (rate: number): string => {
  const percentage = rate * 100;
  const digits = rate < 0.01 ? 3 : 2;
  return `${formatPercentage(percentage, digits)}%`;
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
