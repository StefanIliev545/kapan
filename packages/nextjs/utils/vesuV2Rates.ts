import { SCALE } from "./protocols";

const UTILIZATION_SCALE = 10n ** 5n;
const UTILIZATION_SCALE_TO_SCALE = 10n ** 13n;
const YEAR_IN_SECONDS_V2 = 360 * 24 * 60 * 60;

export interface VesuV2AssetSnapshot {
  total_nominal_debt: bigint;
  last_rate_accumulator: bigint;
  reserve: bigint;
  scale: bigint;
  last_full_utilization_rate?: bigint | null;
  last_updated?: bigint | null;
}

export interface VesuV2InterestRateConfig {
  zero_utilization_rate?: bigint | null;
  target_utilization?: bigint | null;
  target_rate_percent?: bigint | null;
  min_target_utilization?: bigint | null;
  max_target_utilization?: bigint | null;
  rate_half_life?: bigint | null;
  max_full_utilization_rate?: bigint | null;
  min_full_utilization_rate?: bigint | null;
}

export interface VesuV2RateInputs {
  asset: VesuV2AssetSnapshot;
  interestRateConfig: VesuV2InterestRateConfig;
}

export interface VesuV2RateResult {
  interestRatePerSecond: bigint;
  targetRate: bigint;
  borrowAPR: number;
  supplyAPY: number;
}

interface NormalizedInterestRateConfig {
  zero_utilization_rate: bigint;
  target_utilization: bigint;
  target_rate_percent: bigint;
  min_target_utilization: bigint;
  max_target_utilization: bigint;
  rate_half_life: bigint;
  max_full_utilization_rate: bigint;
  min_full_utilization_rate: bigint;
}

const isBigInt = (value: unknown): value is bigint => typeof value === "bigint";

const toBorrowApr = (interestPerSecond: bigint): number => {
  const perSecond = Number(interestPerSecond) / Number(SCALE);
  if (!Number.isFinite(perSecond)) {
    return 0;
  }
  return perSecond * YEAR_IN_SECONDS_V2;
};

const toBorrowApy = (interestPerSecond: bigint): number => {
  const perSecond = Number(interestPerSecond) / Number(SCALE);
  if (!Number.isFinite(perSecond)) {
    return 0;
  }

  const apy = (1 + perSecond) ** YEAR_IN_SECONDS_V2 - 1;
  return Number.isFinite(apy) ? apy : 0;
};

const toAnnualRatesV2 = (
  interestPerSecond: bigint,
  { total_nominal_debt, last_rate_accumulator, reserve, scale }: VesuV2AssetSnapshot,
): Pick<VesuV2RateResult, "borrowAPR" | "supplyAPY"> => {
  if (scale === 0n) {
    return { borrowAPR: 0, supplyAPY: 0 };
  }

  const borrowAPR = toBorrowApr(interestPerSecond);
  if (!Number.isFinite(borrowAPR) || borrowAPR < 0) {
    return { borrowAPR: 0, supplyAPY: 0 };
  }

  const baseApy = toBorrowApy(interestPerSecond);
  if (!Number.isFinite(baseApy) || baseApy < 0) {
    return { borrowAPR: borrowAPR || 0, supplyAPY: 0 };
  }

  const totalBorrowed = Number((total_nominal_debt * last_rate_accumulator) / SCALE);
  const reserveScale = Number((reserve * SCALE) / scale);
  const denominator = reserveScale + totalBorrowed;

  const supplyAPY = denominator === 0 ? 0 : (baseApy * totalBorrowed) / denominator;

  return {
    borrowAPR,
    supplyAPY: Number.isFinite(supplyAPY) && supplyAPY > 0 ? supplyAPY : 0,
  };
};

const calculateDebt = (nominalDebt: bigint, rateAccumulator: bigint, assetScale: bigint) => {
  return assetScale === 0n ? 0n : (((nominalDebt * rateAccumulator) / SCALE) * assetScale) / SCALE;
};

const calculateUtilization = ({
  total_nominal_debt,
  last_rate_accumulator,
  scale,
  reserve,
}: VesuV2AssetSnapshot) => {
  const totalDebt = calculateDebt(total_nominal_debt, last_rate_accumulator, scale);
  const totalAssets = reserve + totalDebt;
  if (totalAssets === 0n) {
    return 0n;
  }
  return (totalDebt * SCALE) / totalAssets;
};

const fullUtilizationRate = (
  interest_rate_config: NormalizedInterestRateConfig,
  timeDelta: bigint,
  utilization: bigint,
  fullUtilizationRateValue: bigint,
) => {
  const {
    min_target_utilization,
    max_target_utilization,
    rate_half_life,
    max_full_utilization_rate,
    min_full_utilization_rate,
  } = interest_rate_config;

  if (rate_half_life === 0n) {
    return clampBigInt(fullUtilizationRateValue, min_full_utilization_rate, max_full_utilization_rate);
  }

  const halfLifeScale = rate_half_life * SCALE;

  const newFullUtilizationRate = (() => {
    if (utilization < min_target_utilization && min_target_utilization !== 0n) {
      const utilizationDelta = ((min_target_utilization - utilization) * SCALE) / min_target_utilization;
      const decay = halfLifeScale + utilizationDelta * timeDelta;
      if (decay === 0n) {
        return fullUtilizationRateValue;
      }
      return (fullUtilizationRateValue * halfLifeScale) / decay;
    }

    if (utilization > max_target_utilization && max_target_utilization < UTILIZATION_SCALE) {
      const denominator = UTILIZATION_SCALE - max_target_utilization;
      if (denominator === 0n) {
        return max_full_utilization_rate;
      }
      const utilizationDelta = ((utilization - max_target_utilization) * SCALE) / denominator;
      const growth = halfLifeScale + utilizationDelta * timeDelta;
      return growth === 0n ? fullUtilizationRateValue : (fullUtilizationRateValue * growth) / halfLifeScale;
    }

    return fullUtilizationRateValue;
  })();

  return clampBigInt(newFullUtilizationRate, min_full_utilization_rate, max_full_utilization_rate);
};

const clampBigInt = (value: bigint, min: bigint, max: bigint) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const calculateInterestRate = (
  interest_rate_config: NormalizedInterestRateConfig,
  utilization: bigint,
  timeDelta: bigint,
  lastFullUtilizationRate: bigint,
): { interestRate: bigint; targetRate: bigint } => {
  const normalizedUtilization = clampBigInt(
    utilization / UTILIZATION_SCALE_TO_SCALE,
    0n,
    UTILIZATION_SCALE,
  );
  const { target_utilization, zero_utilization_rate, target_rate_percent } = interest_rate_config;

  const newFullUtilizationRate = fullUtilizationRate(
    interest_rate_config,
    timeDelta,
    normalizedUtilization,
    lastFullUtilizationRate,
  );

  const targetRate =
    ((newFullUtilizationRate - zero_utilization_rate) * target_rate_percent) / SCALE + zero_utilization_rate;

  if (target_utilization === 0n) {
    return { interestRate: newFullUtilizationRate, targetRate };
  }

  if (normalizedUtilization < target_utilization) {
    const delta = (normalizedUtilization * (targetRate - zero_utilization_rate)) / target_utilization;
    return { interestRate: zero_utilization_rate + delta, targetRate };
  }

  const utilizationSpan = SCALE - target_utilization;
  if (utilizationSpan === 0n) {
    return { interestRate: newFullUtilizationRate, targetRate };
  }

  const delta =
    ((normalizedUtilization - target_utilization) * (newFullUtilizationRate - targetRate)) / utilizationSpan;

  return { interestRate: targetRate + delta, targetRate };
};

const normalizeInterestConfig = (
  interestRateConfig: VesuV2InterestRateConfig,
): NormalizedInterestRateConfig | null => {
  const zeroUtilizationRate = interestRateConfig.zero_utilization_rate;
  const targetUtilization = interestRateConfig.target_utilization;
  const targetRatePercent = interestRateConfig.target_rate_percent;
  const minTargetUtilization = interestRateConfig.min_target_utilization;
  const maxTargetUtilization = interestRateConfig.max_target_utilization;
  const rateHalfLife = interestRateConfig.rate_half_life;
  const maxFullUtilizationRate = interestRateConfig.max_full_utilization_rate;
  const minFullUtilizationRate = interestRateConfig.min_full_utilization_rate;

  if (
    !isBigInt(zeroUtilizationRate) ||
    !isBigInt(targetUtilization) ||
    !isBigInt(targetRatePercent) ||
    !isBigInt(minTargetUtilization) ||
    !isBigInt(maxTargetUtilization) ||
    !isBigInt(rateHalfLife) ||
    !isBigInt(maxFullUtilizationRate) ||
    !isBigInt(minFullUtilizationRate)
  ) {
    return null;
  }

  return {
    zero_utilization_rate: zeroUtilizationRate,
    target_utilization: targetUtilization,
    target_rate_percent: targetRatePercent,
    min_target_utilization: minTargetUtilization,
    max_target_utilization: maxTargetUtilization,
    rate_half_life: rateHalfLife,
    max_full_utilization_rate: maxFullUtilizationRate,
    min_full_utilization_rate: minFullUtilizationRate,
  };
};

export const calculateVesuV2AnnualRates = (inputs: VesuV2RateInputs): VesuV2RateResult | null => {
  const { asset, interestRateConfig } = inputs;
  const normalizedInterestConfig = normalizeInterestConfig(interestRateConfig);
  const lastFullUtilizationRate = asset.last_full_utilization_rate;
  const lastUpdated = asset.last_updated;

  if (!normalizedInterestConfig || !isBigInt(lastFullUtilizationRate) || !isBigInt(lastUpdated)) {
    return null;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const timeDelta = now > lastUpdated ? now - lastUpdated : 0n;
  const utilization = calculateUtilization(asset);
  const { interestRate: interestRatePerSecond, targetRate } = calculateInterestRate(
    normalizedInterestConfig,
    utilization,
    timeDelta,
    lastFullUtilizationRate,
  );

  const { borrowAPR, supplyAPY } = toAnnualRatesV2(interestRatePerSecond, asset);

  return {
    interestRatePerSecond,
    targetRate,
    borrowAPR,
    supplyAPY,
  };
};
