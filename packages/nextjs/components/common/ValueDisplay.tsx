import { FC, useMemo } from "react";

/**
 * Format a number with thousands separators for display.
 * Shared utility to avoid duplication across components.
 *
 * @param value - The value to format (string or number)
 * @param minDecimals - Minimum fraction digits (default: 2)
 * @param maxDecimals - Maximum fraction digits (default: 6)
 * @returns Formatted string with thousands separators
 */
export const formatDisplayNumber = (
  value: string | number,
  minDecimals = 2,
  maxDecimals = 6
): string => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(num);
};

export interface ValueDisplayProps {
  /** Label to show before the value (e.g., "Debt Value", "Collateral Value") */
  label: string;
  /** USD value to display */
  value: number;
  /** Additional CSS classes */
  className?: string;
  /** CSS classes for the label text */
  labelClassName?: string;
  /** CSS classes for the value text */
  valueClassName?: string;
}

/**
 * A component that displays a labeled USD value.
 * Common pattern: "Label: $X.XX"
 */
export const ValueDisplay: FC<ValueDisplayProps> = ({
  label,
  value,
  className = "",
  labelClassName = "",
  valueClassName = "",
}) => {
  const formattedValue = useMemo(() => formatDisplayNumber(value), [value]);

  return (
    <span className={className}>
      <span className={labelClassName}>{label}: </span>
      <span className={valueClassName}>${formattedValue}</span>
    </span>
  );
};

export interface DebtDisplayProps {
  /** USD value of debt */
  value: number;
  /** Additional CSS classes */
  className?: string;
  /** CSS classes for the label text */
  labelClassName?: string;
  /** CSS classes for the value text */
  valueClassName?: string;
}

/**
 * A component that displays debt value in USD.
 * Renders: "Debt Value: $X.XX"
 */
export const DebtDisplay: FC<DebtDisplayProps> = ({
  value,
  className = "text-sm text-base-content/70",
  labelClassName = "",
  valueClassName = "",
}) => {
  return (
    <ValueDisplay
      label="Debt Value"
      value={value}
      className={className}
      labelClassName={labelClassName}
      valueClassName={valueClassName}
    />
  );
};

export interface CollateralDisplayProps {
  /** USD value of collateral */
  value: number;
  /** Additional CSS classes */
  className?: string;
  /** CSS classes for the label text */
  labelClassName?: string;
  /** CSS classes for the value text */
  valueClassName?: string;
}

/**
 * A component that displays collateral value in USD.
 * Renders: "Collateral Value: $X.XX"
 */
export const CollateralDisplay: FC<CollateralDisplayProps> = ({
  value,
  className = "text-sm text-base-content/70",
  labelClassName = "",
  valueClassName = "",
}) => {
  return (
    <ValueDisplay
      label="Collateral Value"
      value={value}
      className={className}
      labelClassName={labelClassName}
      valueClassName={valueClassName}
    />
  );
};

export interface DebtCollateralSummaryProps {
  /** USD value of debt */
  debtValue: number;
  /** USD value of collateral */
  collateralValue: number;
  /** Whether to show the collateral value (default: true) */
  showCollateral?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * A component that displays both debt and collateral values side by side.
 * Common pattern used in position modals.
 */
export const DebtCollateralSummary: FC<DebtCollateralSummaryProps> = ({
  debtValue,
  collateralValue,
  showCollateral = true,
  className = "flex justify-between text-sm text-base-content/70",
}) => {
  return (
    <div className={className}>
      <DebtDisplay value={debtValue} className="" />
      {showCollateral && <CollateralDisplay value={collateralValue} className="" />}
    </div>
  );
};
