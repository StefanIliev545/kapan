"use client";

import { FC, ReactNode } from "react";
import Image from "next/image";
import clsx from "clsx";
import { ChevronDownIcon, ChevronUpIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { FiatBalance } from "../FiatBalance";
import { SegmentedActionBar, SegmentedAction } from "./SegmentedActionBar";
import { getProtocolLogo as getProtocolLogoUtil } from "~~/utils/protocol";
import { useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";

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

  // Get wallet connection status
  const { evm, starknet } = useWalletConnection();
  const isWalletConnected = networkType === "evm" ? evm.isConnected : starknet.isConnected;

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

  // Toggle expanded state
  const toggleExpanded = (e: React.MouseEvent) => {
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
  };

  // Default info button dropdown
  const defaultInfoButton = (
    <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0">
      <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
        <InformationCircleIcon
          className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors"
          aria-hidden="true"
        />
      </div>
      <div
        tabIndex={0}
        className="dropdown-content z-[1] card card-compact p-2 shadow bg-base-100 w-64 max-w-[90vw]"
        style={{
          right: "auto",
          transform: "translateX(-50%)",
          left: "50%",
          borderRadius: "4px",
        }}
      >
        <div className="card-body p-3">
          <h3 className="card-title text-sm">{name} Details</h3>
          <div className="text-xs space-y-1">
            <p className="text-base-content/70">Contract Address:</p>
            <p className="font-mono break-all">{tokenAddress}</p>
            <p className="text-base-content/70">Protocol:</p>
            <p>{protocolName}</p>
            <p className="text-base-content/70">Type:</p>
            <p className="capitalize">{positionType === "supply" ? "Supply Position" : "Borrow Position"}</p>
          </div>
        </div>
      </div>
    </div>
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

  if (!hideBalanceColumn) {
    statColumns.push({
      key: "balance",
      hasBorder: true,
      content: (
        <>
          <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">Balance</div>
          <div className="text-xs font-mono font-semibold tabular-nums">
            {showNoBalanceLabel ? (
              <span className="text-base-content/50">{noBalanceText}</span>
            ) : (
              <FiatBalance
                tokenAddress={tokenAddress}
                rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
                price={tokenPrice}
                decimals={tokenDecimals}
                tokenSymbol={name}
                isNegative={isNegativeBalance}
                className={balanceClassName ?? (isNegativeBalance ? "text-error" : "text-success")}
              />
            )}
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
        <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">{rateLabel}</div>
        <div className="text-xs font-mono font-semibold tabular-nums text-base-content">
          {formatPercentage(currentRate)}%
        </div>
      </>
    ),
  });

  statColumns.push({
    key: "best-rate",
    content: (
      <>
        <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">Best {rateLabel}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-semibold tabular-nums text-success">
            {formatPercentage(displayedOptimalRate)}%
          </span>
          <div className="w-4 h-4 relative flex-shrink-0">
            <Image
              src={getProtocolLogo(displayedOptimalProtocol)}
              alt={displayedOptimalProtocol}
              fill
              className="object-contain rounded"
            />
          </div>
        </div>
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
          <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">{stat.label}</div>
          <div className="text-xs font-mono font-semibold tabular-nums">{stat.value}</div>
        </>
      ),
    });
  });

  return (
    <>
      {/* Container */}
      <div
        className={clsx(
          "w-full bg-base-200/30 border border-base-300/40 transition-all duration-200",
          isExpanded && hasAnyActions ? "px-4 sm:px-5 pt-4 pb-0" : "p-4 sm:p-5",
          hasAnyActions ? "cursor-pointer hover:bg-base-200/60 hover:border-base-content/15" : "cursor-default",
          !containerClassName?.includes("rounded") && "rounded-xl",
          containerClassName
        )}
        onClick={toggleExpanded}
      >
        {/* Mobile Layout (< md) - single row, spread out */}
        <div className="md:hidden flex items-center gap-2 sm:gap-3">
          {/* Token icon + name */}
          <div className="flex items-center gap-1.5 flex-shrink-0" title={name}>
            <div className="w-7 h-7 relative rounded-lg bg-gradient-to-br from-base-200 to-base-300/50 p-0.5 ring-1 ring-base-300/50 flex-shrink-0">
              <Image src={icon} alt={`${name} icon`} fill className="rounded object-contain" />
            </div>
            <span className="font-bold text-sm tracking-tight leading-none truncate max-w-[100px]" title={name}>
              {renderName ? renderName(name) : name}
            </span>
            {infoButtonNode && (
              <div className="flex-shrink-0 hidden sm:block" onClick={e => e.stopPropagation()}>
                {infoButtonNode}
              </div>
            )}
            {afterInfoContent && <div className="hidden sm:block" onClick={e => e.stopPropagation()}>{afterInfoContent}</div>}
          </div>

          {/* Stats - spread out across available space */}
          <div className="flex-1 flex items-center justify-around min-w-0">
            {!hideBalanceColumn && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">Bal</div>
                <div className="text-[11px] font-mono font-semibold tabular-nums">
                  {showNoBalanceLabel ? (
                    <span className="text-base-content/50">—</span>
                  ) : (
                    <FiatBalance
                      tokenAddress={tokenAddress}
                      rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
                      price={tokenPrice}
                      decimals={tokenDecimals}
                      tokenSymbol={name}
                      isNegative={isNegativeBalance}
                      className={balanceClassName ?? (isNegativeBalance ? "text-error" : "text-success")}
                    />
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col items-center text-center">
              <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">{rateLabel}</div>
              <div className="text-[11px] font-mono font-semibold tabular-nums text-base-content">
                {formatPercentage(currentRate)}%
              </div>
            </div>
            {/* Best rate - hidden on very narrow screens */}
            <div className="hidden min-[400px]:flex flex-col items-center text-center">
              <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">Best</div>
              <div className="flex items-center gap-0.5">
                <span className="text-[11px] font-mono font-semibold tabular-nums text-success">
                  {formatPercentage(displayedOptimalRate)}%
                </span>
                <div className="w-3 h-3 relative flex-shrink-0">
                  <Image
                    src={getProtocolLogo(displayedOptimalProtocol)}
                    alt={displayedOptimalProtocol}
                    fill
                    className="object-contain rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick action + expand indicator */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {headerQuickAction}
            {hasAnyActions && showExpandIndicator && (
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-md ${
                  isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
                } transition-all duration-200`}
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

        {/* Desktop Layout (>= md) */}
        <div className="hidden md:grid md:grid-cols-12 relative gap-0">
          {/* Token */}
          <div className="md:col-span-3 flex items-center min-w-0">
            <div className="w-10 h-10 relative min-w-[40px] min-h-[40px] rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-1.5 ring-1 ring-base-300/50">
              <Image src={icon} alt={`${name} icon`} fill className="rounded-lg object-contain" />
            </div>
            <div className="ml-3 flex items-center gap-1.5 min-w-0">
              <div className="flex flex-col min-w-0">
                {renderName ? (
                  <>{renderName(name)}</>
                ) : (
                  <>
                    <span className="font-bold text-base tracking-tight truncate leading-tight" title={name}>{name}</span>
                    {subtitle ? (
                      <span className="text-[10px] uppercase tracking-wider text-base-content/40 truncate leading-tight">{subtitle}</span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {infoButtonNode && (
              <div className="flex-shrink-0 ml-1.5" onClick={e => e.stopPropagation()}>
                {infoButtonNode}
              </div>
            )}
            {afterInfoContent && <div onClick={e => e.stopPropagation()}>{afterInfoContent}</div>}
          </div>

          {/* Stats: Rates */}
          <div className={`md:col-span-8 grid gap-0 items-center ${statGridClass}`}>
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
          <div className="md:col-span-1 flex items-center justify-end gap-2">
            {headerQuickAction}
            {hasAnyActions && showExpandIndicator && (
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0 ${
                  isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
                } transition-all duration-200`}
              >
                {isExpanded ? (
                  <ChevronUpIcon className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-base-content/50" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Only visible when expanded */}
        {isExpanded && hasAnyActions && (
          <div className="-mx-4 mt-3 pt-2 border-t border-base-300/50" onClick={e => e.stopPropagation()}>
            {beforeActionsContent}
            {/* Unified segmented bar - centered */}
            <div className="flex justify-center w-full pb-0">
              <SegmentedActionBar
                autoCompact
                className="w-full"
                actions={actions}
              />
            </div>
          </div>
        )}

        {isExpanded && actionsDisabled && !suppressDisabledMessage && (
          <div className="mt-3 text-sm text-base-content/50" onClick={e => e.stopPropagation()}>
            {disabledMessage}
          </div>
        )}

        {isExpanded && extraActions && <div className="mt-3" onClick={e => e.stopPropagation()}>{extraActions}</div>}
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
