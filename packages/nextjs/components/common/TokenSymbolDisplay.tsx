"use client";

import * as React from "react";
import { Tooltip } from "@radix-ui/themes";
import { parsePTToken, type ParsedPTToken } from "~~/hooks/usePendlePTYields";

interface TokenSymbolDisplayProps {
  /** The token symbol to display */
  symbol: string;
  /** Optional className for the container */
  className?: string;
  /** Show the full original symbol on hover (default: true for PT tokens) */
  showTooltip?: boolean;
  /** Size variant */
  size?: "xs" | "sm" | "base";
  /** Layout variant for PT tokens */
  variant?: "inline" | "stacked";
}

// Size classes for different variants
const SIZE_CLASSES = {
  xs: {
    main: "text-xs",
    maturity: "text-[9px]",
    badge: "text-[8px] px-1 py-0.5",
  },
  sm: {
    main: "text-sm",
    maturity: "text-[10px]",
    badge: "text-[9px] px-1.5 py-0.5",
  },
  base: {
    main: "text-base",
    maturity: "text-xs",
    badge: "text-[10px] px-1.5 py-0.5",
  },
};

/**
 * Displays a token symbol with special handling for PT (Pendle) tokens.
 *
 * For PT tokens like "PT-sUSDai-20NOV2025", displays:
 * - Short name: "PT-sUSDai"
 * - Maturity date in smaller text: "Nov 20, 2025"
 *
 * For regular tokens, displays the symbol as-is.
 */
export function TokenSymbolDisplay({
  symbol,
  className = "",
  showTooltip = true,
  size = "sm",
  variant = "inline",
}: TokenSymbolDisplayProps) {
  const parsed = React.useMemo(() => parsePTToken(symbol), [symbol]);
  const sizeClasses = SIZE_CLASSES[size];

  // Regular token - just display the symbol
  if (!parsed.isPT) {
    return <span className={`font-medium ${sizeClasses.main} ${className}`}>{symbol}</span>;
  }

  // PT token - show short name with maturity
  const ptParsed = parsed as ParsedPTToken;

  // Check if matured (maturity date is in the past)
  const isMatured = ptParsed.maturityDate ? ptParsed.maturityDate < new Date() : false;

  const content = variant === "stacked" ? (
    <PTStackedDisplay parsed={ptParsed} sizeClasses={sizeClasses} className={className} />
  ) : (
    <PTInlineDisplay parsed={ptParsed} sizeClasses={sizeClasses} className={className} />
  );

  if (showTooltip) {
    return (
      <Tooltip content={
        <span className="block space-y-1">
          <span className="block font-medium">{ptParsed.originalSymbol}</span>
          {ptParsed.formattedMaturity && (
            <span className="text-base-content/70 block text-xs">
              {isMatured ? `Matured on: ${ptParsed.formattedMaturity}` : `Matures: ${ptParsed.formattedMaturity}`}
            </span>
          )}
        </span>
      }>
        {content}
      </Tooltip>
    );
  }

  return content;
}

// Inline display: "PT-sUSDai · Nov 20" or "PT-sUSDai · Matured"
function PTInlineDisplay({
  parsed,
  sizeClasses,
  className
}: {
  parsed: ParsedPTToken;
  sizeClasses: typeof SIZE_CLASSES.sm;
  className: string;
}) {
  // Check if matured (maturity date is in the past)
  const isMatured = parsed.maturityDate ? parsed.maturityDate < new Date() : false;

  // Format maturity as compact "Nov 20" (without year for brevity)
  const compactMaturity = parsed.maturityDate
    ? parsed.maturityDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={`font-medium ${sizeClasses.main}`}>{parsed.shortName}</span>
      {compactMaturity && (
        <span className={`${isMatured ? "text-warning" : "text-base-content/50"} ${sizeClasses.maturity}`}>
          · {isMatured ? "Matured" : compactMaturity}
        </span>
      )}
    </span>
  );
}

// Stacked display: short name on top, maturity below (or "Matured" if past)
function PTStackedDisplay({
  parsed,
  sizeClasses,
  className
}: {
  parsed: ParsedPTToken;
  sizeClasses: typeof SIZE_CLASSES.sm;
  className: string;
}) {
  // Check if matured (maturity date is in the past)
  const isMatured = parsed.maturityDate ? parsed.maturityDate < new Date() : false;

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`font-medium ${sizeClasses.main}`}>{parsed.shortName}</span>
      {parsed.formattedMaturity && (
        <span className={`${isMatured ? "text-warning" : "text-base-content/50"} leading-tight ${sizeClasses.maturity}`}>
          {isMatured ? "Matured" : parsed.formattedMaturity}
        </span>
      )}
    </span>
  );
}

/**
 * Compact PT badge for use in tight spaces (like table cells)
 * Shows just "PT" badge + base token, with full info on hover
 */
export function PTBadge({
  symbol,
  className = "",
  size = "sm",
}: {
  symbol: string;
  className?: string;
  size?: "xs" | "sm" | "base";
}) {
  const parsed = React.useMemo(() => parsePTToken(symbol), [symbol]);
  const sizeClasses = SIZE_CLASSES[size];

  if (!parsed.isPT) {
    return <span className={`font-medium ${sizeClasses.main} ${className}`}>{symbol}</span>;
  }

  const ptParsed = parsed as ParsedPTToken;

  // Check if matured (maturity date is in the past)
  const isMatured = ptParsed.maturityDate ? ptParsed.maturityDate < new Date() : false;

  return (
    <Tooltip content={
      <span className="block space-y-1">
        <span className="block font-medium">{ptParsed.originalSymbol}</span>
        {ptParsed.formattedMaturity && (
          <span className="text-base-content/70 block text-xs">
            {isMatured ? `Matured on: ${ptParsed.formattedMaturity}` : `Matures: ${ptParsed.formattedMaturity}`}
          </span>
        )}
      </span>
    }>
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <span className={`bg-info/20 text-info rounded ${sizeClasses.badge} font-semibold`}>
          PT
        </span>
        <span className={`font-medium ${sizeClasses.main}`}>{ptParsed.baseToken}</span>
      </span>
    </Tooltip>
  );
}

/**
 * Simple maturity badge - just shows the maturity date
 * Use when you already display the token name elsewhere
 */
export function MaturityBadge({
  symbol,
  className = "",
  size = "xs",
}: {
  symbol: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  const parsed = React.useMemo(() => parsePTToken(symbol), [symbol]);

  if (!parsed.isPT || !parsed.formattedMaturity) {
    return null;
  }

  const ptParsed = parsed as ParsedPTToken;

  // Check if matured (maturity date is in the past)
  const isMatured = ptParsed.maturityDate ? ptParsed.maturityDate < new Date() : false;

  const compactDate = ptParsed.maturityDate
    ? ptParsed.maturityDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
    : ptParsed.rawMaturityDate;

  const sizeClass = size === "xs" ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5";

  const tooltipText = isMatured ? `Matured on: ${ptParsed.formattedMaturity}` : `Matures: ${ptParsed.formattedMaturity}`;

  return (
    <Tooltip content={tooltipText}>
      <span className={`${isMatured ? "bg-warning/20 text-warning" : "bg-base-content/10 text-base-content/60"} rounded ${sizeClass} font-medium ${className}`}>
        {isMatured ? "Matured" : compactDate}
      </span>
    </Tooltip>
  );
}
