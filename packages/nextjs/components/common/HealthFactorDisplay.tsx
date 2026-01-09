import { FC, useMemo } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * Health Factor thresholds for DeFi positions.
 * - Critical: < 1.1 (high liquidation risk)
 * - Warning: < 1.3 (moderate risk)
 * - Safe: >= 1.3 (healthy position)
 */
export const HEALTH_FACTOR_THRESHOLDS = {
  CRITICAL: 1.1,
  WARNING: 1.3,
} as const;

export type HealthFactorStatus = "critical" | "warning" | "safe" | "infinite";

/**
 * Get the status of a health factor value.
 */
export function getHealthFactorStatus(value: number | null | undefined): HealthFactorStatus {
  if (value === null || value === undefined || !Number.isFinite(value) || value >= 999) {
    return "infinite";
  }
  if (value < HEALTH_FACTOR_THRESHOLDS.CRITICAL) {
    return "critical";
  }
  if (value < HEALTH_FACTOR_THRESHOLDS.WARNING) {
    return "warning";
  }
  return "safe";
}

/**
 * Get the color class for a health factor status.
 */
export function getHealthFactorColorClass(status: HealthFactorStatus): string {
  switch (status) {
    case "critical":
      return "text-error";
    case "warning":
      return "text-warning";
    case "safe":
      return "text-success";
    case "infinite":
    default:
      return "text-base-content";
  }
}

/**
 * Get the badge color class for a health factor status (for badges/pills).
 */
export function getHealthFactorBadgeClass(status: HealthFactorStatus): string {
  switch (status) {
    case "critical":
      return "badge-error";
    case "warning":
      return "badge-warning";
    case "safe":
      return "badge-success";
    case "infinite":
    default:
      return "badge-ghost";
  }
}

/**
 * Format a health factor value for display.
 * @param value - The health factor value (can be null, undefined, or Infinity)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.45" or "∞")
 */
export function formatHealthFactor(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value >= 999) {
    return "∞";
  }
  return value.toFixed(decimals);
}

export interface HealthFactorDisplayProps {
  /** The health factor value (can be null, undefined, Infinity, or a number) */
  value: number | null | undefined;
  /** Number of decimal places to display (default: 2) */
  decimals?: number;
  /** Show a warning icon when in critical or warning status */
  showWarningIcon?: boolean;
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg";
  /** Show as a badge/pill instead of plain text */
  asBadge?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show label "HF" or "Health Factor" */
  showLabel?: boolean;
  /** Label variant */
  labelVariant?: "short" | "full";
  /** Show before/after comparison (for action previews) */
  beforeValue?: number | null;
  /** Custom color class override (disables automatic coloring) */
  colorClassOverride?: string;
}

/**
 * A standardized component for displaying health factor values across the application.
 *
 * Health Factor is a key DeFi metric that indicates how safe a position is from liquidation.
 * - Values < 1.0 mean the position is liquidatable
 * - Values between 1.0-1.1 are critical (high liquidation risk)
 * - Values between 1.1-1.3 are warning (moderate risk)
 * - Values >= 1.3 are considered safe
 * - Infinity (or very high values) means no debt (infinite health)
 *
 * @example
 * // Basic usage
 * <HealthFactorDisplay value={1.45} />
 *
 * @example
 * // With label and badge style
 * <HealthFactorDisplay value={1.2} showLabel asBadge />
 *
 * @example
 * // Before/after comparison for action preview
 * <HealthFactorDisplay value={1.8} beforeValue={1.5} />
 *
 * @example
 * // With warning icon for critical values
 * <HealthFactorDisplay value={1.05} showWarningIcon />
 */
export const HealthFactorDisplay: FC<HealthFactorDisplayProps> = ({
  value,
  decimals = 2,
  showWarningIcon = false,
  size = "md",
  asBadge = false,
  className = "",
  showLabel = false,
  labelVariant = "short",
  beforeValue,
  colorClassOverride,
}) => {
  const status = useMemo(() => getHealthFactorStatus(value), [value]);
  const beforeStatus = useMemo(() => beforeValue !== undefined ? getHealthFactorStatus(beforeValue) : null, [beforeValue]);

  const colorClass = colorClassOverride || getHealthFactorColorClass(status);
  const beforeColorClass = beforeStatus ? getHealthFactorColorClass(beforeStatus) : "";
  const badgeClass = getHealthFactorBadgeClass(status);

  const formattedValue = formatHealthFactor(value, decimals);
  const formattedBeforeValue = beforeValue !== undefined ? formatHealthFactor(beforeValue, decimals) : null;

  const sizeClasses = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const iconSizeClasses = {
    xs: "w-3 h-3",
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const label = labelVariant === "full" ? "Health Factor" : "HF";

  const showIcon = showWarningIcon && (status === "critical" || status === "warning");

  // Before/after comparison view
  if (beforeValue !== undefined && formattedBeforeValue !== null) {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} ${className}`}>
        {showLabel && <span className="text-base-content/60 mr-1">{label}:</span>}
        <span className={beforeColorClass}>{formattedBeforeValue}</span>
        <span className="text-base-content/40 mx-0.5">→</span>
        <span className={`font-medium ${colorClass}`}>{formattedValue}</span>
        {showIcon && (
          <ExclamationTriangleIcon className={`${iconSizeClasses[size]} ${colorClass}`} />
        )}
      </span>
    );
  }

  // Badge variant
  if (asBadge) {
    return (
      <span className={`badge ${badgeClass} ${sizeClasses[size]} gap-1 ${className}`}>
        {showLabel && <span>{label}:</span>}
        {showIcon && (
          <ExclamationTriangleIcon className={iconSizeClasses[size]} />
        )}
        <span className="font-medium">{formattedValue}</span>
      </span>
    );
  }

  // Standard text display
  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} ${className}`}>
      {showLabel && <span className="text-base-content/60">{label}:</span>}
      {showIcon && (
        <ExclamationTriangleIcon className={`${iconSizeClasses[size]} ${colorClass}`} />
      )}
      <span className={`font-medium ${colorClass}`}>{formattedValue}</span>
    </span>
  );
};

/**
 * Hook to get health factor display properties.
 * Useful when you need the color/status but want to render custom UI.
 */
export function useHealthFactorDisplay(value: number | null | undefined, decimals = 2) {
  const status = useMemo(() => getHealthFactorStatus(value), [value]);
  const colorClass = useMemo(() => getHealthFactorColorClass(status), [status]);
  const badgeClass = useMemo(() => getHealthFactorBadgeClass(status), [status]);
  const formatted = useMemo(() => formatHealthFactor(value, decimals), [value, decimals]);

  return {
    status,
    colorClass,
    badgeClass,
    formatted,
    isInfinite: status === "infinite",
    isCritical: status === "critical",
    isWarning: status === "warning",
    isSafe: status === "safe",
    needsAttention: status === "critical" || status === "warning",
  };
}

export default HealthFactorDisplay;
