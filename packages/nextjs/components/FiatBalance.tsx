import React, { FC, useMemo, useState } from "react";
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
    contractName: "CompoundGateway",
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
    if (providedDecimals !== undefined) return providedDecimals;
    if (fetchedDecimals && fetchedDecimals.length > 0) {
      return Number(fetchedDecimals[0]);
    }
    return 6;
  }, [providedDecimals, fetchedDecimals]);

  // Format the raw token balance.
  const formattedRawBalance = useMemo(() => {
    if (rawValue === 0n) return "0";
    try {
      const formattedFull = formatUnits(isNegative ? -rawValue : rawValue, effectiveDecimals);
      const parts = formattedFull.split(".");
      let result = parts[0];
      if (parts.length > 1 && maxRawDecimals > 0) {
        const decimalPart = parts[1].substring(0, maxRawDecimals);
        if (Number(decimalPart) > 0) {
          result += "." + decimalPart;
        }
      }
      return tokenSymbol ? `${result} ${tokenSymbol}` : result;
    } catch (e) {
      console.error("Error formatting raw balance:", e);
      return String(rawValue);
    }
  }, [rawValue, effectiveDecimals, isNegative, tokenSymbol, maxRawDecimals]);

  // Calculate the USD value. Using Number conversion for the final division preserves the decimals.
  const usdValue = useMemo(() => {
    if (rawValue === 0n || !effectivePrice || effectivePrice === 0n) return 0;
    try {
      const numerator = Number(rawValue) * Number(effectivePrice);
      // Price is assumed to have 8 decimals, so we adjust for both token decimals and price precision.
      const divisor = 10 ** (effectiveDecimals + 8);
      return numerator / divisor;
    } catch (e) {
      console.error("Error calculating USD value:", e);
      return 0;
    }
  }, [rawValue, effectivePrice, effectiveDecimals]);

  // Format the USD value for display.
  const formattedUsd = useMemo(() => {
    const absValue = Math.abs(usdValue);
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

  return (
    <span
      className={`${displayClasses} ${shouldShowRawOnHover ? "cursor-pointer" : ""} transition-all duration-150`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {isHovering && shouldShowRawOnHover ? formattedRawBalance : formattedUsd}
    </span>
  );
};
