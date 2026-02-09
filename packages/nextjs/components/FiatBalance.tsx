import { useMemo, useState, useCallback } from "react";
import type { FC } from "react";
import { formatUnits } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export interface FiatBalanceProps {
  tokenAddress: string;
  rawValue: bigint;
  price?: bigint;
  decimals?: number;
  tokenSymbol?: string;
  className?: string;
  isNegative?: boolean;
  showCurrencySymbol?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  showRawOnHover?: boolean;
  maxRawDecimals?: number;
}

/**
 * A component that displays a token balance converted to USD.
 * On hover, it shows the raw token balance.
 */
export const FiatBalance: FC<FiatBalanceProps> = ({
  tokenAddress,
  rawValue,
  price: providedPrice,
  decimals: providedDecimals,
  tokenSymbol,
  className = "",
  isNegative = false,
  showCurrencySymbol = true,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
  showRawOnHover = true,
  maxRawDecimals = 4,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  // If token is USDT, we try to fetch the price from CompoundGateway.
  const shouldUseCompoundGatewayPrice = tokenSymbol?.toUpperCase() === "USD₮0";
  const { data: compoundGatewayPrice } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getPrice",
    args: [tokenAddress],
    query: { enabled: shouldUseCompoundGatewayPrice },
  });

  // If decimals are not provided, try to fetch them from UiHelper.
  const { data: fetchedDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [[tokenAddress]],
    query: { enabled: providedDecimals === undefined },
  });

  // Determine the effective price to use.
  const effectivePrice = useMemo(() => {
    if (shouldUseCompoundGatewayPrice && compoundGatewayPrice) {
      return compoundGatewayPrice;
    }

    return providedPrice;
  }, [shouldUseCompoundGatewayPrice, compoundGatewayPrice, providedPrice]);

  // Determine the effective decimals.
  const effectiveDecimals = useMemo(() => {
    if (providedDecimals !== undefined) {
      return providedDecimals;
    }
    if (fetchedDecimals && fetchedDecimals.length > 0) {
      return Number(fetchedDecimals[0]);
    }
    return 6;
  }, [providedDecimals, fetchedDecimals]);

  // Format the raw token balance.
  const formattedRawBalance = useMemo(() => {
    if (rawValue === 0n) {
      return "0";
    }
    try {
      const formattedFull = formatUnits(isNegative ? -rawValue : rawValue, effectiveDecimals);
      const parts = formattedFull.split(".");
      let result = parts[0];
      if (parts.length > 1 && maxRawDecimals > 0) {
        const decimalPart = parts[1].slice(0, maxRawDecimals);
        if (Number(decimalPart) > 0) {
          result += "." + decimalPart;
        }
      }
      return tokenSymbol ? `${result} ${tokenSymbol}` : result;
    } catch (error) {
      console.error("Error formatting raw balance:", error);
      return String(rawValue);
    }
  }, [rawValue, effectiveDecimals, isNegative, tokenSymbol, maxRawDecimals]);

  // Calculate the USD value. Using Number conversion for the final division preserves the decimals.
  const usdValue = useMemo(() => {
    if (rawValue === 0n || !effectivePrice || effectivePrice === 0n) {
      return 0;
    }
    try {
      const numerator = Number(rawValue) * Number(effectivePrice);
      // Price is assumed to have 8 decimals, so we adjust for both token decimals and price precision.
      const divisor = 10 ** (effectiveDecimals + 8);
      return numerator / divisor;
    } catch (error) {
      console.error("Error calculating USD value:", error);
      return 0;
    }
  }, [rawValue, effectivePrice, effectiveDecimals]);

  // Format the USD value for display.
  const formattedUsd = useMemo(() => {
    const absValue = Math.abs(usdValue);
    
    // Use compact notation for large values to prevent overflow
    if (absValue >= 1_000_000) {
      const millions = absValue / 1_000_000;
      const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(millions);
      const result = showCurrencySymbol ? `$${formatted}M` : `${formatted}M`;
      return isNegative ? `-${result}` : result;
    }
    
    // For values >= $1K, use K notation to keep display compact
    if (absValue >= 1000) {
      const thousands = absValue / 1000;
      const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(thousands);
      const result = showCurrencySymbol ? `$${formatted}K` : `${formatted}K`;
      return isNegative ? `-${result}` : result;
    }
    
    const formatter = new Intl.NumberFormat("en-US", {
      style: showCurrencySymbol ? "currency" : "decimal",
      currency: "USD",
      minimumFractionDigits,
      maximumFractionDigits,
    });
    const formatted = formatter.format(absValue);
    return isNegative ? `-${formatted}` : formatted;
  }, [usdValue, isNegative, showCurrencySymbol, minimumFractionDigits, maximumFractionDigits]);

  // Determine if we should show raw balance on hover (only if balance isn't zero)
  const shouldShowRawOnHover = showRawOnHover && rawValue !== 0n;

  const displayClasses = `${className} ${isNegative ? "text-red-500" : "text-green-500"}`;

  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

  return (
    <span
      className={`${displayClasses} ${shouldShowRawOnHover ? "cursor-pointer" : ""} transition-all duration-150`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isHovering && shouldShowRawOnHover ? formattedRawBalance : formattedUsd}
    </span>
  );
};
