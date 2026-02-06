import type { FC, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import Image from "next/image";
import clsx from "clsx";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

/**
 * Token size variants for consistent sizing across the app
 */
export type TokenSize = "xs" | "sm" | "md" | "lg" | "xl";

const TOKEN_SIZE_MAP: Record<TokenSize, { icon: number; text: string; containerClass: string }> = {
  xs: { icon: 12, text: "text-[10px]", containerClass: "w-3 h-3" },
  sm: { icon: 16, text: "text-xs", containerClass: "w-4 h-4" },
  md: { icon: 24, text: "text-sm", containerClass: "w-6 h-6" },
  lg: { icon: 32, text: "text-base", containerClass: "w-8 h-8" },
  xl: { icon: 40, text: "text-lg", containerClass: "w-10 h-10" },
};

/**
 * Props for TokenIcon - displays just the token icon
 */
export interface TokenIconProps {
  /** Token icon URL or symbol to resolve to icon */
  icon?: string;
  /** Token symbol for fallback icon resolution */
  symbol?: string;
  /** Alt text for the image */
  alt?: string;
  /** Size variant */
  size?: TokenSize;
  /** Custom size in pixels (overrides size variant) */
  customSize?: number;
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to show rounded corners */
  rounded?: boolean | "full" | "lg" | "xl";
  /** Whether to show a container/background styling */
  showContainer?: boolean;
  /** Fallback icon URL if main icon fails */
  fallbackIcon?: string;
}

/**
 * TokenIcon - A standardized component for displaying token icons
 *
 * Usage:
 * ```tsx
 * <TokenIcon icon="/logos/eth.svg" size="md" />
 * <TokenIcon symbol="USDC" size="lg" rounded="full" />
 * <TokenIcon icon={token.icon} customSize={28} showContainer />
 * ```
 */
export const TokenIcon: FC<TokenIconProps> = ({
  icon,
  symbol,
  alt,
  size = "md",
  customSize,
  className,
  rounded = "full",
  showContainer = false,
  fallbackIcon = "/logos/x-logo.svg",
}) => {
  // Resolve icon: use provided icon, or resolve from symbol
  const resolvedIcon = icon || (symbol ? tokenNameToLogo(symbol) : fallbackIcon);
  const altText = alt || symbol || "token";

  const sizeConfig = TOKEN_SIZE_MAP[size];

  const roundedClassMap: Record<string, string> = {
    full: "rounded-full",
    lg: "rounded-lg",
    xl: "rounded-xl",
  };
  const roundedClass = rounded === true
    ? "rounded-full"
    : (typeof rounded === "string" && roundedClassMap[rounded]) || "";

  const containerStyle = useMemo(
    () => customSize ? { width: customSize, height: customSize } : undefined,
    [customSize]
  );

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = fallbackIcon;
  }, [fallbackIcon]);

  if (showContainer) {
    return (
      <div
        className={clsx(
          "from-base-200 to-base-300/50 ring-base-300/50 relative flex-shrink-0 rounded-xl bg-gradient-to-br p-1 ring-1",
          !customSize && sizeConfig.containerClass,
          className
        )}
        style={containerStyle}
      >
        <Image
          src={resolvedIcon}
          alt={altText}
          fill
          className={clsx("object-contain", roundedClass)}
          onError={handleImageError}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "relative flex-shrink-0",
        !customSize && sizeConfig.containerClass,
        className
      )}
      style={containerStyle}
    >
      <Image
        src={resolvedIcon}
        alt={altText}
        fill
        className={clsx("object-contain", roundedClass)}
        onError={handleImageError}
      />
    </div>
  );
};

/**
 * Props for TokenLabel - displays icon + symbol/name
 */
export interface TokenLabelProps extends Omit<TokenIconProps, "alt"> {
  /** Token name to display (falls back to symbol) */
  name?: string;
  /** Whether to show the symbol (default: true if symbol provided) */
  showSymbol?: boolean;
  /** Text color class */
  textColorClass?: string;
  /** Additional content to render after the name */
  suffix?: ReactNode;
}

/**
 * TokenLabel - Displays token icon with its name/symbol
 *
 * Usage:
 * ```tsx
 * <TokenLabel icon="/logos/eth.svg" symbol="ETH" />
 * <TokenLabel symbol="USDC" name="USD Coin" size="lg" />
 * ```
 */
export const TokenLabel: FC<TokenLabelProps> = ({
  icon,
  symbol,
  name,
  size = "md",
  customSize,
  className,
  rounded = "full",
  showContainer = false,
  fallbackIcon,
  showSymbol = true,
  textColorClass = "text-base-content",
  suffix,
}) => {
  const sizeConfig = TOKEN_SIZE_MAP[size];
  const displayText = name || symbol || "Unknown";

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <TokenIcon
        icon={icon}
        symbol={symbol}
        alt={displayText}
        size={size}
        customSize={customSize}
        rounded={rounded}
        showContainer={showContainer}
        fallbackIcon={fallbackIcon}
      />
      {showSymbol && (
        <span className={clsx("font-medium", sizeConfig.text, textColorClass)}>
          {displayText}
        </span>
      )}
      {suffix}
    </div>
  );
};

/**
 * Props for TokenBalance - displays formatted balance
 */
export interface TokenBalanceProps {
  /** Raw balance value (bigint or number string) */
  balance: bigint | string | number;
  /** Token decimals for formatting */
  decimals?: number;
  /** Token symbol to append */
  symbol?: string;
  /** Maximum fraction digits to display */
  maxDecimals?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether this is a negative value (e.g., debt) */
  isNegative?: boolean;
}

/**
 * TokenBalance - Formats and displays a token balance
 *
 * Usage:
 * ```tsx
 * <TokenBalance balance={1000000000000000000n} decimals={18} symbol="ETH" />
 * <TokenBalance balance="5000000" decimals={6} maxDecimals={2} />
 * ```
 */
export const TokenBalance: FC<TokenBalanceProps> = ({
  balance,
  decimals = 18,
  symbol,
  maxDecimals = 6,
  className,
  isNegative = false,
}) => {
  const balanceBigInt = typeof balance === "bigint"
    ? balance
    : BigInt(balance || 0);

  const formatted = formatUnits(balanceBigInt, decimals);
  const numValue = Number.parseFloat(formatted);

  const displayValue = numValue.toLocaleString("en-US", {
    maximumFractionDigits: maxDecimals,
  });

  return (
    <span className={clsx("font-mono tabular-nums", className)}>
      {isNegative && numValue > 0 ? "-" : ""}
      {displayValue}
      {symbol && <span className="ml-1">{symbol}</span>}
    </span>
  );
};

/**
 * Props for TokenDisplay - full token display with icon, name, and optional balance
 */
export interface TokenDisplayProps extends Omit<TokenLabelProps, "suffix"> {
  /** Raw balance value */
  balance?: bigint | string | number;
  /** Token decimals for balance formatting */
  decimals?: number;
  /** Maximum fraction digits for balance */
  maxBalanceDecimals?: number;
  /** Whether to show balance */
  showBalance?: boolean;
  /** Whether balance is negative (e.g., debt) */
  isNegativeBalance?: boolean;
  /** Balance text color class */
  balanceColorClass?: string;
  /** Layout direction */
  direction?: "row" | "column";
  /** Additional content to render */
  children?: ReactNode;
}

/**
 * TokenDisplay - Full token display component combining icon, name, and balance
 *
 * Usage:
 * ```tsx
 * <TokenDisplay icon="/logos/eth.svg" symbol="ETH" balance={1000000000000000000n} decimals={18} />
 * <TokenDisplay symbol="USDC" showBalance={false} size="lg" />
 * <TokenDisplay
 *   icon={token.icon}
 *   name={token.name}
 *   balance={token.balance}
 *   decimals={token.decimals}
 *   direction="column"
 * />
 * ```
 */
export const TokenDisplay: FC<TokenDisplayProps> = ({
  icon,
  symbol,
  name,
  size = "md",
  customSize,
  className,
  rounded = "full",
  showContainer = false,
  fallbackIcon,
  showSymbol = true,
  textColorClass = "text-base-content",
  balance,
  decimals = 18,
  maxBalanceDecimals = 6,
  showBalance = false,
  isNegativeBalance = false,
  balanceColorClass,
  direction = "row",
  children,
}) => {
  const sizeConfig = TOKEN_SIZE_MAP[size];
  const effectiveBalanceColorClass = balanceColorClass || (isNegativeBalance ? "text-error" : "text-success");

  if (direction === "column") {
    return (
      <div className={clsx("flex flex-col items-center", className)}>
        <TokenIcon
          icon={icon}
          symbol={symbol}
          alt={name || symbol}
          size={size}
          customSize={customSize}
          rounded={rounded}
          showContainer={showContainer}
          fallbackIcon={fallbackIcon}
        />
        {showSymbol && (
          <span className={clsx("mt-1 font-medium", sizeConfig.text, textColorClass)}>
            {name || symbol || "Unknown"}
          </span>
        )}
        {showBalance && balance !== undefined && (
          <TokenBalance
            balance={balance}
            decimals={decimals}
            maxDecimals={maxBalanceDecimals}
            className={clsx(sizeConfig.text, effectiveBalanceColorClass)}
            isNegative={isNegativeBalance}
          />
        )}
        {children}
      </div>
    );
  }

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <TokenIcon
        icon={icon}
        symbol={symbol}
        alt={name || symbol}
        size={size}
        customSize={customSize}
        rounded={rounded}
        showContainer={showContainer}
        fallbackIcon={fallbackIcon}
      />
      <div className="flex min-w-0 flex-col">
        {showSymbol && (
          <span className={clsx("truncate font-medium", sizeConfig.text, textColorClass)}>
            {name || symbol || "Unknown"}
          </span>
        )}
        {showBalance && balance !== undefined && (
          <TokenBalance
            balance={balance}
            decimals={decimals}
            maxDecimals={maxBalanceDecimals}
            className={clsx("text-xs", effectiveBalanceColorClass)}
            isNegative={isNegativeBalance}
          />
        )}
      </div>
      {children}
    </div>
  );
};

/**
 * Props for TokenPill - compact token display for inline use
 */
export interface TokenPillProps {
  /** Token icon URL */
  icon?: string;
  /** Token symbol */
  symbol?: string;
  /** Token name (alternative to symbol, for alt text) */
  name?: string;
  /** Formatted value to display */
  value?: string | number;
  /** Size variant */
  size?: "xs" | "sm" | "md";
  /** Additional CSS classes */
  className?: string;
}

/**
 * TokenPill - Compact inline token display
 *
 * Usage:
 * ```tsx
 * <TokenPill icon="/logos/eth.svg" symbol="ETH" value="1.5" />
 * <TokenPill symbol="USDC" value={formattedBalance} size="sm" />
 * ```
 */
export const TokenPill: FC<TokenPillProps> = ({
  icon,
  symbol,
  name,
  value,
  size = "sm",
  className,
}) => {
  const sizeMap = {
    xs: { icon: 10, text: "text-[10px]" },
    sm: { icon: 12, text: "text-xs" },
    md: { icon: 16, text: "text-sm" },
  };

  const sizeConfig = sizeMap[size];
  const displayName = symbol || name;
  const resolvedIcon = icon || (displayName ? tokenNameToLogo(displayName) : "/logos/x-logo.svg");

  const iconStyle = useMemo(() => ({ width: sizeConfig.icon, height: sizeConfig.icon }), [sizeConfig.icon]);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = "/logos/x-logo.svg";
  }, []);

  return (
    <div className={clsx("flex items-center gap-1", sizeConfig.text, className)}>
      <div className="relative flex-shrink-0" style={iconStyle}>
        <Image
          src={resolvedIcon}
          alt={displayName || "token"}
          fill
          className="rounded-full object-contain"
          onError={handleImageError}
        />
      </div>
      {value !== undefined && (
        <span className="text-base-content/80 font-mono tabular-nums">
          {typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value}
        </span>
      )}
    </div>
  );
};

/**
 * Props for TokenPair - displays two tokens (e.g., for swaps)
 */
export interface TokenPairProps {
  /** From token icon */
  fromIcon?: string;
  /** From token symbol */
  fromSymbol?: string;
  /** To token icon */
  toIcon?: string;
  /** To token symbol */
  toSymbol?: string;
  /** Size variant */
  size?: TokenSize;
  /** Separator element */
  separator?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * TokenPair - Displays two tokens for swap/trade scenarios
 *
 * Usage:
 * ```tsx
 * <TokenPair fromSymbol="ETH" toSymbol="USDC" />
 * <TokenPair
 *   fromIcon="/logos/eth.svg"
 *   toIcon="/logos/usdc.svg"
 *   separator={<ArrowRightIcon className="w-4 h-4" />}
 * />
 * ```
 */
export const TokenPair: FC<TokenPairProps> = ({
  fromIcon,
  fromSymbol,
  toIcon,
  toSymbol,
  size = "sm",
  separator,
  className,
}) => (
  <div className={clsx("flex items-center gap-2", className)}>
    <TokenIcon icon={fromIcon} symbol={fromSymbol} size={size} />
    {separator || <span className="text-base-content/40">→</span>}
    <TokenIcon icon={toIcon} symbol={toSymbol} size={size} />
  </div>
);

// Default export for convenient import
export default TokenDisplay;
