/**
 * Shared utilities for protocol metric formatting and coloring.
 * Used across Morpho, Euler, and other protocol views for consistent display.
 */

import { formatCurrencyCompact } from "./formatNumber";

/**
 * Format a percentage value with sign (e.g., +5.00% or -3.50%)
 * @param value - Value already in percentage scale (e.g., 5 for 5%)
 * @param digits - Number of fraction digits (default: 2)
 */
function formatSignedPercent(value: number, digits = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/**
 * Standard color classes for protocol metrics
 */
export const MetricColors = {
  SUCCESS: "text-success",
  ERROR: "text-error",
  MUTED: "text-base-content/40",
} as const;

/**
 * Get the appropriate text color class for a numeric value.
 * @param hasData - Whether there's data to display
 * @param value - The numeric value
 * @returns CSS class for text color
 */
export function getValueColorClass(hasData: boolean, value: number): string {
  if (!hasData) return MetricColors.MUTED;
  return value >= 0 ? MetricColors.SUCCESS : MetricColors.ERROR;
}

/**
 * Get the appropriate text color class for an APY value.
 * @param hasData - Whether there's data to display
 * @param apy - The APY value (can be null)
 * @returns CSS class for text color
 */
export function getApyColorClass(hasData: boolean, apy: number | null): string {
  if (!hasData || apy == null) return MetricColors.MUTED;
  return apy >= 0 ? MetricColors.SUCCESS : MetricColors.ERROR;
}

/**
 * Format a currency metric value for display.
 * @param hasData - Whether there's data to display
 * @param value - The numeric value
 * @returns Formatted string or placeholder
 */
export function formatMetricValue(hasData: boolean, value: number): string {
  return hasData ? formatCurrencyCompact(value) : "—";
}

/**
 * Format an APY value for display.
 * @param hasData - Whether there's data to display
 * @param apy - The APY value (can be null)
 * @returns Formatted percentage string or placeholder
 */
export function formatApyValue(hasData: boolean, apy: number | null): string {
  if (!hasData || apy == null) return "—";
  return formatSignedPercent(apy);
}

/**
 * Utility class for consistent protocol metric formatting.
 * Can be used as static methods or instantiated with default hasData state.
 */
export class ProtocolMetricsFormatter {
  private hasData: boolean;

  constructor(hasData: boolean) {
    this.hasData = hasData;
  }

  getValueColor(value: number): string {
    return getValueColorClass(this.hasData, value);
  }

  getApyColor(apy: number | null): string {
    return getApyColorClass(this.hasData, apy);
  }

  formatValue(value: number): string {
    return formatMetricValue(this.hasData, value);
  }

  formatApy(apy: number | null): string {
    return formatApyValue(this.hasData, apy);
  }

  // Static methods for one-off usage
  static getValueColor = getValueColorClass;
  static getApyColor = getApyColorClass;
  static formatValue = formatMetricValue;
  static formatApy = formatApyValue;
}
