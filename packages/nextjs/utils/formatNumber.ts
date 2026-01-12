export const formatNumber = (value: number): string => {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`;
  }
  return value.toFixed(2);
};

/**
 * Format a number as USD currency using Intl.NumberFormat
 * @param value - The number to format
 * @param showSign - Whether to show +/- sign for positive/negative values (default: false)
 */
export const formatCurrency = (value: number, showSign = false): string => {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (showSign) {
    return value >= 0 ? formatted : `-${formatted}`;
  }
  return value >= 0 ? formatted : `-${formatted}`;
};

/**
 * Format a number as compact USD (e.g., $1.23K, $1.23M)
 * @param value - The number to format
 */
export const formatCurrencyCompact = (value: number): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(2)}K`;
  }
  return `${sign}$${absValue.toFixed(2)}`;
};

/**
 * Format a number as USD with appropriate precision
 * Alias for formatCurrency for semantic clarity
 */
export const formatUsd = formatCurrency; 