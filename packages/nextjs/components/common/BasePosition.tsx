"use client";

import { FC, ReactNode, useCallback } from "react";
import Image from "next/image";
import clsx from "clsx";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { FiatBalance } from "../FiatBalance";
import { SegmentedActionBar, SegmentedAction } from "./SegmentedActionBar";
import { PositionInfoDropdown } from "./PositionInfoDropdown";
import { getProtocolLogo as getProtocolLogoUtil } from "~~/utils/protocol";
import { useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";
import { isPTToken } from "~~/hooks/usePendlePTYields";
import { TokenSymbolDisplay } from "./TokenSymbolDisplay";

// Static handler for stopPropagation - extracted to module level to avoid recreation
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// ====================
// Sub-components to reduce duplication
// ====================

/** Expand/collapse indicator chevron - shared between mobile and desktop layouts */
type ExpandIndicatorProps = {
  isExpanded: boolean;
  /** Container size variant */
  size?: "sm" | "md";
};

const ExpandIndicator: FC<ExpandIndicatorProps> = ({ isExpanded, size = "md" }) => {
  const sizeClasses = size === "sm"
    ? { container: "size-5", icon: "size-3" }
    : { container: "size-6", icon: "size-3.5" };

  return (
    <div
      className={clsx(
        "flex items-center justify-center rounded-lg transition-all duration-200",
        sizeClasses.container,
        isExpanded
          ? "bg-primary/20 ring-primary/30 ring-1"
          : "bg-base-300/30"
      )}
    >
      {isExpanded ? (
        <ChevronUpIcon className={clsx("text-primary", sizeClasses.icon)} />
      ) : (
        <ChevronDownIcon className={clsx("text-base-content/50", sizeClasses.icon)} />
      )}
    </div>
  );
};

/** Balance display with FiatBalance - shared between mobile and desktop */
type BalanceDisplayProps = {
  tokenAddress: string;
  tokenBalance: bigint;
  tokenPrice?: bigint;
  tokenDecimals?: number;
  tokenSymbol: string;
  isNegative?: boolean;
  className?: string;
  showNoBalanceLabel?: boolean;
  noBalanceText?: string;
  /** Compact styling for mobile */
  compact?: boolean;
};

const BalanceDisplay: FC<BalanceDisplayProps> = ({
  tokenAddress,
  tokenBalance,
  tokenPrice,
  tokenDecimals,
  tokenSymbol,
  isNegative = false,
  className,
  showNoBalanceLabel = false,
  noBalanceText = "No balance",
  compact = false,
}) => {
  if (showNoBalanceLabel) {
    return <span className="text-base-content/50">{compact ? "\u2014" : noBalanceText}</span>;
  }

  return (
    <FiatBalance
      tokenAddress={tokenAddress}
      rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
      price={tokenPrice}
      decimals={tokenDecimals}
      tokenSymbol={tokenSymbol}
      isNegative={isNegative}
      className={className ?? (isNegative ? "text-error" : "text-success")}
    />
  );
};

/** Rate display with protocol logo */
type RateWithLogoProps = {
  rate: number;
  protocolLogo: string;
  protocolName: string;
  /** Compact styling for mobile */
  compact?: boolean;
};

const RateWithLogo: FC<RateWithLogoProps> = ({ rate, protocolLogo, protocolName, compact = false }) => {
  const iconSize = compact ? "size-3" : "size-4";
  const textClass = compact ? "text-[11px]" : "text-xs";

  return (
    <div className="flex items-center gap-0.5">
      <span className={clsx("text-success font-mono font-semibold tabular-nums", textClass)}>
        {formatPercentage(rate)}%
      </span>
      <div className={clsx("relative flex-shrink-0", iconSize)}>
        <Image
          src={protocolLogo}
          alt={protocolName}
          fill
          className="rounded object-contain"
        />
      </div>
    </div>
  );
};

// Base stat column definition
export type StatColumn = {
  key: string;
  label: string;
  mobileLabel?: string;
  content: ReactNode;
  mobileContent?: ReactNode;
  hasBorder?: boolean;
  hideOnMobile?: boolean;
  hideOnNarrowMobile?: boolean; // Hide below min-[400px]
};

// Common position props shared by both Supply and Borrow positions
export interface BasePositionProps {
  // Token info
  icon: string;
  name: string;
  tokenAddress: string;
  tokenPrice?: bigint;
  tokenDecimals?: number;
  tokenBalance: bigint;

  // Protocol info
  protocolName: string;
  networkType: "evm" | "starknet";
  currentRate: number;

  // Position type for display purposes
  positionType: "supply" | "borrow";
  rateLabel?: string; // "APY" for supply, "APR" for borrow

  // UI customization
  containerClassName?: string;
  hideBalanceColumn?: boolean;
  subtitle?: ReactNode;
  infoButton?: ReactNode;
  afterInfoContent?: ReactNode;
  renderName?: (name: string) => ReactNode;
  showInfoDropdown?: boolean;
  showExpandIndicator?: boolean;
  defaultExpanded?: boolean;
  suppressDisabledMessage?: boolean;

  // Actions
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
  extraActions?: ReactNode;

  // Controlled expansion
  controlledExpanded?: boolean;
  onToggleExpanded?: () => void;

  // Action bar configuration
  actions: SegmentedAction[];

  // For optimal rate display
  optimalRateOverride?: { protocol: string; rate: number };

  // Extra stat columns (beyond Balance, APY/APR, Best APY/APR)
  extraStats?: Array<{
    label: string;
    value: ReactNode;
  }>;

  // Balance display customization
  balanceClassName?: string;
  isNegativeBalance?: boolean;
  showNoBalanceLabel?: boolean;
  noBalanceText?: string;

  // Additional content before action bar
  beforeActionsContent?: ReactNode;

  // Quick action button in header (e.g., "Move" badge for borrow)
  headerQuickAction?: ReactNode;
}

export const BasePosition: FC<BasePositionProps> = ({
  icon,
  name,
  tokenAddress,
  tokenPrice,
  tokenDecimals,
  tokenBalance,
  protocolName,
  networkType,
  currentRate,
  positionType,
  rateLabel = positionType === "supply" ? "APY" : "APR",
  containerClassName,
  hideBalanceColumn = false,
  subtitle,
  infoButton,
  afterInfoContent,
  renderName,
  showInfoDropdown = false,
  showExpandIndicator = true,
  defaultExpanded = false,
  suppressDisabledMessage = false,
  actionsDisabled = false,
  actionsDisabledReason,
  extraActions,
  controlledExpanded,
  onToggleExpanded,
  actions,
  optimalRateOverride,
  extraStats = [],
  balanceClassName,
  isNegativeBalance = false,
  showNoBalanceLabel = false,
  noBalanceText = "No balance",
  beforeActionsContent,
  headerQuickAction,
}) => {
  const expanded = useToggle(defaultExpanded);
  const isExpanded = controlledExpanded ?? expanded.isOpen;

  const disabledMessage =
    actionsDisabledReason ||
    (networkType === "starknet"
      ? "Action unavailable for this market"
      : "Action unavailable");

  // Fetch optimal rate
  const { protocol: optimalProtocol, rate: optimalRateDisplay } = useOptimalRate({
    networkType,
    tokenAddress,
    type: positionType,
  });

  const hasOptimalProtocol = Boolean(optimalProtocol);
  const displayedOptimalProtocol =
    optimalRateOverride?.protocol ??
    (hasOptimalProtocol ? optimalProtocol : protocolName);
  const displayedOptimalRate =
    optimalRateOverride?.rate ??
    (hasOptimalProtocol ? optimalRateDisplay : currentRate);

  const getProtocolLogo = (protocol: string) => getProtocolLogoUtil(protocol);

  const hasAnyActions = actions.length > 0;

  // Toggle expanded state - memoized to avoid recreation on every render
  const toggleExpanded = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".dropdown")) {
      return;
    }
    if (!hasAnyActions) {
      return;
    }
    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      expanded.toggle();
    }
  }, [hasAnyActions, onToggleExpanded, expanded]);

  // Default info button using shared PositionInfoDropdown component
  const defaultInfoButton = (
    <PositionInfoDropdown
      name={name}
      tokenAddress={tokenAddress}
      protocolName={protocolName}
      positionType={positionType === "supply" ? "Supply Position" : "Borrow Position"}
    />
  );

  const infoButtonNode = infoButton ?? (showInfoDropdown ? defaultInfoButton : null);

  // Build stat columns
  const baseStatColumns = hideBalanceColumn ? 2 : 3;
  const totalStatColumns = baseStatColumns + extraStats.length;
  const statColumnClassMap: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  const statGridClass = statColumnClassMap[totalStatColumns] ?? "grid-cols-3";

  const statColumns: Array<{ key: string; content: ReactNode; hasBorder?: boolean }> = [];

  // Common balance props for reuse
  const balanceProps = {
    tokenAddress,
    tokenBalance,
    tokenPrice,
    tokenDecimals,
    tokenSymbol: name,
    isNegative: isNegativeBalance,
    className: balanceClassName,
    showNoBalanceLabel,
    noBalanceText,
  };

  if (!hideBalanceColumn) {
    statColumns.push({
      key: "balance",
      hasBorder: true,
      content: (
        <>
          <div className="text-base-content/40 mb-0.5 text-[10px] font-medium uppercase tracking-widest">Balance</div>
          <div className="font-mono text-xs font-semibold tabular-nums">
            <BalanceDisplay {...balanceProps} />
          </div>
        </>
      ),
    });
  }

  statColumns.push({
    key: "rate",
    hasBorder: true,
    content: (
      <>
        <div className="text-base-content/40 mb-0.5 text-[10px] font-medium uppercase tracking-widest">{rateLabel}</div>
        <div className="text-base-content font-mono text-xs font-semibold tabular-nums">
          {formatPercentage(currentRate)}%
        </div>
      </>
    ),
  });

  statColumns.push({
    key: "best-rate",
    content: (
      <>
        <div className="text-base-content/40 mb-0.5 text-[10px] font-medium uppercase tracking-widest">Best {rateLabel}</div>
        <RateWithLogo
          rate={displayedOptimalRate}
          protocolLogo={getProtocolLogo(displayedOptimalProtocol)}
          protocolName={displayedOptimalProtocol}
        />
      </>
    ),
  });

  extraStats.forEach((stat, index) => {
    const isLast = index === extraStats.length - 1;
    statColumns.push({
      key: `extra-${index}`,
      hasBorder: !isLast,
      content: (
        <>
          <div className="text-base-content/40 mb-0.5 text-[10px] font-medium uppercase tracking-widest">{stat.label}</div>
          <div className="font-mono text-xs font-semibold tabular-nums">{stat.value}</div>
        </>
      ),
    });
  });

  return (
    <>
      {/* Container */}
      <div
        className={clsx(
          "bg-base-200/30 border-base-300/40 w-full border transition-all duration-200",
          isExpanded && hasAnyActions ? "px-4 pb-0 pt-4 sm:px-5" : "p-4 sm:p-5",
          hasAnyActions ? "hover:bg-base-200/60 hover:border-base-content/15 cursor-pointer" : "cursor-default",
          !containerClassName?.includes("rounded") && "rounded-xl",
          containerClassName
        )}
        onClick={toggleExpanded}
      >
        {/* Mobile Layout (< md) - single row, spread out */}
        <div className="flex items-center gap-2 sm:gap-3 md:hidden">
          {/* Token icon + name */}
          <div className="flex flex-shrink-0 items-center gap-1.5" title={name}>
            <div className="from-base-200 to-base-300/50 ring-base-300/50 relative size-7 flex-shrink-0 rounded-lg bg-gradient-to-br p-0.5 ring-1">
              <Image src={icon} alt={`${name} icon`} fill className="rounded object-contain" />
            </div>
            <span className="max-w-[100px] truncate text-sm font-bold leading-none tracking-tight" title={name}>
              {renderName ? renderName(name) : isPTToken(name) ? <TokenSymbolDisplay symbol={name} size="xs" /> : name}
            </span>
            {infoButtonNode && (
              <div className="hidden flex-shrink-0 sm:block" onClick={stopPropagation}>
                {infoButtonNode}
              </div>
            )}
            {afterInfoContent && <div className="hidden sm:block" onClick={stopPropagation}>{afterInfoContent}</div>}
          </div>

          {/* Stats - spread out across available space */}
          <div className="flex min-w-0 flex-1 items-center justify-around">
            {!hideBalanceColumn && (
              <div className="flex flex-col items-center text-center">
                <div className="text-base-content/40 text-[8px] font-medium uppercase tracking-widest">Bal</div>
                <div className="font-mono text-[11px] font-semibold tabular-nums">
                  <BalanceDisplay {...balanceProps} compact />
                </div>
              </div>
            )}
            <div className="flex flex-col items-center text-center">
              <div className="text-base-content/40 text-[8px] font-medium uppercase tracking-widest">{rateLabel}</div>
              <div className="text-base-content font-mono text-[11px] font-semibold tabular-nums">
                {formatPercentage(currentRate)}%
              </div>
            </div>
            {/* Best rate - hidden on very narrow screens */}
            <div className="hidden flex-col items-center text-center min-[400px]:flex">
              <div className="text-base-content/40 text-[8px] font-medium uppercase tracking-widest">Best</div>
              <RateWithLogo
                rate={displayedOptimalRate}
                protocolLogo={getProtocolLogo(displayedOptimalProtocol)}
                protocolName={displayedOptimalProtocol}
                compact
              />
            </div>
          </div>

          {/* Quick action + expand indicator */}
          <div className="flex flex-shrink-0 items-center gap-1">
            {headerQuickAction}
            {hasAnyActions && showExpandIndicator && (
              <ExpandIndicator isExpanded={isExpanded} size="sm" />
            )}
          </div>
        </div>

        {/* Desktop Layout (>= md) */}
        <div className="relative hidden gap-0 md:grid md:grid-cols-12">
          {/* Token */}
          <div className="flex min-w-0 items-center md:col-span-3">
            <div className="from-base-200 to-base-300/50 ring-base-300/50 relative size-10 min-h-[40px] min-w-[40px] rounded-xl bg-gradient-to-br p-1.5 ring-1">
              <Image src={icon} alt={`${name} icon`} fill className="rounded-lg object-contain" />
            </div>
            <div className="ml-3 flex min-w-0 items-center gap-1.5">
              <div className="flex min-w-0 flex-col">
                {renderName ? (
                  <>{renderName(name)}</>
                ) : isPTToken(name) ? (
                  <TokenSymbolDisplay symbol={name} size="sm" variant="stacked" />
                ) : (
                  <>
                    <span className="truncate text-base font-bold leading-tight tracking-tight" title={name}>{name}</span>
                    {subtitle ? (
                      <span className="text-base-content/40 truncate text-[10px] uppercase leading-tight tracking-wider">{subtitle}</span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {infoButtonNode && (
              <div className="ml-1.5 flex-shrink-0" onClick={stopPropagation}>
                {infoButtonNode}
              </div>
            )}
            {afterInfoContent && <div onClick={stopPropagation}>{afterInfoContent}</div>}
          </div>

          {/* Stats: Rates */}
          <div className={`grid items-center gap-0 md:col-span-8 ${statGridClass}`}>
            {statColumns.map((column, index) => {
              const isLast = index === statColumns.length - 1;
              const borderClass = !isLast && column.hasBorder !== false ? "border-r border-base-300/50" : "";
              return (
                <div key={column.key} className={`px-3 ${borderClass}`}>
                  {column.content}
                </div>
              );
            })}
          </div>

          {/* Expand Indicator and quick action */}
          <div className="flex items-center justify-end gap-2 md:col-span-1">
            {headerQuickAction}
            {hasAnyActions && showExpandIndicator && (
              <ExpandIndicator isExpanded={isExpanded} size="md" />
            )}
          </div>
        </div>

        {/* Action Buttons - Only visible when expanded */}
        {isExpanded && hasAnyActions && (
          <div className="border-base-300/50 -mx-4 mt-3 border-t pt-2" onClick={stopPropagation}>
            {beforeActionsContent}
            {/* Unified segmented bar - centered */}
            <div className="flex w-full justify-center pb-0">
              <SegmentedActionBar
                autoCompact
                className="w-full"
                actions={actions}
              />
            </div>
          </div>
        )}

        {isExpanded && actionsDisabled && !suppressDisabledMessage && (
          <div className="text-base-content/50 mt-3 text-sm" onClick={stopPropagation}>
            {disabledMessage}
          </div>
        )}

        {isExpanded && extraActions && <div className="mt-3" onClick={stopPropagation}>{extraActions}</div>}
      </div>
    </>
  );
};

BasePosition.displayName = "BasePosition";

// Hook to get common position state
export function usePositionState({
  networkType,
  tokenBalance,
  actionsDisabled = false,
  actionsDisabledReason,
}: {
  networkType: "evm" | "starknet";
  tokenBalance: bigint;
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
}) {
  const { evm, starknet } = useWalletConnection();
  const isWalletConnected = networkType === "evm" ? evm.isConnected : starknet.isConnected;
  const hasBalance = typeof tokenBalance === "bigint" ? tokenBalance > 0n : (tokenBalance ?? 0) > 0;
  const disabledMessage =
    actionsDisabledReason ||
    (networkType === "starknet"
      ? "Action unavailable for this market"
      : "Action unavailable");

  return {
    isWalletConnected,
    hasBalance,
    disabledMessage,
    isActionDisabled: !isWalletConnected || actionsDisabled,
  };
}

export default BasePosition;
