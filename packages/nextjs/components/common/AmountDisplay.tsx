import { FC, useMemo } from "react";
import { formatUnits } from "viem";

/**
 * Formatting options for token amounts
 */
export interface TokenAmountFormatOptions {
  /** Number of decimal places to show (defaults based on value size) */
  maxDecimals?: number;
  /** Whether to show trailing zeros (default: false) */
  showTrailingZeros?: boolean;
  /** Minimum decimals to always show (default: 0) */
  minDecimals?: number;
}

/**
 * Format a raw token amount (bigint) to a human-readable string.
 * Automatically adjusts decimal precision based on value size.
 *
 * @param rawAmount - The raw token amount as bigint
 * @param decimals - Token decimals (e.g., 18 for ETH, 6 for USDC)
 * @param options - Formatting options
 */
export function formatTokenAmount(
  rawAmount: bigint,
  decimals: number,
  options: TokenAmountFormatOptions = {}
): string {
  if (rawAmount === 0n) return "0";

  const { maxDecimals, showTrailingZeros = false, minDecimals = 0 } = options;

  const formatted = formatUnits(rawAmount, decimals);
  const num = parseFloat(formatted);
  const absNum = Math.abs(num);

  // Determine max decimals based on value size if not specified
  let effectiveMaxDecimals: number;
  if (maxDecimals !== undefined) {
    effectiveMaxDecimals = maxDecimals;
  } else if (absNum >= 1000) {
    effectiveMaxDecimals = 2;
  } else if (absNum >= 1) {
    effectiveMaxDecimals = 4;
  } else if (absNum >= 0.0001) {
    effectiveMaxDecimals = 6;
  } else {
    effectiveMaxDecimals = 8;
  }

  const result = num.toLocaleString("en-US", {
    minimumFractionDigits: showTrailingZeros ? minDecimals : 0,
    maximumFractionDigits: effectiveMaxDecimals,
  });

  return result;
}

/**
 * Format a number as USD currency
 *
 * @param value - The USD value to format
 * @param compact - Use compact notation (K, M, B) for large values
 */
export function formatUsdValue(value: number, compact = false): string {
  if (value == null || !isFinite(value)) return "-";

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (compact) {
    if (absValue >= 1_000_000_000) {
      return `${sign}$${(absValue / 1_000_000_000).toFixed(2)}B`;
    }
    if (absValue >= 1_000_000) {
      return `${sign}$${(absValue / 1_000_000).toFixed(2)}M`;
    }
    if (absValue >= 1_000) {
      return `${sign}$${(absValue / 1_000).toFixed(2)}K`;
    }
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface AmountDisplayProps {
  /** Raw token amount as bigint */
  rawAmount: bigint;
  /** Token decimals */
  decimals: number;
  /** Optional token symbol to display after the amount */
  symbol?: string;
  /** CSS class for styling */
  className?: string;
  /** Formatting options */
  formatOptions?: TokenAmountFormatOptions;
}

/**
 * A component that displays a formatted token amount.
 * Automatically adjusts precision based on value size.
 */
export const AmountDisplay: FC<AmountDisplayProps> = ({
  rawAmount,
  decimals,
  symbol,
  className = "",
  formatOptions,
}) => {
  const formatted = useMemo(
    () => formatTokenAmount(rawAmount, decimals, formatOptions),
    [rawAmount, decimals, formatOptions]
  );

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {formatted}
      {symbol && <span className="ml-1">{symbol}</span>}
    </span>
  );
};

export interface UsdDisplayProps {
  /** USD value to display */
  value: number;
  /** Use compact notation (K, M, B) */
  compact?: boolean;
  /** Show +/- prefix */
  showSign?: boolean;
  /** CSS class for styling */
  className?: string;
  /** Color class for positive values (default: text-success) */
  positiveClass?: string;
  /** Color class for negative values (default: text-error) */
  negativeClass?: string;
  /** Apply color based on sign */
  colorBySign?: boolean;
}

/**
 * A component that displays a formatted USD value.
 * Supports compact notation and sign-based coloring.
 */
export const UsdDisplay: FC<UsdDisplayProps> = ({
  value,
  compact = false,
  showSign = false,
  className = "",
  positiveClass = "text-success",
  negativeClass = "text-error",
  colorBySign = false,
}) => {
  const formatted = useMemo(() => formatUsdValue(value, compact), [value, compact]);

  const displayValue = useMemo(() => {
    if (showSign && value > 0) {
      return `+${formatted}`;
    }
    return formatted;
  }, [formatted, showSign, value]);

  const colorClass = colorBySign
    ? value >= 0
      ? positiveClass
      : negativeClass
    : "";

  return (
    <span className={`font-mono tabular-nums ${colorClass} ${className}`}>
      {displayValue}
    </span>
  );
};

export interface BalanceLabelProps {
  /** Label text (default: "Balance") */
  label?: string;
  /** Raw token amount as bigint */
  rawAmount: bigint;
  /** Token decimals */
  decimals: number;
  /** Optional token symbol */
  symbol?: string;
  /** CSS class for the container */
  className?: string;
  /** CSS class for the label */
  labelClassName?: string;
  /** CSS class for the value */
  valueClassName?: string;
}

/**
 * A component that displays "Balance: {amount}" with consistent styling.
 * Common pattern used throughout modals and position views.
 */
export const BalanceLabel: FC<BalanceLabelProps> = ({
  label = "Balance",
  rawAmount,
  decimals,
  symbol,
  className = "",
  labelClassName = "text-base-content/70",
  valueClassName = "",
}) => {
  const formatted = useMemo(
    () => formatTokenAmount(rawAmount, decimals),
    [rawAmount, decimals]
  );

  return (
    <span className={className}>
      <span className={labelClassName}>{label}: </span>
      <span className={`font-mono tabular-nums ${valueClassName}`}>
        {formatted}
        {symbol && ` ${symbol}`}
      </span>
    </span>
  );
};

export interface TokenBalanceWithUsdProps {
  /** Raw token amount as bigint */
  rawAmount: bigint;
  /** Token decimals */
  decimals: number;
  /** USD price per token (as bigint with 8 decimals, matching oracle format) */
  price?: bigint;
  /** Optional token symbol */
  symbol?: string;
  /** Show primary display as USD (with token on secondary) or token (with USD on secondary) */
  primaryDisplay?: "usd" | "token";
  /** CSS class for the container */
  className?: string;
  /** Use compact notation for USD */
  compactUsd?: boolean;
}

/**
 * A component that displays both token amount and its USD value.
 * Can show either as primary with the other as secondary.
 */
export const TokenBalanceWithUsd: FC<TokenBalanceWithUsdProps> = ({
  rawAmount,
  decimals,
  price,
  symbol,
  primaryDisplay = "usd",
  className = "",
  compactUsd = false,
}) => {
  const tokenFormatted = useMemo(
    () => formatTokenAmount(rawAmount, decimals),
    [rawAmount, decimals]
  );

  const usdValue = useMemo(() => {
    if (!price || price === 0n) return 0;
    // Price is in 8 decimals (like Chainlink oracles)
    const tokenAmount = Number(rawAmount) / 10 ** decimals;
    const priceUsd = Number(price) / 1e8;
    return tokenAmount * priceUsd;
  }, [rawAmount, decimals, price]);

  const usdFormatted = useMemo(
    () => formatUsdValue(usdValue, compactUsd),
    [usdValue, compactUsd]
  );

  if (primaryDisplay === "usd") {
    return (
      <div className={`flex flex-col ${className}`}>
        <span className="font-mono font-semibold tabular-nums">{usdFormatted}</span>
        <span className="text-base-content/60 font-mono text-xs">
          {tokenFormatted} {symbol}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <span className="font-mono font-semibold tabular-nums">
        {tokenFormatted} {symbol}
      </span>
      <span className="text-base-content/60 font-mono text-xs">{usdFormatted}</span>
    </div>
  );
};
