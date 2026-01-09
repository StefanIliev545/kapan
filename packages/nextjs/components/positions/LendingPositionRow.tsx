"use client";

import { FC, ReactNode, useMemo } from "react";
import Image from "next/image";
import clsx from "clsx";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { ExternalLink } from "lucide-react";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import formatPercentage from "~~/utils/formatPercentage";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { calculateNetYieldMetrics } from "~~/utils/netYield";

/**
 * Position data for either collateral (supply) or debt (borrow)
 */
export interface PositionData {
  /** Token symbol (e.g., "WETH", "USDC") */
  symbol: string;
  /** Token icon URL */
  icon?: string;
  /** Token balance in base units */
  tokenBalance: bigint;
  /** Token decimals */
  tokenDecimals: number;
  /** USD value of the position */
  balanceUsd: number;
  /** Current APY/APR rate as percentage (e.g., 3.5 for 3.5%) */
  currentRate: number;
  /** Token contract address */
  tokenAddress: string;
}

/**
 * Props for the LendingPositionRow component
 */
export interface LendingPositionRowProps {
  /** Unique key for this position row */
  rowKey: string;
  /** Collateral (supply) position data */
  collateral: PositionData;
  /** Debt (borrow) position data - optional for supply-only positions */
  debt?: PositionData | null;
  /** Current LTV as percentage (e.g., 45.5 for 45.5%) */
  currentLtv?: number | null;
  /** Maximum LTV (liquidation threshold) as percentage */
  maxLtv?: number;
  /** Whether the row is expanded to show details/actions */
  isExpanded?: boolean;
  /** Callback when row expansion is toggled */
  onToggle?: () => void;
  /** External link URL (e.g., to Morpho market page) */
  externalLinkUrl?: string;
  /** External link title/tooltip */
  externalLinkTitle?: string;
  /** External link icon */
  externalLinkIcon?: ReactNode;
  /** Content to render in the collateral column when expanded */
  collateralContent?: ReactNode;
  /** Content to render in the debt column when expanded */
  debtContent?: ReactNode;
  /** Additional class names for the container */
  className?: string;
  /** Whether to show the expand indicator */
  showExpandIndicator?: boolean;
}

/**
 * Shared component for displaying lending positions with collateral and debt
 * in a consistent row/card format. Used by protocol-specific sections like
 * MorphoPositionsSection and VesuPositionsSection.
 */
export const LendingPositionRow: FC<LendingPositionRowProps> = ({
  rowKey,
  collateral,
  debt,
  currentLtv,
  maxLtv,
  isExpanded = false,
  onToggle,
  externalLinkUrl,
  externalLinkTitle,
  externalLinkIcon,
  collateralContent,
  debtContent,
  className,
  showExpandIndicator = true,
}) => {
  // Calculate net yield metrics
  const yieldMetrics = useMemo(() => {
    const supplies = [{ balance: collateral.balanceUsd, currentRate: collateral.currentRate }];
    const borrows = debt ? [{ balance: debt.balanceUsd, currentRate: debt.currentRate }] : [];
    return calculateNetYieldMetrics(supplies, borrows);
  }, [collateral, debt]);

  const hasDebt = debt && debt.tokenBalance > 0n;
  const collateralIcon = collateral.icon || tokenNameToLogo(collateral.symbol.toLowerCase());
  const debtIcon = debt?.icon || (debt ? tokenNameToLogo(debt.symbol.toLowerCase()) : undefined);

  // Format percentage with sign
  const formatSignedPercentage = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  };

  // LTV display value
  const ltvDisplayValue = currentLtv != null ? `${formatPercentage(currentLtv, 1)}%` : "--";
  const isLtvHigh = currentLtv != null && maxLtv != null && currentLtv > maxLtv * 0.9;

  return (
    <div
      key={rowKey}
      className={clsx(
        "relative rounded-md border border-base-300 transition-all duration-200 hover:border-base-content/15",
        className
      )}
    >
      {/* Header: Market Pair with Stats */}
      <div
        className={clsx(
          "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-base-200/50 px-3 py-2 border-b border-base-300 transition-colors",
          onToggle && "cursor-pointer hover:bg-base-200/70"
        )}
        onClick={onToggle}
      >
        {/* Market pair icons and name */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex -space-x-2 flex-shrink-0">
            <Image
              src={collateralIcon}
              alt={collateral.symbol}
              width={20}
              height={20}
              className="rounded-full border border-base-100 bg-base-200"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/logos/default.svg";
              }}
            />
            {debtIcon && (
              <Image
                src={debtIcon}
                alt={debt?.symbol || ""}
                width={20}
                height={20}
                className="rounded-full border border-base-100 bg-base-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logos/default.svg";
                }}
              />
            )}
          </div>
          <span
            className="text-sm font-medium truncate"
            title={debt ? `${collateral.symbol}/${debt.symbol}` : collateral.symbol}
          >
            {debt ? `${collateral.symbol}/${debt.symbol}` : collateral.symbol}
          </span>
          {externalLinkUrl && (
            <a
              href={externalLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
              title={externalLinkTitle || "View externally"}
            >
              {externalLinkIcon || <ExternalLink width={12} height={12} />}
            </a>
          )}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {/* Net Value */}
          <span className="text-base-content/60">
            Net:{" "}
            <span className={yieldMetrics.netBalance >= 0 ? "text-success" : "text-error"}>
              {formatCurrencyCompact(yieldMetrics.netBalance)}
            </span>
          </span>
          {/* Net APY */}
          <span className="text-base-content/60">
            APY:{" "}
            <span
              className={
                yieldMetrics.netApyPercent == null
                  ? "text-base-content/40"
                  : yieldMetrics.netApyPercent >= 0
                    ? "text-success"
                    : "text-error"
              }
            >
              {yieldMetrics.netApyPercent != null
                ? formatSignedPercentage(yieldMetrics.netApyPercent)
                : "--"}
            </span>
          </span>
          {/* LTV */}
          {hasDebt && (
            <span className="text-base-content/60">
              LTV:{" "}
              <span className={isLtvHigh ? "text-error" : "text-success"}>{ltvDisplayValue}</span>
              {maxLtv != null && <span className="text-base-content/50">/{maxLtv.toFixed(0)}%</span>}
            </span>
          )}
          {/* 30D Yield */}
          <span className="hidden min-[400px]:inline text-base-content/60 group relative cursor-help">
            30D:{" "}
            <span className={yieldMetrics.netYield30d >= 0 ? "text-success" : "text-error"}>
              {formatCurrencyCompact(yieldMetrics.netYield30d)}
            </span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] bg-base-300 text-base-content rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Est. annual:{" "}
              <span className={yieldMetrics.netAnnualYield >= 0 ? "text-success" : "text-error"}>
                {formatCurrencyCompact(yieldMetrics.netAnnualYield)}
              </span>
            </span>
          </span>
          {/* Expand indicator */}
          {showExpandIndicator && onToggle && (
            <div
              className={clsx(
                "flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 transition-all duration-200",
                isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
              )}
            >
              {isExpanded ? (
                <ChevronUpIcon className="w-3 h-3 text-primary" />
              ) : (
                <ChevronDownIcon className="w-3 h-3 text-base-content/50" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Position Details - Side by side columns */}
      <div className="grid divide-y divide-base-300 md:divide-y-0 grid-cols-1 md:grid-cols-2 md:divide-x">
        {/* Collateral Column */}
        <div className="p-3">
          {collateralContent || (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Image
                  src={collateralIcon}
                  alt={collateral.symbol}
                  width={24}
                  height={24}
                  className="rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/logos/default.svg";
                  }}
                />
                <div>
                  <div className="text-sm font-medium">{collateral.symbol}</div>
                  <div className="text-xs text-base-content/60">Collateral</div>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-base-content/70">Balance</span>
                <span className="font-mono text-success">
                  {formatCurrencyCompact(collateral.balanceUsd)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-base-content/70">APY</span>
                <span className="font-mono text-success">
                  {formatPercentage(collateral.currentRate)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Debt Column */}
        <div className="p-3">
          {debtContent || (
            debt ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Image
                    src={debtIcon!}
                    alt={debt.symbol}
                    width={24}
                    height={24}
                    className="rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/logos/default.svg";
                    }}
                  />
                  <div>
                    <div className="text-sm font-medium">{debt.symbol}</div>
                    <div className="text-xs text-base-content/60">Debt</div>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-base-content/70">Balance</span>
                  <span className="font-mono text-error">
                    -{formatCurrencyCompact(debt.balanceUsd)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-base-content/70">APR</span>
                  <span className="font-mono text-error">
                    {formatPercentage(debt.currentRate)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-base-content/50">
                No debt
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

LendingPositionRow.displayName = "LendingPositionRow";

export default LendingPositionRow;
