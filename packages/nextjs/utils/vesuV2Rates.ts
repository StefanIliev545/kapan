import { SCALE, YEAR_IN_SECONDS } from "./protocols";

const ZERO = 0n;
const ONE = SCALE;
const SCALE_FLOAT = Number(SCALE);

const clampBigInt = (value: bigint, min: bigint, max: bigint) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export interface VesuV2RateInputs {
  utilization: bigint;
  zeroUtilizationRate?: bigint | null;
  fullUtilizationRate?: bigint | null;
  targetUtilization?: bigint | null;
  targetRatePercent?: bigint | null;
}

export interface VesuV2RateResult {
  interestRatePerSecond: bigint;
  targetRate: bigint;
  borrowAPR: number;
  supplyAPY: number;
}

const isBigInt = (value: unknown): value is bigint => typeof value === "bigint";

const calculateTargetRate = (
  zeroUtilizationRate: bigint,
  fullUtilizationRate: bigint,
  targetRatePercent: bigint,
) => {
  const span = fullUtilizationRate - zeroUtilizationRate;
  if (span === ZERO) {
    return zeroUtilizationRate;
  }

  return zeroUtilizationRate + (span * targetRatePercent) / SCALE;
};

const calculateInterestRate = (
  utilization: bigint,
  targetUtilization: bigint,
  zeroUtilizationRate: bigint,
  fullUtilizationRate: bigint,
  targetRate: bigint,
): bigint => {
  const safeUtilization = clampBigInt(utilization, ZERO, ONE);
  const safeTargetUtilization = clampBigInt(targetUtilization, ZERO, ONE);
  const safeFullUtilizationRate = fullUtilizationRate < zeroUtilizationRate ? zeroUtilizationRate : fullUtilizationRate;

  if (safeTargetUtilization === ZERO) {
    return safeFullUtilizationRate;
  }

  if (safeUtilization <= safeTargetUtilization) {
    const numerator = safeUtilization * (targetRate - zeroUtilizationRate);
    const delta = numerator / safeTargetUtilization;
    return zeroUtilizationRate + delta;
  }

  const utilizationSpan = ONE - safeTargetUtilization;
  if (utilizationSpan === ZERO) {
    return safeFullUtilizationRate;
  }

  const numerator = (safeUtilization - safeTargetUtilization) * (safeFullUtilizationRate - targetRate);
  const delta = numerator / utilizationSpan;
  return targetRate + delta;
};

const toNumberRate = (value: bigint) => {
  if (!isBigInt(value)) return 0;
  return Number(value) / SCALE_FLOAT;
};

const toBorrowApr = (interestRatePerSecond: bigint): number => {
  const perSecond = toNumberRate(interestRatePerSecond);
  if (!Number.isFinite(perSecond)) return 0;

  const exponent = perSecond * YEAR_IN_SECONDS;
  const clamped = Math.max(Math.min(exponent, 50), -50);
  const apr = Math.expm1(clamped);
  if (!Number.isFinite(apr) || apr < 0) {
    return 0;
  }
  return apr;
};

const toSupplyApr = (borrowApr: number, utilization: bigint): number => {
  if (!Number.isFinite(borrowApr) || borrowApr <= 0) return 0;
  const utilizationRatio = Number(clampBigInt(utilization, ZERO, ONE)) / SCALE_FLOAT;
  if (!Number.isFinite(utilizationRatio) || utilizationRatio <= 0) return 0;
  const apr = borrowApr * utilizationRatio;
  return Number.isFinite(apr) && apr > 0 ? apr : 0;
};

export const calculateVesuV2AnnualRates = (inputs: VesuV2RateInputs): VesuV2RateResult | null => {
  const { utilization, zeroUtilizationRate, fullUtilizationRate, targetRatePercent, targetUtilization } = inputs;

  if (
    !isBigInt(zeroUtilizationRate) ||
    !isBigInt(fullUtilizationRate) ||
    !isBigInt(targetRatePercent) ||
    !isBigInt(targetUtilization)
  ) {
    return null;
  }

  const targetRate = calculateTargetRate(zeroUtilizationRate, fullUtilizationRate, targetRatePercent);
  const interestRatePerSecond = calculateInterestRate(
    utilization,
    targetUtilization,
    zeroUtilizationRate,
    fullUtilizationRate,
    targetRate,
  );

  const borrowAPR = toBorrowApr(interestRatePerSecond);
  const supplyAPY = toSupplyApr(borrowAPR, utilization);

  return {
    interestRatePerSecond,
    targetRate,
    borrowAPR,
    supplyAPY,
  };
};
