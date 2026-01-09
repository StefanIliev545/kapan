import { FC, ReactNode } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@radix-ui/themes";

/**
 * Common DeFi concept tooltips - centralized definitions for consistent explanations
 * across the application.
 */
export const DEFI_TOOLTIPS = {
  // Risk & Health Metrics
  LTV: "Loan-to-Value ratio: The percentage of your collateral's value that you've borrowed. Higher LTV = higher risk of liquidation.",
  HEALTH_FACTOR: "Health Factor: A measure of your position's safety. Below 1.0 means liquidation risk. Above 1.5 is generally considered safe.",
  LIQUIDATION_THRESHOLD: "Liquidation Threshold: The maximum LTV before your position can be liquidated. Stay below this to avoid liquidation.",
  UTILIZATION: "Utilization: How much of the available liquidity is being borrowed. Higher utilization typically means higher borrow rates.",

  // Yield & Rates
  APY: "Annual Percentage Yield: The annualized return including compound interest.",
  SUPPLY_APY: "Supply APY: The annual yield you earn by supplying assets to the protocol.",
  BORROW_APY: "Borrow APY: The annual interest rate you pay when borrowing from the protocol.",
  NET_APY: "Net APY: Your effective yield after subtracting borrow costs from supply yield.",
  FIXED_APY: "Fixed APY: A guaranteed yield rate that won't change until maturity.",

  // Position Types
  COLLATERAL: "Collateral: Assets you deposit as security for borrowing. Can be liquidated if your position becomes unhealthy.",
  DEBT: "Debt: The amount you've borrowed from the protocol and must repay with interest.",
  SUPPLY: "Supply: Assets you've lent to the protocol to earn yield.",
  NET_VALUE: "Net Value: Your total position value (collateral minus debt).",

  // Protocol Features
  FLASH_LOAN: "Flash Loan: An uncollateralized loan that must be repaid within the same transaction. Enables atomic operations.",
  ISOLATED_MARKET: "Isolated Market: A separate lending pool where positions don't affect each other. Risk is contained within each market.",
  E_MODE: "Efficiency Mode: Special borrowing mode for correlated assets (e.g., stablecoins) with higher LTV limits.",

  // Actions
  REFINANCE: "Refinance: Move your position to a different protocol or pool to get better rates or terms.",
  LEVERAGE: "Leverage: Multiply your exposure by borrowing and re-supplying. Higher leverage = higher risk and potential return.",
  LOOP: "Loop: Create a leveraged position by repeatedly borrowing and supplying in a single transaction.",

  // Slippage & Execution
  SLIPPAGE: "Slippage: The maximum acceptable price difference between expected and executed price during a swap.",
  PRICE_IMPACT: "Price Impact: How much your trade affects the market price. Larger trades have higher price impact.",
  MIN_RECEIVED: "Minimum Received: The least amount you'll receive after accounting for slippage.",

  // Time-Based
  MATURITY: "Maturity: The date when a fixed-rate position expires and can be redeemed at full value.",
  YIELD_30D: "30-Day Yield: Estimated earnings over the next 30 days based on current rates.",
} as const;

export type DefiTooltipKey = keyof typeof DEFI_TOOLTIPS;

interface InfoTooltipProps {
  /** The tooltip content - can be a predefined key or custom text */
  content: DefiTooltipKey | string;
  /** Icon size in CSS units (default: "w-4 h-4") */
  iconClassName?: string;
  /** Additional className for the wrapper */
  className?: string;
  /** Delay before showing tooltip in ms (default: 100) */
  delayDuration?: number;
  /** Side to show tooltip (default: "top") */
  side?: "top" | "right" | "bottom" | "left";
  /** Custom icon to use instead of InformationCircleIcon */
  icon?: ReactNode;
  /** Whether to render children inline with the icon */
  children?: ReactNode;
}

/**
 * InfoTooltip - A reusable tooltip component for explaining DeFi concepts.
 *
 * Usage:
 * ```tsx
 * // Using predefined DeFi concept
 * <InfoTooltip content="LTV" />
 *
 * // Using custom text
 * <InfoTooltip content="Custom explanation here" />
 *
 * // With children (label + icon)
 * <InfoTooltip content="APY">
 *   <span>5.25%</span>
 * </InfoTooltip>
 * ```
 */
export const InfoTooltip: FC<InfoTooltipProps> = ({
  content,
  iconClassName = "w-4 h-4",
  className = "",
  delayDuration = 100,
  side = "top",
  icon,
  children,
}) => {
  // Check if content is a predefined key or custom text
  const tooltipContent = content in DEFI_TOOLTIPS
    ? DEFI_TOOLTIPS[content as DefiTooltipKey]
    : content;

  const iconElement = icon || (
    <InformationCircleIcon
      className={`${iconClassName} text-base-content/50 hover:text-base-content/80 transition-colors`}
      aria-hidden="true"
    />
  );

  return (
    <Tooltip content={tooltipContent} delayDuration={delayDuration} side={side}>
      <span className={`inline-flex items-center gap-1 cursor-help ${className}`}>
        {children}
        {iconElement}
      </span>
    </Tooltip>
  );
};

/**
 * LabelWithTooltip - A label component with an info icon tooltip.
 * Useful for form labels and stat headers.
 *
 * Usage:
 * ```tsx
 * <LabelWithTooltip label="LTV" tooltip="LTV" />
 * <LabelWithTooltip label="Health Factor" tooltip="HEALTH_FACTOR" />
 * ```
 */
interface LabelWithTooltipProps {
  /** The visible label text */
  label: string;
  /** The tooltip content - can be a predefined key or custom text */
  tooltip: DefiTooltipKey | string;
  /** Label text className */
  labelClassName?: string;
  /** Icon className */
  iconClassName?: string;
  /** Wrapper className */
  className?: string;
}

export const LabelWithTooltip: FC<LabelWithTooltipProps> = ({
  label,
  tooltip,
  labelClassName = "text-sm text-base-content/70",
  iconClassName = "w-3.5 h-3.5",
  className = "",
}) => {
  const tooltipContent = tooltip in DEFI_TOOLTIPS
    ? DEFI_TOOLTIPS[tooltip as DefiTooltipKey]
    : tooltip;

  return (
    <Tooltip content={tooltipContent} delayDuration={100}>
      <span className={`inline-flex items-center gap-1 cursor-help ${className}`}>
        <span className={labelClassName}>{label}</span>
        <InformationCircleIcon
          className={`${iconClassName} text-base-content/40 hover:text-base-content/60 transition-colors`}
          aria-hidden="true"
        />
      </span>
    </Tooltip>
  );
};

/**
 * StatWithTooltip - A stat display with value and tooltip explanation.
 * Useful for displaying DeFi metrics with explanations.
 *
 * Usage:
 * ```tsx
 * <StatWithTooltip
 *   label="LTV"
 *   value="75.5%"
 *   tooltip="LTV"
 *   valueClassName="text-warning"
 * />
 * ```
 */
interface StatWithTooltipProps {
  /** The stat label */
  label: string;
  /** The stat value */
  value: string | ReactNode;
  /** The tooltip content - can be a predefined key or custom text */
  tooltip: DefiTooltipKey | string;
  /** Label className */
  labelClassName?: string;
  /** Value className */
  valueClassName?: string;
  /** Icon className */
  iconClassName?: string;
  /** Wrapper className */
  className?: string;
  /** Layout direction */
  direction?: "row" | "column";
}

export const StatWithTooltip: FC<StatWithTooltipProps> = ({
  label,
  value,
  tooltip,
  labelClassName = "text-xs text-base-content/60 uppercase tracking-wider",
  valueClassName = "text-sm font-mono font-semibold",
  iconClassName = "w-3 h-3",
  className = "",
  direction = "column",
}) => {
  const tooltipContent = tooltip in DEFI_TOOLTIPS
    ? DEFI_TOOLTIPS[tooltip as DefiTooltipKey]
    : tooltip;

  const isColumn = direction === "column";

  return (
    <Tooltip content={tooltipContent} delayDuration={100}>
      <div className={`cursor-help ${isColumn ? "flex flex-col gap-0.5" : "flex items-center gap-2"} ${className}`}>
        <span className={`inline-flex items-center gap-1 ${labelClassName}`}>
          {label}
          <InformationCircleIcon
            className={`${iconClassName} text-base-content/40`}
            aria-hidden="true"
          />
        </span>
        <span className={valueClassName}>{value}</span>
      </div>
    </Tooltip>
  );
};

export default InfoTooltip;
