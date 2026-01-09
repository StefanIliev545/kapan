import { FC } from "react";
import clsx from "clsx";
import formatPercentage from "~~/utils/formatPercentage";

export type RateType = "apy" | "apr" | "net";
export type RateSize = "xs" | "sm" | "md" | "lg" | "xl";
export type RateVariant = "default" | "success" | "error" | "muted" | "auto";

export interface RateDisplayProps {
  /** The rate value as a percentage (e.g., 3.5 for 3.5%) */
  rate: number;
  /** The type of rate - determines the label (APY, APR, or Net APY) */
  type?: RateType;
  /** Custom label to override the default type-based label */
  label?: string;
  /** Show the label */
  showLabel?: boolean;
  /** Position of the label */
  labelPosition?: "before" | "after" | "above";
  /** Size variant */
  size?: RateSize;
  /** Color variant - 'auto' will use success for positive, error for negative */
  variant?: RateVariant;
  /** Show sign prefix for positive/negative values */
  showSign?: boolean;
  /** Number of decimal places */
  decimals?: number;
  /** Optional old rate to show as strikethrough (for comparison) */
  oldRate?: number;
  /** Additional CSS classes for the container */
  className?: string;
  /** Additional CSS classes for the rate value */
  rateClassName?: string;
  /** Additional CSS classes for the label */
  labelClassName?: string;
  /** Show placeholder when rate is null/undefined */
  placeholder?: string;
}

const TYPE_LABELS: Record<RateType, string> = {
  apy: "APY",
  apr: "APR",
  net: "Net APY",
};

const SIZE_CLASSES: Record<RateSize, { rate: string; label: string; oldRate: string }> = {
  xs: {
    rate: "text-[11px]",
    label: "text-[8px]",
    oldRate: "text-[10px]",
  },
  sm: {
    rate: "text-xs",
    label: "text-[10px]",
    oldRate: "text-xs",
  },
  md: {
    rate: "text-sm",
    label: "text-[10px]",
    oldRate: "text-sm",
  },
  lg: {
    rate: "text-base",
    label: "text-xs",
    oldRate: "text-base",
  },
  xl: {
    rate: "text-2xl sm:text-3xl",
    label: "text-xs",
    oldRate: "text-xl",
  },
};

const VARIANT_CLASSES: Record<Exclude<RateVariant, "auto">, string> = {
  default: "text-base-content",
  success: "text-success",
  error: "text-error",
  muted: "text-base-content/40",
};

/**
 * Formats a percentage value for display
 */
export const formatRateValue = (
  rate: number,
  decimals: number = 2,
  showSign: boolean = false
): string => {
  const formatted = formatPercentage(rate, decimals, true);
  if (showSign && rate > 0) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
};

/**
 * A unified component for displaying APY/APR rates consistently across the application.
 *
 * @example
 * // Basic APY display
 * <RateDisplay rate={3.5} type="apy" />
 *
 * @example
 * // Borrow APR with label
 * <RateDisplay rate={4.2} type="apr" showLabel labelPosition="before" />
 *
 * @example
 * // Net APY with auto coloring (green for positive, red for negative)
 * <RateDisplay rate={2.1} type="net" variant="auto" showSign />
 *
 * @example
 * // Rate comparison showing old vs new
 * <RateDisplay rate={3.2} oldRate={4.8} type="apr" label="Borrow APR" />
 */
export const RateDisplay: FC<RateDisplayProps> = ({
  rate,
  type = "apy",
  label,
  showLabel = false,
  labelPosition = "before",
  size = "md",
  variant = "default",
  showSign = false,
  decimals = 2,
  oldRate,
  className,
  rateClassName,
  labelClassName,
  placeholder = "-",
}) => {
  const sizeClasses = SIZE_CLASSES[size];
  const displayLabel = label ?? TYPE_LABELS[type];

  // Determine color variant
  let colorClass: string;
  if (variant === "auto") {
    if (rate == null) {
      colorClass = VARIANT_CLASSES.muted;
    } else if (rate >= 0) {
      colorClass = VARIANT_CLASSES.success;
    } else {
      colorClass = VARIANT_CLASSES.error;
    }
  } else {
    colorClass = VARIANT_CLASSES[variant];
  }

  const formattedRate = rate != null
    ? formatRateValue(rate, decimals, showSign)
    : placeholder;

  const formattedOldRate = oldRate != null
    ? formatRateValue(oldRate, decimals, false)
    : null;

  const labelElement = showLabel && (
    <span
      className={clsx(
        "uppercase tracking-widest text-base-content/40 font-medium",
        sizeClasses.label,
        labelClassName
      )}
    >
      {displayLabel}
    </span>
  );

  const oldRateElement = formattedOldRate && (
    <span
      className={clsx(
        "text-base-content/30 line-through font-mono tabular-nums",
        sizeClasses.oldRate
      )}
    >
      {formattedOldRate}
    </span>
  );

  const rateElement = (
    <span
      className={clsx(
        "font-mono font-semibold tabular-nums",
        sizeClasses.rate,
        colorClass,
        rateClassName
      )}
    >
      {formattedRate}
    </span>
  );

  // Render based on label position
  if (labelPosition === "above") {
    return (
      <div className={clsx("flex flex-col", className)}>
        {labelElement}
        <div className="flex items-baseline gap-2">
          {oldRateElement}
          {rateElement}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("flex items-baseline gap-1.5", className)}>
      {labelPosition === "before" && labelElement}
      {oldRateElement}
      {rateElement}
      {labelPosition === "after" && labelElement}
    </div>
  );
};

/**
 * Convenience component for displaying Supply APY
 */
export const SupplyAPY: FC<Omit<RateDisplayProps, "type">> = (props) => (
  <RateDisplay {...props} type="apy" variant={props.variant ?? "success"} />
);

/**
 * Convenience component for displaying Borrow APR
 */
export const BorrowAPR: FC<Omit<RateDisplayProps, "type">> = (props) => (
  <RateDisplay {...props} type="apr" />
);

/**
 * Convenience component for displaying Net APY with auto coloring
 */
export const NetAPY: FC<Omit<RateDisplayProps, "type" | "variant" | "showSign">> = (props) => (
  <RateDisplay {...props} type="net" variant="auto" showSign />
);

export default RateDisplay;
