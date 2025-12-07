export const BPS = 10_000n;

export function ratioBps(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  return (numerator * BPS) / denominator;
}

export function formatBps(bps: bigint, decimals = 2): string {
  const sign = bps < 0n ? "-" : "";
  const value = bps < 0n ? -bps : bps;
  const whole = value / 100n;
  const fraction = value % 100n;
  if (decimals <= 0) {
    return `${sign}${whole}`;
  }
  const fractionStr = fraction.toString().padStart(2, "0").slice(0, decimals);
  return `${sign}${whole}.${fractionStr}`;
}
