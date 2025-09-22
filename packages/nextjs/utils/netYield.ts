import type { ProtocolPosition } from "~~/components/ProtocolView";

const DAYS_IN_YEAR = 365;
const EPSILON = 1e-8;

type PositionLike = Pick<ProtocolPosition, "balance" | "currentRate">;

export interface NetYieldMetrics {
  totalSupplied: number;
  totalBorrowed: number;
  netAnnualYield: number;
  netYield30d: number;
  netApyPercent: number | null;
  netBalance: number;
}

interface CalculateNetYieldOptions {
  /**
   * Optional override for the equity/net balance value used when computing the
   * APY. When omitted the function will use `totalSupplied - totalBorrowed`.
   */
  netBalanceOverride?: number;
  /** Number of days used for the period calculation (defaults to 30). */
  days?: number;
}

const toNumber = (value: number) => (Number.isFinite(value) ? value : 0);

const toDecimalRate = (rate: number) => toNumber(Math.abs(rate)) / 100;

/**
 * Calculates aggregate yield information for a set of supplied and borrowed
 * protocol positions. Balances are expected to be expressed in USD terms and
 * rates in percentage points (e.g. 5 for 5%).
 */
export const calculateNetYieldMetrics = (
  supplied: PositionLike[],
  borrowed: PositionLike[],
  options: CalculateNetYieldOptions = {},
): NetYieldMetrics => {
  let totalSupplied = 0;
  let totalBorrowed = 0;
  let supplyAnnualYield = 0;
  let borrowAnnualCost = 0;

  supplied.forEach(position => {
    const balance = toNumber(position.balance);
    if (balance <= 0) return;

    const rateDecimal = toDecimalRate(position.currentRate);

    totalSupplied += balance;
    supplyAnnualYield += balance * rateDecimal;
  });

  borrowed.forEach(position => {
    const balance = Math.abs(toNumber(position.balance));
    if (balance <= 0) return;

    const rateDecimal = toDecimalRate(position.currentRate);

    totalBorrowed += balance;
    borrowAnnualCost += balance * rateDecimal;
  });

  const netAnnualYield = supplyAnnualYield - borrowAnnualCost;
  const computedNetBalance = totalSupplied - totalBorrowed;

  const baseForApy = options.netBalanceOverride ?? computedNetBalance;
  const denominator = Math.abs(baseForApy);
  const netApyPercent = denominator > EPSILON ? (netAnnualYield / denominator) * 100 : null;

  const days = options.days ?? 30;
  const netYield30d = netAnnualYield * (days / DAYS_IN_YEAR);

  return {
    totalSupplied,
    totalBorrowed,
    netAnnualYield,
    netYield30d,
    netApyPercent,
    netBalance: computedNetBalance,
  };
};

export default calculateNetYieldMetrics;
