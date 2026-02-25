import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { Address, encodeAbiParameters } from "viem";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { BorrowPosition } from "./BorrowPosition";
import { SupplyPosition } from "./SupplyPosition";
import type { CollateralWithAmount } from "./specific/collateral/CollateralSelector";
import { BorrowModal } from "./modals/BorrowModal";
import { TokenSelectModal } from "./modals/TokenSelectModal";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { TokenSelectModalStark } from "./modals/stark/TokenSelectModalStark";
import { ExclamationTriangleIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import type { SwapAsset } from "./modals/SwapModalShell";
import formatPercentage from "~~/utils/formatPercentage";
import { formatCurrency } from "~~/utils/formatNumber";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { PositionManager } from "~~/utils/position";
import type { VesuContext } from "~~/utils/vesu";
import { CollateralSwapModal } from "./modals/CollateralSwapModal";
import { CloseWithCollateralEvmModal } from "./modals/CloseWithCollateralEvmModal";
import { DebtSwapEvmModal } from "./modals/DebtSwapEvmModal";
import { MultiplyEvmModal } from "./modals/MultiplyEvmModal";
import { useAaveEMode, type EModeCategory } from "~~/hooks/useAaveEMode";
import { usePTEnhancedApyMaps } from "~~/hooks/usePendlePTYields";
import { useExternalYields, type ExternalYield } from "~~/hooks/useExternalYields";
import { useAaveReserveConfigs } from "~~/hooks/usePredictiveLtv";
import { HealthStatus } from "./specific/common";

// --- Helper functions extracted to reduce cognitive complexity ---

/** E-Mode asset filter types */
type EModeFilterType = "pendle" | "eth" | "stable" | "all";

/** Determine E-Mode filter type from label */
function getEModeFilterType(label: string): EModeFilterType {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("pendle")) return "pendle";
  if (lowerLabel.includes("eth")) return "eth";
  if (lowerLabel.includes("stable") || lowerLabel.includes("usd")) return "stable";
  return "all";
}

/** Check if symbol matches Pendle E-Mode filter */
function matchesPendleEMode(symbol: string): boolean {
  const sym = symbol.toLowerCase();
  return sym.startsWith("pt-") || sym.includes("usde") || sym.includes("susde");
}

/** Check if symbol matches ETH-correlated E-Mode filter */
function matchesEthEMode(symbol: string): boolean {
  const sym = symbol.toLowerCase();
  return sym.includes("eth") || sym.includes("wsteth") || sym.includes("reth") || sym.includes("cbeth");
}

/** Check if symbol matches stablecoin E-Mode filter */
function matchesStableEMode(symbol: string): boolean {
  const sym = symbol.toLowerCase();
  return sym.includes("usd") || sym.includes("dai") || sym.includes("frax") || sym.includes("lusd");
}

/** Create E-Mode filter function based on user's E-Mode */
function createEModeFilter(userEMode: EModeCategory | null | undefined): (assets: SwapAsset[]) => SwapAsset[] {
  if (!userEMode || userEMode.id === 0) {
    return (assets) => assets;
  }

  const filterType = getEModeFilterType(userEMode.label);

  return (assets) => {
    if (filterType === "all") return assets;

    return assets.filter(a => {
      if (filterType === "pendle") return matchesPendleEMode(a.symbol);
      if (filterType === "eth") return matchesEthEMode(a.symbol);
      if (filterType === "stable") return matchesStableEMode(a.symbol);
      return true;
    });
  };
}

/** Get external yield override for a position if available (PT tokens, LSTs, etc.)
 * For LSTs (wstETH, rETH, etc.), the external yield is ADDED to the protocol rate
 * For PT tokens, the external yield REPLACES the protocol rate (they're fixed yield tokens)
 */
function getExternalYieldOverride(
  position: { name: string; tokenAddress: string; currentRate: number },
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined
): number {
  const externalYield = findYield(position.tokenAddress, position.name);

  if (!externalYield) {
    return position.currentRate;
  }

  // Use source to determine yield logic (more reliable than symbol parsing)
  // - Pendle PT tokens: fixed yield REPLACES protocol rate
  // - LSTs, Maple: staking/external yield ADDS to protocol rate
  if (externalYield.source === "pendle") {
    return externalYield.apy;
  }

  // For LSTs, Maple, and other yield sources, add external yield to protocol supply rate
  // e.g., wstETH at 2.3% staking yield + 0.01% Aave supply = 2.31% total
  return externalYield.apy + position.currentRate;
}

/** Convert a ProtocolPosition to a SwapAsset format */
function positionToSwapAsset(p: ProtocolPosition): SwapAsset {
  return {
    symbol: p.name,
    address: p.tokenAddress,
    decimals: p.tokenDecimals || 18,
    rawBalance: p.tokenBalance,
    balance: p.balance,
    icon: p.icon,
    usdValue: p.balance,
    price: p.tokenPrice,
  };
}

/** Convert ProtocolPosition to Starknet token format */
function positionToStarknetToken(pos: ProtocolPosition, isSupply: boolean) {
  return {
    address: BigInt(pos.tokenAddress),
    symbol: BigInt("0x" + Buffer.from(pos.name).toString("hex")),
    decimals: pos.tokenDecimals || 18,
    rate_accumulator: 0n,
    utilization: 0n,
    fee_rate: BigInt(Math.floor(((pos.currentRate / 100) * 1e18) / (365 * 24 * 60 * 60))),
    price: { value: BigInt(pos.tokenPrice || 0), is_valid: true },
    total_nominal_debt: pos.tokenBalance ?? 0n,
    last_rate_accumulator: 0n,
    reserve: 0n,
    scale: 0n,
    borrowAPR: pos.currentRate,
    supplyAPY: isSupply ? pos.currentRate : pos.currentRate * 0.7,
  };
}

/** Create borrow modal token props from selected token or fallback */
function createBorrowModalToken(
  selectedToken: ProtocolPosition | null,
  fallbackPosition: ProtocolPosition | undefined
): { name: string; icon: string; address: string; currentRate: number; usdPrice: number } {
  const source = selectedToken ?? fallbackPosition;

  if (!source) {
    return { name: "", icon: "", address: "", currentRate: 0, usdPrice: 0 };
  }

  return {
    name: source.name,
    icon: source.icon,
    address: source.tokenAddress,
    currentRate: source.currentRate,
    usdPrice: source.usdPrice ?? (source.tokenPrice ? Number(source.tokenPrice) / 1e8 : 0),
  };
}

/** Calculate current debt from selected token or fallback */
function calculateCurrentDebt(
  selectedToken: ProtocolPosition | null,
  fallbackPosition: ProtocolPosition | undefined
): number {
  const source = selectedToken ?? fallbackPosition;
  if (!source) return 0;
  return Number(source.tokenBalance) / 10 ** (source.tokenDecimals || 18);
}

/** Apply readOnly modifications to a position */
function applyReadOnlyToPosition<T extends { moveSupport?: { preselectedCollaterals?: CollateralWithAmount[]; disableCollateralSelection?: boolean } }>(
  position: T,
  readOnly: boolean
): T & { actionsDisabled?: boolean } {
  if (!readOnly) return position;

  return {
    ...position,
    actionsDisabled: true,
    moveSupport: position.moveSupport
      ? { ...position.moveSupport, disableCollateralSelection: true }
      : undefined,
  };
}

/** Calculate net balance from positions */
function calculateNetBalance(
  suppliedPositions: ProtocolPosition[],
  borrowedPositions: ProtocolPosition[]
): number {
  const totalSupplied = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);

  let totalBorrowed = 0;
  let totalCollateral = 0;

  for (const pos of borrowedPositions) {
    totalBorrowed += Math.abs(pos.balance);
    if (pos.collateralValue) {
      totalCollateral += pos.collateralValue;
    }
  }

  return totalSupplied + totalCollateral - totalBorrowed;
}

/** Calculate utilization metrics */
function calculateUtilizationMetrics(
  suppliedPositions: ProtocolPosition[],
  borrowedPositions: ProtocolPosition[],
  ltvBps: bigint,
  lltvBps: bigint
): { utilizationPercentage: number; currentLtvBps: bigint } {
  const suppliedTotal = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);
  const collateralTotal = borrowedPositions.reduce((acc, pos) => acc + (pos.collateralValue || 0), 0);
  const totalSupplied = suppliedTotal + collateralTotal;
  const totalBorrowed = borrowedPositions.reduce((acc, pos) => acc + Math.abs(pos.balance), 0);
  const baseLtv = totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0;
  const currentBps = totalSupplied > 0 ? BigInt(Math.round((totalBorrowed / totalSupplied) * 10000)) : 0n;

  const thresholdBps = lltvBps > 0n ? lltvBps : ltvBps;
  if (thresholdBps > 0n) {
    const usageBps = Number((currentBps * 10000n) / thresholdBps) / 100;
    return { utilizationPercentage: Math.min(usageBps, 100), currentLtvBps: currentBps };
  }

  return { utilizationPercentage: baseLtv, currentLtvBps: currentBps };
}

/** Format percentage with sign */
function formatSignedPercentage(value: number): string {
  const formatted = formatPercentage(Math.abs(value));
  return `${value >= 0 ? "" : "-"}${formatted}%`;
}

// Static constants for availableActions props (prevent inline object creation)
const MARKET_SUPPLY_ACTIONS = { deposit: false, withdraw: false, move: false, swap: false } as const;
const MARKET_BORROW_ACTIONS = { borrow: false, repay: false, move: false, close: false, swap: false } as const;

// --- Sub-components to reduce cognitive complexity ---

/** Get value class based on sign */
function getValueClass(value: number | null | undefined, defaultClass = "text-base-content/40"): string {
  if (value == null) return defaultClass;
  return value >= 0 ? TEXT_SUCCESS : TEXT_ERROR;
}

/** Stat display component for the header */
interface StatDisplayProps {
  label: string;
  value: string;
  valueClass: string;
  isMobile?: boolean;
}

const StatDisplay: FC<StatDisplayProps> = ({ label, value, valueClass, isMobile }) => {
  const baseClasses = isMobile
    ? "flex flex-col items-center gap-1 py-1"
    : "hover:bg-base-content/[0.03] flex min-w-[96px] flex-col items-center gap-1.5 rounded-lg px-4 py-2 transition-colors duration-200";
  const labelClasses = "header-label";
  const valueClasses = isMobile
    ? `text-xs font-semibold tabular-nums ${valueClass}`
    : `header-value ${valueClass}`;

  return (
    <div className={baseClasses}>
      <span className={labelClasses}>{label}</span>
      <span className={valueClasses}>{value}</span>
    </div>
  );
};

StatDisplay.displayName = "StatDisplay";

/** Empty state component */
interface EmptyStateProps {
  message: string;
  showAddButton: boolean;
  onAdd: () => void;
  addButtonLabel: string;
  buttonDisabled?: boolean;
  buttonTitle?: string;
  showLoopButton?: boolean;
  onAddLoop?: () => void;
  loopDisabled?: boolean;
  loopTitle?: string;
}

const EmptyState: FC<EmptyStateProps> = ({
  message,
  showAddButton,
  onAdd,
  addButtonLabel,
  buttonDisabled,
  buttonTitle,
  showLoopButton,
  onAddLoop,
  loopDisabled,
  loopTitle,
}) => {
  const buttonClass = buttonDisabled
    ? "bg-base-200/30 text-base-content/30 cursor-not-allowed"
    : "bg-primary/10 hover:bg-primary/20 text-primary";

  return (
    <div className="text-base-content/50 bg-base-200/30 border-base-300 mt-2 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
      <ExclamationTriangleIcon className="mb-3 size-8 opacity-40" />
      <p className="text-sm">{message}</p>
      {showAddButton && (
        <div className="mt-4 flex items-center gap-2">
          <button
            className={`group flex items-center justify-center gap-2 rounded-lg px-4 py-2 transition-all duration-200 ${buttonClass}`}
            onClick={onAdd}
            disabled={buttonDisabled}
            title={buttonTitle}
          >
            <PlusIcon className="size-3.5 transition-transform duration-200 group-hover:rotate-90" />
            <span className="text-xs font-medium uppercase tracking-wider">{addButtonLabel}</span>
          </button>
          {showLoopButton && onAddLoop && (
            <button
              className="bg-primary/10 hover:bg-primary/20 text-primary group flex items-center justify-center gap-2 rounded-lg px-4 py-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onAddLoop}
              disabled={loopDisabled}
              title={loopTitle}
            >
              <PlusIcon className="size-3.5 transition-transform duration-200 group-hover:rotate-90" />
              <span className="text-xs font-medium uppercase tracking-wider">Add Loop</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

EmptyState.displayName = "EmptyState";

/** Add button component for supply/borrow actions */
interface AddButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "secondary";
}

const AddButton: FC<AddButtonProps> = ({ onClick, label, disabled, title, variant = "primary" }) => {
  const enabledClasses = variant === "primary"
    ? "border-base-300 hover:border-primary/50 bg-base-200/30 hover:bg-primary/5 text-base-content/60 hover:text-primary"
    : "border-base-300 hover:border-secondary/50 bg-base-200/30 hover:bg-secondary/5 text-base-content/60 hover:text-secondary";
  const disabledClasses = "border-base-300/50 bg-base-200/20 text-base-content/30 cursor-not-allowed";

  return (
    <button
      className={`group flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${disabled ? disabledClasses : enabledClasses}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <PlusIcon className="size-3.5 transition-transform duration-200 group-hover:rotate-90" />
      <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
};

AddButton.displayName = "AddButton";

/** Get protocol context for a position - handles Compound encoding */
function getProtocolContext(
  protocolName: string,
  position: { tokenAddress: string; protocolContext?: string }
): `0x${string}` | undefined {
  if (protocolName.toLowerCase().includes("compound")) {
    return encodeAbiParameters([{ type: "address" }], [position.tokenAddress as Address]) as `0x${string}`;
  }
  return position.protocolContext as `0x${string}` | undefined;
}

/** Get market address for multiply modal */
function getMultiplyMarket(protocolName: string, collaterals: SwapAsset[]): Address | undefined {
  if (protocolName.toLowerCase().includes("compound") && collaterals.length > 0) {
    return collaterals[0]?.address as Address;
  }
  return undefined;
}

/** Renders the Markets button in header */
interface MarketsButtonProps {
  show: boolean;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  isMobile?: boolean;
}

const MarketsButton: FC<MarketsButtonProps> = ({ show, isOpen, onToggle, isMobile }) => {
  if (!show) return null;

  const btnClass = isMobile ? "btn btn-xs btn-ghost gap-1" : "btn btn-sm btn-ghost gap-1.5";
  const textClass = isMobile ? "text-[9px] font-semibold uppercase tracking-wider" : "text-[10px] font-semibold uppercase tracking-widest";
  const iconClass = isMobile ? "size-3" : "size-3.5";

  return (
    <button className={btnClass} type="button" onClick={onToggle}>
      <span className={textClass}>Markets</span>
      {isOpen ? <ChevronUpIcon className={iconClass} /> : <ChevronDownIcon className={iconClass} />}
    </button>
  );
};

MarketsButton.displayName = "MarketsButton";

/** Collateral breakdown data for LTV tooltip */
interface CollateralBreakdownItem {
  name: string;
  icon: string;
  valueUsd: number;
  ltvBps: number;
  lltvBps: number;
  weightPct: number; // Percentage of total collateral
}

/** Collateral LTV breakdown component for tooltip */
interface CollateralLtvBreakdownProps {
  items: CollateralBreakdownItem[];
  totalDebtUsd: number;
}

const CollateralLtvBreakdown: FC<CollateralLtvBreakdownProps> = ({ items, totalDebtUsd }) => {
  if (items.length === 0) return null;

  const totalCollateralUsd = items.reduce((sum, item) => sum + item.valueUsd, 0);
  const currentLtv = totalCollateralUsd > 0 ? (totalDebtUsd / totalCollateralUsd) * 100 : 0;
  const weightedMaxLtv = totalCollateralUsd > 0
    ? items.reduce((sum, item) => sum + (item.valueUsd * item.ltvBps), 0) / totalCollateralUsd / 100
    : 0;
  const weightedLltv = totalCollateralUsd > 0
    ? items.reduce((sum, item) => sum + (item.valueUsd * item.lltvBps), 0) / totalCollateralUsd / 100
    : 0;

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Header with current LTV */}
      <div className="border-base-300/50 flex items-center justify-between border-b pb-2">
        <span className="text-base-content/60 text-[10px] font-semibold uppercase tracking-wide">
          Collateral Breakdown
        </span>
        <span className="text-base-content font-mono font-bold">
          {currentLtv.toFixed(1)}% LTV
        </span>
      </div>
      {/* Per-collateral rows */}
      <div className="flex flex-col gap-1.5">
        <div className="text-base-content/40 flex items-center gap-2 text-[10px]">
          <span className="flex-1">Asset</span>
          <span className="w-16 text-right">Value</span>
          <span className="w-12 text-right">Max LTV</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <img src={item.icon} alt={item.name} className="size-4 rounded-full" />
            <span className="text-base-content/90 flex-1 font-medium">{item.name}</span>
            <span className="text-base-content/60 w-16 text-right tabular-nums">{formatCurrency(item.valueUsd)}</span>
            <span className="text-base-content/50 w-12 text-right tabular-nums">{(item.ltvBps / 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {/* Summary */}
      <div className="border-base-300/50 mt-1 flex flex-col gap-1 border-t pt-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-base-content/50">Total Collateral</span>
          <span className="text-success font-medium tabular-nums">{formatCurrency(totalCollateralUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/50">Total Debt</span>
          <span className="text-error font-medium tabular-nums">{formatCurrency(totalDebtUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/50">Weighted Max LTV</span>
          <span className="text-base-content/70 font-medium tabular-nums">{weightedMaxLtv.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/50">Liquidation Threshold</span>
          <span className="text-warning font-medium tabular-nums">{weightedLltv.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
};

CollateralLtvBreakdown.displayName = "CollateralLtvBreakdown";

/** Utilization detail display on hover */

/** Connect wallet hint */
interface ConnectHintProps {
  show: boolean;
  isMobile?: boolean;
}

const ConnectHint: FC<ConnectHintProps> = ({ show, isMobile }) => {
  if (!show) return null;
  const className = isMobile
    ? "text-primary/80 text-[10px] font-medium"
    : "text-primary/80 text-[11px] font-medium";
  const text = isMobile ? "Connect" : "Connect wallet";
  return <span className={className}>{text}</span>;
};

ConnectHint.displayName = "ConnectHint";

const READONLY_SUPPLY_ACTIONS = { deposit: true, withdraw: true, move: true, swap: true } as const;
const READONLY_BORROW_ACTIONS = { borrow: true, repay: true, move: true, close: false, swap: false } as const;

// Static animation props for motion.div
const MOTION_INITIAL = { opacity: 0, height: 0 };
const MOTION_ANIMATE = { opacity: 1, height: "auto" };
const MOTION_EXIT = { opacity: 0, height: 0 };
const MOTION_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };

// CSS class constants to avoid duplicate string warnings
const TEXT_SUCCESS = "text-success";
const TEXT_ERROR = "text-error";

// ============================================================================
// Sub-components extracted from ProtocolView JSX to reduce cognitive complexity.
// Each sub-component encapsulates a major section of the original return JSX,
// moving conditional rendering out of the main component body.
// ============================================================================

/** Mobile header layout for protocol card */
interface ProtocolHeaderMobileProps {
  protocolIcon: string;
  protocolName: string;
  forceShowAll: boolean;
  disableMarkets: boolean;
  isMarketsOpen: boolean;
  onToggleMarkets: (e: React.MouseEvent) => void;
  readOnly: boolean;
  isCollapsed: boolean;
  hideUtilization: boolean;
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  utilizationPercentage: number;
  headerElement?: React.ReactNode;
  onStopPropagation: (e: React.MouseEvent) => void;
}

const ProtocolHeaderMobile: FC<ProtocolHeaderMobileProps> = ({
  protocolIcon, protocolName, forceShowAll, disableMarkets, isMarketsOpen,
  onToggleMarkets, readOnly, isCollapsed, hideUtilization, netBalance,
  netYield30d, netApyPercent, utilizationPercentage, headerElement, onStopPropagation,
}) => (
  <div className="space-y-2 sm:hidden">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="token-icon-wrapper-md">
          <Image src={protocolIcon} alt={`${protocolName} icon`} width={20} height={20} className="object-contain drop-shadow-sm" />
        </div>
        <span className="text-sm font-semibold tracking-tight">{protocolName}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <MarketsButton show={!forceShowAll && !disableMarkets} isOpen={isMarketsOpen} onToggle={onToggleMarkets} isMobile />
        <ConnectHint show={forceShowAll && !readOnly} isMobile />
        <ChevronDownIcon className={`text-base-content/30 size-4 transition-transform duration-300${isCollapsed ? ' -rotate-90' : ''}`} />
      </div>
    </div>
    <div className="flex items-center justify-evenly">
      <StatDisplay label="Balance" value={formatCurrency(netBalance)} valueClass={getValueClass(netBalance)} isMobile />
      <StatDisplay label="30D" value={formatCurrency(netYield30d)} valueClass={getValueClass(netYield30d)} isMobile />
      <StatDisplay label="Net APY" value={netApyPercent == null ? "\u2014" : formatSignedPercentage(netApyPercent)} valueClass={getValueClass(netApyPercent)} isMobile />
      {!hideUtilization && (
        <div className="flex flex-col items-center gap-1 py-1">
          <span className="header-label">LTV</span>
          <HealthStatus utilizationPercentage={utilizationPercentage} />
        </div>
      )}
    </div>
    {headerElement && (
      <div className="border-base-300/30 flex items-center justify-start border-t pt-2" onClick={onStopPropagation}>
        {headerElement}
      </div>
    )}
  </div>
);
ProtocolHeaderMobile.displayName = "ProtocolHeaderMobile";

/** Utilization stat with collateral breakdown tooltip (desktop) */
interface UtilizationWithTooltipProps {
  utilizationPercentage: number;
  collateralBreakdown: CollateralBreakdownItem[];
  totalDebtUsd: number;
}

const UtilizationWithTooltip: FC<UtilizationWithTooltipProps> = ({
  utilizationPercentage, collateralBreakdown, totalDebtUsd,
}) => (
  <div className="group/util hover:bg-base-content/[0.03] relative flex min-w-[96px] flex-col items-center gap-1.5 rounded-lg px-4 py-2 transition-colors duration-200">
    <span className="header-label">Utilization</span>
    <HealthStatus utilizationPercentage={utilizationPercentage} />
    {collateralBreakdown.length > 0 && (
      <div className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 hidden -translate-x-1/2 group-hover/util:block">
        <div className="bg-base-100 ring-base-300/50 pointer-events-auto min-w-[280px] rounded-lg p-3 shadow-xl ring-1">
          <CollateralLtvBreakdown items={collateralBreakdown} totalDebtUsd={totalDebtUsd} />
        </div>
      </div>
    )}
  </div>
);
UtilizationWithTooltip.displayName = "UtilizationWithTooltip";

/** Desktop header layout for protocol card */
interface ProtocolHeaderDesktopProps {
  protocolIcon: string;
  protocolName: string;
  forceShowAll: boolean;
  disableMarkets: boolean;
  isMarketsOpen: boolean;
  onToggleMarkets: (e: React.MouseEvent) => void;
  readOnly: boolean;
  isCollapsed: boolean;
  hideUtilization: boolean;
  netBalance: number;
  netYield30d: number;
  netApyPercent: number | null;
  utilizationPercentage: number;
  collateralBreakdown: CollateralBreakdownItem[];
  totalDebtUsd: number;
  headerElement?: React.ReactNode;
  onStopPropagation: (e: React.MouseEvent) => void;
}

const ProtocolHeaderDesktop: FC<ProtocolHeaderDesktopProps> = ({
  protocolIcon, protocolName, forceShowAll, disableMarkets, isMarketsOpen,
  onToggleMarkets, readOnly, isCollapsed, hideUtilization, netBalance,
  netYield30d, netApyPercent, utilizationPercentage, collateralBreakdown,
  totalDebtUsd, headerElement, onStopPropagation,
}) => (
  <div className="hidden sm:block">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="flex items-center gap-3.5 py-1">
        <div className="token-icon-wrapper-lg">
          <Image src={protocolIcon} alt={`${protocolName} icon`} width={26} height={26} className="object-contain drop-shadow-sm" />
        </div>
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight">{protocolName}</span>
      </div>
      <div className="via-base-300/60 h-12 w-px bg-gradient-to-b from-transparent to-transparent" />
      <div className="flex flex-1 flex-wrap items-center justify-around gap-y-3">
        <StatDisplay label="Balance" value={formatCurrency(netBalance)} valueClass={getValueClass(netBalance)} />
        <StatDisplay label="30D Yield" value={formatCurrency(netYield30d)} valueClass={getValueClass(netYield30d)} />
        <StatDisplay label="Net APY" value={netApyPercent == null ? "\u2014" : formatSignedPercentage(netApyPercent)} valueClass={getValueClass(netApyPercent)} />
        {!hideUtilization && (
          <UtilizationWithTooltip utilizationPercentage={utilizationPercentage} collateralBreakdown={collateralBreakdown} totalDebtUsd={totalDebtUsd} />
        )}
      </div>
      {headerElement && (
        <div className="hidden items-center md:flex" onClick={onStopPropagation}>{headerElement}</div>
      )}
      <div className="flex items-center gap-2 pl-3">
        <MarketsButton show={!forceShowAll && !disableMarkets} isOpen={isMarketsOpen} onToggle={onToggleMarkets} />
        <ConnectHint show={forceShowAll && !readOnly} />
        <ChevronDownIcon className={`text-base-content/30 size-5 transition-transform duration-300${isCollapsed ? ' -rotate-90' : ''}`} />
      </div>
    </div>
    {headerElement && (
      <div className="border-base-300/30 mt-2 flex items-center justify-start border-t pt-2 md:hidden" onClick={onStopPropagation}>
        {headerElement}
      </div>
    )}
  </div>
);
ProtocolHeaderDesktop.displayName = "ProtocolHeaderDesktop";

/** Markets section - expandable panel showing suppliable/borrowable assets */
interface MarketsSectionProps {
  show: boolean;
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  readOnly: boolean;
  filteredSuppliedPositionsCount: number;
  protocolName: string;
  networkType: "evm" | "starknet";
  chainId?: number;
  findYield: (address?: string, symbol?: string) => ExternalYield | undefined;
  onAddSupply: () => void;
  onAddBorrow: () => void;
}

const InternalMarketsSection: FC<MarketsSectionProps> = ({
  show, suppliedPositions, borrowedPositions, readOnly,
  filteredSuppliedPositionsCount, protocolName, networkType, chainId,
  findYield, onAddSupply, onAddBorrow,
}) => {
  if (!show) return null;

  return (
    <div className="card-surface">
      <div className="card-body p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {suppliedPositions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-base-content/60 text-sm font-semibold uppercase tracking-wide">Suppliable assets</div>
                {!readOnly && (
                  <button className="btn btn-xs btn-outline" type="button" onClick={onAddSupply}>Deposit</button>
                )}
              </div>
              {suppliedPositions.map(position => (
                <SupplyPosition
                  key={`market-supply-${position.tokenAddress}`}
                  {...position}
                  currentRate={getExternalYieldOverride(position, findYield)}
                  protocolName={protocolName}
                  networkType={networkType}
                  chainId={chainId}
                  hideBalanceColumn
                  availableActions={MARKET_SUPPLY_ACTIONS}
                  showInfoDropdown={false}
                />
              ))}
            </div>
          )}
          {borrowedPositions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-base-content/60 text-sm font-semibold uppercase tracking-wide">Borrowable assets</div>
                {!readOnly && filteredSuppliedPositionsCount > 0 && (
                  <button className="btn btn-xs btn-outline" type="button" onClick={onAddBorrow}>Borrow</button>
                )}
              </div>
              {borrowedPositions.map(position => (
                <BorrowPosition
                  key={`market-borrow-${position.tokenAddress}`}
                  {...position}
                  protocolName={protocolName}
                  networkType={networkType}
                  chainId={chainId}
                  hideBalanceColumn
                  availableActions={MARKET_BORROW_ACTIONS}
                  showInfoDropdown={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
InternalMarketsSection.displayName = "InternalMarketsSection";

/** Supplied assets panel with position list or empty state */
interface SuppliedAssetsPanelProps {
  positions: (ProtocolPosition & { actionsDisabled?: boolean })[];
  protocolName: string;
  networkType: "evm" | "starknet";
  chainId?: number;
  positionManager: PositionManager;
  disableMoveSupply: boolean;
  readOnly: boolean;
  supplyAvailableActions: Record<string, boolean>;
  supplySwapHandlers: Record<string, () => void>;
  expandFirstPositions: boolean;
  adlCollateralToken?: string;
  effectiveShowAll: boolean;
  loopingDisabled: boolean;
  availableCollateralsCount: number;
  debtOptionsCount: number;
  onAddSupply: () => void;
  onOpenMultiply: () => void;
}

const SuppliedAssetsPanel: FC<SuppliedAssetsPanelProps> = ({
  positions, protocolName, networkType, chainId, positionManager,
  disableMoveSupply, readOnly, supplyAvailableActions, supplySwapHandlers,
  expandFirstPositions, adlCollateralToken, effectiveShowAll, loopingDisabled,
  availableCollateralsCount, debtOptionsCount, onAddSupply, onOpenMultiply,
}) => {
  const canLoop = availableCollateralsCount > 0 && debtOptionsCount > 0;
  const loopTitle = canLoop ? "Build a flash-loan loop" : "Supply collateral and have a debt option to build a loop";

  return (
    <div className="h-full">
      <div className="card-surface-hover h-full">
        <div className="card-body flex flex-col p-4">
          <div className="border-base-200/50 mb-1 flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <div className="bg-success h-5 w-1 rounded-full" />
              <span className="text-base-content/60 text-[11px] font-semibold uppercase tracking-widest">Supplied</span>
            </div>
            <div className="count-badge-success">
              <span className="font-mono text-xs font-bold">{positions.length}</span>
              <span className="label-text-xs-muted opacity-70">{positions.length === 1 ? "asset" : "assets"}</span>
            </div>
          </div>
          {positions.length > 0 ? (
            <div className="flex flex-1 flex-col pt-2">
              <div className="space-y-3">
                {positions.map((position, index) => {
                  const key = `supplied-${position.name}-${index}`;
                  return (
                    <div key={key} className="min-h-[60px]">
                      <SupplyPosition
                        {...position}
                        protocolName={protocolName}
                        networkType={networkType}
                        chainId={chainId}
                        position={positionManager}
                        disableMove={disableMoveSupply || readOnly}
                        availableActions={supplyAvailableActions}
                        onSwap={supplySwapHandlers[key]}
                        suppressDisabledMessage
                        defaultExpanded={expandFirstPositions && index === 0}
                        adlActive={adlCollateralToken?.toLowerCase() === position.tokenAddress.toLowerCase()}
                      />
                    </div>
                  );
                })}
              </div>
              {!readOnly && (
                <div className="mt-auto flex flex-col gap-2 pt-4">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <AddButton onClick={onAddSupply} label="Add Supply" />
                    {!loopingDisabled && (
                      <AddButton onClick={onOpenMultiply} label="Add Loop" variant="secondary" disabled={!canLoop} title={loopTitle} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              message={effectiveShowAll ? "No available assets" : "No supplied assets"}
              showAddButton={!readOnly}
              onAdd={onAddSupply}
              addButtonLabel="Supply Assets"
              showLoopButton={!loopingDisabled}
              onAddLoop={onOpenMultiply}
              loopDisabled={!canLoop}
              loopTitle={loopTitle}
            />
          )}
        </div>
      </div>
    </div>
  );
};
SuppliedAssetsPanel.displayName = "SuppliedAssetsPanel";

/** Borrowed assets panel with position list or empty state */
interface BorrowedAssetsPanelProps {
  positions: (ProtocolPosition & { actionsDisabled?: boolean })[];
  protocolName: string;
  networkType: "evm" | "starknet";
  chainId?: number;
  positionManager: PositionManager;
  availableCollaterals: SwapAsset[];
  borrowAvailableActions: Record<string, boolean>;
  borrowCloseHandlers: Record<string, () => void>;
  borrowDebtSwapHandlers: Record<string, () => void>;
  expandFirstPositions: boolean;
  expandedBorrowPositions: Record<string, boolean>;
  borrowExpandToggleHandlers: Record<string, () => void>;
  adlDebtToken?: string;
  readOnly: boolean;
  effectiveShowAll: boolean;
  filteredSuppliedPositionsCount: number;
  onAddBorrow: () => void;
}

const BorrowedAssetsPanel: FC<BorrowedAssetsPanelProps> = ({
  positions, protocolName, networkType, chainId, positionManager,
  availableCollaterals, borrowAvailableActions, borrowCloseHandlers,
  borrowDebtSwapHandlers, expandFirstPositions, expandedBorrowPositions,
  borrowExpandToggleHandlers, adlDebtToken, readOnly, effectiveShowAll,
  filteredSuppliedPositionsCount, onAddBorrow,
}) => (
  <div className="h-full">
    <div className="card-surface-hover h-full">
      <div className="card-body flex flex-col p-4">
        <div className="border-base-200/50 mb-1 flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="bg-error h-5 w-1 rounded-full" />
            <span className="text-base-content/60 text-[11px] font-semibold uppercase tracking-widest">Borrowed</span>
          </div>
          <div className="count-badge-error">
            <span className="font-mono text-xs font-bold">{positions.length}</span>
            <span className="label-text-xs-muted opacity-70">{positions.length === 1 ? "asset" : "assets"}</span>
          </div>
        </div>
        {positions.length > 0 ? (
          <div className="flex flex-1 flex-col pt-2">
            <div className="space-y-3">
              {positions.map((position, index) => {
                const key = `borrowed-${position.name}-${index}`;
                const isExpanded = expandedBorrowPositions[key] ?? (expandFirstPositions && index === 0);
                return (
                  <div key={key} className="min-h-[60px]">
                    <BorrowPosition
                      {...position}
                      protocolName={protocolName}
                      networkType={networkType}
                      chainId={chainId}
                      position={positionManager}
                      availableAssets={position.collaterals || availableCollaterals}
                      availableActions={borrowAvailableActions}
                      onClosePosition={borrowCloseHandlers[key]}
                      onSwap={borrowDebtSwapHandlers[key]}
                      suppressDisabledMessage
                      controlledExpanded={isExpanded}
                      onToggleExpanded={borrowExpandToggleHandlers[key]}
                      adlProtected={adlDebtToken?.toLowerCase() === position.tokenAddress.toLowerCase()}
                    />
                  </div>
                );
              })}
            </div>
            {!readOnly && (
              <div className="mt-auto pt-4">
                <AddButton
                  onClick={onAddBorrow}
                  label="Borrow"
                  disabled={filteredSuppliedPositionsCount === 0}
                  title={filteredSuppliedPositionsCount === 0 ? "Supply assets first to enable borrowing" : undefined}
                />
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            message={effectiveShowAll ? "No available assets" : "No borrowed assets"}
            showAddButton={!readOnly}
            onAdd={onAddBorrow}
            addButtonLabel="Borrow Assets"
            buttonDisabled={filteredSuppliedPositionsCount === 0}
            buttonTitle={filteredSuppliedPositionsCount === 0 ? "Supply assets first to enable borrowing" : undefined}
          />
        )}
      </div>
    </div>
  </div>
);
BorrowedAssetsPanel.displayName = "BorrowedAssetsPanel";

/** Starknet-specific modals */
interface StarknetModalsProps {
  isTokenSelectModalOpen: boolean;
  onCloseTokenSelectModal: () => void;
  starknetSupplyTokens: ReturnType<typeof positionToStarknetToken>[];
  protocolName: string;
  positionManager: PositionManager;
  isTokenBorrowSelectModalOpen: boolean;
  onCloseBorrowSelectModal: () => void;
  starknetBorrowTokens: ReturnType<typeof positionToStarknetToken>[];
  isTokenBorrowModalOpen: boolean;
  onCloseBorrowModal: () => void;
  borrowModalStarkToken: ReturnType<typeof createBorrowModalToken>;
  borrowModalCurrentDebt: number;
  selectedToken: ProtocolPosition | null;
  borrowedPositions: ProtocolPosition[];
  isCloseModalOpen: boolean;
  selectedClosePosition: ProtocolPosition | null;
  onCloseCloseModal: () => void;
  chainId: number;
  availableCollaterals: SwapAsset[];
  isDebtSwapModalOpen: boolean;
  selectedDebtSwapPosition: ProtocolPosition | null;
  onCloseDebtSwapModal: () => void;
}

const StarknetModals: FC<StarknetModalsProps> = ({
  isTokenSelectModalOpen, onCloseTokenSelectModal, starknetSupplyTokens,
  protocolName, positionManager, isTokenBorrowSelectModalOpen,
  onCloseBorrowSelectModal, starknetBorrowTokens, isTokenBorrowModalOpen,
  onCloseBorrowModal, borrowModalStarkToken, borrowModalCurrentDebt,
  selectedToken, borrowedPositions, isCloseModalOpen, selectedClosePosition,
  onCloseCloseModal, chainId, availableCollaterals, isDebtSwapModalOpen,
  selectedDebtSwapPosition, onCloseDebtSwapModal,
}) => (
  <>
    <TokenSelectModalStark isOpen={isTokenSelectModalOpen} onClose={onCloseTokenSelectModal} tokens={starknetSupplyTokens} protocolName={protocolName} position={positionManager} action="deposit" />
    <TokenSelectModalStark isOpen={isTokenBorrowSelectModalOpen} onClose={onCloseBorrowSelectModal} tokens={starknetBorrowTokens} protocolName={protocolName} position={positionManager} />
    {isTokenBorrowModalOpen && (
      <BorrowModalStark
        isOpen={isTokenBorrowModalOpen} onClose={onCloseBorrowModal} token={borrowModalStarkToken}
        protocolName={protocolName} currentDebt={borrowModalCurrentDebt} position={positionManager}
        vesuContext={selectedToken?.vesuContext?.borrow ?? borrowedPositions[0]?.vesuContext?.borrow}
      />
    )}
    {isCloseModalOpen && selectedClosePosition && (
      <CloseWithCollateralEvmModal
        isOpen={isCloseModalOpen} onClose={onCloseCloseModal} protocolName={protocolName} chainId={chainId}
        debtToken={selectedClosePosition.tokenAddress as Address} debtName={selectedClosePosition.name}
        debtIcon={selectedClosePosition.icon} debtDecimals={selectedClosePosition.tokenDecimals || 18}
        debtPrice={selectedClosePosition.tokenPrice} debtBalance={selectedClosePosition.tokenBalance}
        availableCollaterals={selectedClosePosition.collaterals || availableCollaterals}
        context={getProtocolContext(protocolName, selectedClosePosition)}
      />
    )}
    {isDebtSwapModalOpen && selectedDebtSwapPosition && (
      <DebtSwapEvmModal
        isOpen={isDebtSwapModalOpen} onClose={onCloseDebtSwapModal} protocolName={protocolName} chainId={chainId}
        debtFromToken={selectedDebtSwapPosition.tokenAddress as Address} debtFromName={selectedDebtSwapPosition.name}
        debtFromIcon={selectedDebtSwapPosition.icon} debtFromDecimals={selectedDebtSwapPosition.tokenDecimals || 18}
        debtFromPrice={selectedDebtSwapPosition.tokenPrice} currentDebtBalance={selectedDebtSwapPosition.tokenBalance}
        availableAssets={selectedDebtSwapPosition.collaterals || availableCollaterals}
        context={getProtocolContext(protocolName, selectedDebtSwapPosition)}
      />
    )}
  </>
);
StarknetModals.displayName = "StarknetModals";

/** EVM-specific modals */
interface EvmModalsProps {
  isTokenSelectModalOpen: boolean;
  onCloseTokenSelectModal: () => void;
  allSupplyPositions: ProtocolPosition[];
  protocolName: string;
  positionManager: PositionManager;
  chainId?: number;
  isTokenBorrowSelectModalOpen: boolean;
  onCloseBorrowSelectModal: () => void;
  allBorrowPositions: ProtocolPosition[];
  isSwapModalOpen: boolean;
  selectedSwapPosition: ProtocolPosition | null;
  collateralSwapPosition: { name: string; tokenAddress: string; decimals: number; balance: number; type: "supply" } | null;
  onCloseSwapModal: () => void;
  availableCollaterals: SwapAsset[];
  isMultiplyModalOpen: boolean;
  onCloseMultiplyModal: () => void;
  debtOptions: SwapAsset[];
  ltvBps: bigint;
  lltvBps: bigint;
  supplyApyMap: Record<string, number>;
  borrowApyMap: Record<string, number>;
  isAaveProtocol: boolean;
  userEMode: EModeCategory | null | undefined;
  isTokenBorrowModalOpen: boolean;
  onCloseBorrowModal: () => void;
  borrowModalToken: ReturnType<typeof createBorrowModalToken>;
  borrowModalCurrentDebt: number;
}

const EvmModals: FC<EvmModalsProps> = ({
  isTokenSelectModalOpen, onCloseTokenSelectModal, allSupplyPositions,
  protocolName, positionManager, chainId, isTokenBorrowSelectModalOpen,
  onCloseBorrowSelectModal, allBorrowPositions, isSwapModalOpen,
  selectedSwapPosition, collateralSwapPosition, onCloseSwapModal,
  availableCollaterals, isMultiplyModalOpen, onCloseMultiplyModal,
  debtOptions, ltvBps, lltvBps, supplyApyMap, borrowApyMap,
  isAaveProtocol, userEMode, isTokenBorrowModalOpen, onCloseBorrowModal,
  borrowModalToken, borrowModalCurrentDebt,
}) => (
  <>
    <TokenSelectModal isOpen={isTokenSelectModalOpen} onClose={onCloseTokenSelectModal} tokens={allSupplyPositions} protocolName={protocolName} isBorrow={false} position={positionManager} chainId={chainId} />
    <TokenSelectModal isOpen={isTokenBorrowSelectModalOpen} onClose={onCloseBorrowSelectModal} tokens={allBorrowPositions} protocolName={protocolName} isBorrow={true} position={positionManager} chainId={chainId} />
    {isSwapModalOpen && selectedSwapPosition && collateralSwapPosition && (
      <CollateralSwapModal
        isOpen={isSwapModalOpen} onClose={onCloseSwapModal} protocolName={protocolName}
        availableAssets={availableCollaterals} initialFromTokenAddress={selectedSwapPosition.tokenAddress}
        chainId={chainId || 1} position={collateralSwapPosition}
      />
    )}
    {isMultiplyModalOpen && (
      <MultiplyEvmModal
        isOpen={isMultiplyModalOpen} onClose={onCloseMultiplyModal} protocolName={protocolName}
        chainId={chainId || 1} collaterals={availableCollaterals} debtOptions={debtOptions}
        market={getMultiplyMarket(protocolName, availableCollaterals)}
        maxLtvBps={ltvBps > 0n ? ltvBps : 8000n} lltvBps={lltvBps > 0n ? lltvBps : 8500n}
        supplyApyMap={supplyApyMap} borrowApyMap={borrowApyMap}
        eMode={isAaveProtocol ? userEMode : undefined}
      />
    )}
    {isTokenBorrowModalOpen && (
      <BorrowModal
        isOpen={isTokenBorrowModalOpen} onClose={onCloseBorrowModal} token={borrowModalToken}
        protocolName={protocolName} currentDebt={borrowModalCurrentDebt}
        position={positionManager} chainId={chainId}
      />
    )}
  </>
);
EvmModals.displayName = "EvmModals";

/** Renders the correct modals based on network type and readOnly state.
 * Extracted as a plain function to avoid adding conditional complexity to ProtocolView.
 */
function renderProtocolModals(
  networkType: "evm" | "starknet",
  readOnly: boolean,
  starknetProps: StarknetModalsProps,
  evmProps: EvmModalsProps,
): React.ReactNode {
  if (readOnly) return null;
  if (networkType === "starknet") return <StarknetModals {...starknetProps} />;
  return <EvmModals {...evmProps} />;
}

// ============================================================================
// Main ProtocolView component
// ============================================================================

export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number; // USD value
  tokenBalance: bigint; // Raw token amount
  currentRate: number;
  tokenAddress: string;
  tokenPrice?: bigint; // Token price with 8 decimals of precision
  usdPrice?: number; // Token price in USD
  tokenDecimals?: number; // Token decimals
  tokenSymbol?: string; // Token symbol for price feed selection
  collaterals?: SwapAsset[]; // Optional collateral assets tied to the position (e.g., Compound)
  collateralView?: React.ReactNode;
  collateralValue?: number; // Optional collateral value (used by borrowed positions)
  vesuContext?: {
    deposit?: VesuContext;
    withdraw?: VesuContext;
    borrow?: VesuContext;
    repay?: VesuContext;
  };
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  protocolContext?: string;
  moveSupport?: {
    preselectedCollaterals?: CollateralWithAmount[];
    disableCollateralSelection?: boolean;
  };
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
}

interface ProtocolViewProps {
  protocolName: string;
  protocolIcon: string;
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  hideUtilization?: boolean;
  forceShowAll?: boolean; // If true, always show all assets regardless of showAll toggle
  networkType: "evm" | "starknet"; // Specify which network this protocol view is for
  disableMoveSupply?: boolean;
  readOnly?: boolean; // If true, disable all interactive actions and modals
  expandFirstPositions?: boolean; // If true, expand the first supply and borrow rows by default
  chainId?: number;
  enabledFeatures?: {
    swap?: boolean;
    move?: boolean;
  };
  ltvBps?: bigint;
  lltvBps?: bigint;
  disableMarkets?: boolean;
  inlineMarkets?: boolean;
  disableLoop?: boolean;
  /** If true, start collapsed and auto-expand when positions are found */
  autoExpandOnPositions?: boolean;
  /** Whether initial data load has completed */
  hasLoadedOnce?: boolean;
  /** Optional element to render in the header (e.g., E-Mode toggle) */
  headerElement?: React.ReactNode;
  /** Collateral token address protected by ADL - shows left border on matching supply positions */
  adlCollateralToken?: string;
  /** Debt token address protected by ADL - shows right border on matching borrow positions */
  adlDebtToken?: string;
}

export const ProtocolView: FC<ProtocolViewProps> = ({
  protocolName,
  protocolIcon,
  suppliedPositions,
  borrowedPositions,
  hideUtilization = false,
  forceShowAll = false,
  networkType,
  disableMoveSupply = false,
  readOnly = false,
  expandFirstPositions = true,
  chainId,
  enabledFeatures = { swap: false, move: true },
  ltvBps = 0n,
  lltvBps = 0n,
  disableMarkets = false,
  inlineMarkets = false,
  disableLoop = false,
  autoExpandOnPositions = false,
  hasLoadedOnce = true,
  headerElement,
  adlCollateralToken,
  adlDebtToken,
}) => {
  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  const [isTokenSelectModalOpen, setIsTokenSelectModalOpen] = useState(false);
  const [isTokenBorrowModalOpen, setIsTokenBorrowModalOpen] = useState(false);
  const [isTokenBorrowSelectModalOpen, setIsTokenBorrowSelectModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ProtocolPosition | null>(null);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [selectedSwapPosition, setSelectedSwapPosition] = useState<ProtocolPosition | null>(null);
  const [isMultiplyModalOpen, setIsMultiplyModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedClosePosition, setSelectedClosePosition] = useState<ProtocolPosition | null>(null);
  const [isDebtSwapModalOpen, setIsDebtSwapModalOpen] = useState(false);
  const [selectedDebtSwapPosition, setSelectedDebtSwapPosition] = useState<ProtocolPosition | null>(null);
  // Start collapsed if autoExpandOnPositions is enabled
  const [isCollapsed, setIsCollapsed] = useState(autoExpandOnPositions);
  // Track which borrow positions are expanded (for collateral views)
  const [expandedBorrowPositions, setExpandedBorrowPositions] = useState<Record<string, boolean>>({});

  // Reset collapsed state when chainId changes (network switch)
  useEffect(() => {
    if (autoExpandOnPositions) {
      setIsCollapsed(true); // Reset to collapsed, will expand when positions load
    }
    // Reset expanded borrow positions when chain changes
    setExpandedBorrowPositions({});
  }, [chainId, autoExpandOnPositions]);

  const handleSwap = useCallback((position: ProtocolPosition) => {
    if (readOnly) return;
    setSelectedSwapPosition(position);
    setIsSwapModalOpen(true);
  }, [readOnly]);

  const handleCloseWithCollateral = useCallback((position: ProtocolPosition) => {
    if (readOnly) return;
    setSelectedClosePosition(position);
    setIsCloseModalOpen(true);
  }, [readOnly]);

  const handleDebtSwap = useCallback((position: ProtocolPosition) => {
    if (readOnly) return;
    setSelectedDebtSwapPosition(position);
    setIsDebtSwapModalOpen(true);
  }, [readOnly]);

  // E-Mode handling for Aave - fetch user's E-Mode and filter assets
  const isAaveProtocol = protocolName.toLowerCase().includes("aave");
  const { userEMode } = useAaveEMode(isAaveProtocol && chainId ? chainId : undefined);

  // Fetch reserve configs for Aave collateral breakdown tooltip
  const aaveCollateralTokens = useMemo(() => {
    if (!isAaveProtocol) return [];
    return suppliedPositions
      .filter(p => p.balance > 0)
      .map(p => p.tokenAddress as `0x${string}`);
  }, [isAaveProtocol, suppliedPositions]);

  const { configs: reserveConfigs } = useAaveReserveConfigs(
    aaveCollateralTokens,
    chainId,
    isAaveProtocol && aaveCollateralTokens.length > 0
  );

  // Build collateral breakdown for LTV tooltip
  const collateralBreakdown = useMemo((): CollateralBreakdownItem[] => {
    if (!isAaveProtocol || reserveConfigs.length === 0) return [];

    const positionsWithBalance = suppliedPositions.filter(p => p.balance > 0);
    const totalCollateralUsd = positionsWithBalance.reduce((sum, p) => sum + p.balance, 0);

    return positionsWithBalance.map(position => {
      const config = reserveConfigs.find(
        c => c.token.toLowerCase() === position.tokenAddress.toLowerCase()
      );
      return {
        name: position.name,
        icon: position.icon,
        valueUsd: position.balance,
        ltvBps: config ? Number(config.ltv) : 0,
        lltvBps: config ? Number(config.liquidationThreshold) : 0,
        weightPct: totalCollateralUsd > 0 ? (position.balance / totalCollateralUsd) * 100 : 0,
      };
    }).filter(item => item.valueUsd > 0);
  }, [isAaveProtocol, reserveConfigs, suppliedPositions]);

  // Calculate total debt for the breakdown tooltip
  const totalDebtUsd = useMemo(() => {
    return borrowedPositions.reduce((sum, p) => sum + Math.abs(p.balance), 0);
  }, [borrowedPositions]);

  // Fetch external yields (PT tokens, LSTs, Maple, etc.)
  const { findYield } = useExternalYields(chainId);

  // Determine if user has any positions with balance
  const hasPositions = useMemo(() => {
    const hasSupply = suppliedPositions.some(p => p.balance > 0);
    const hasBorrow = borrowedPositions.some(p => p.balance < 0 || (p.collateralValue ?? 0) > 0);
    return hasSupply || hasBorrow;
  }, [suppliedPositions, borrowedPositions]);

  // Auto-expand when positions are found (Option B: start collapsed, expand on positions)
  useEffect(() => {
    if (!autoExpandOnPositions) return;
    if (!hasLoadedOnce) return; // Wait for initial load to complete

    if (hasPositions) {
      setIsCollapsed(false); // Expand when positions exist
    } else {
      setIsCollapsed(true); // Stay/become collapsed when no positions
    }
  }, [autoExpandOnPositions, hasLoadedOnce, hasPositions]);


  // E-Mode filter using extracted helper
  const filterByEMode = useMemo(() => createEModeFilter(userEMode), [userEMode]);

  // Convert suppliedPositions to BasicCollateral for the modal
  const availableCollaterals = useMemo(() => {
    const all = suppliedPositions.map(positionToSwapAsset);
    return isAaveProtocol ? filterByEMode(all) : all;
  }, [suppliedPositions, isAaveProtocol, filterByEMode]);

  const debtOptions = useMemo(() => {
    const mapped = borrowedPositions.map(positionToSwapAsset);
    const result = mapped.length > 0 ? mapped : availableCollaterals;
    return isAaveProtocol ? filterByEMode(result) : result;
  }, [availableCollaterals, borrowedPositions, isAaveProtocol, filterByEMode]);

  // APY maps for multiply modal - PT tokens get Pendle fixed yields automatically
  const apyMapTokens = useMemo(() =>
    suppliedPositions.map(p => ({
      address: p.tokenAddress,
      symbol: p.name,
      supplyRate: p.currentRate,
      borrowRate: borrowedPositions.find(b => b.tokenAddress.toLowerCase() === p.tokenAddress.toLowerCase())?.currentRate || 0,
    })),
    [suppliedPositions, borrowedPositions]
  );
  const { supplyApyMap, borrowApyMap } = usePTEnhancedApyMaps(chainId, apyMapTokens);

  // Calculate net balance using extracted helper
  const netBalance = useMemo(
    () => calculateNetBalance(suppliedPositions, borrowedPositions),
    [suppliedPositions, borrowedPositions]
  );

  // Calculate utilization metrics using extracted helper
  const { utilizationPercentage } = useMemo(
    () => calculateUtilizationMetrics(suppliedPositions, borrowedPositions, ltvBps, lltvBps),
    [borrowedPositions, suppliedPositions, lltvBps, ltvBps]
  );


  const positionManager = useMemo(
    () => PositionManager.fromPositions(suppliedPositions, borrowedPositions, Number(ltvBps)),
    [suppliedPositions, borrowedPositions, ltvBps],
  );

  // Create supplied positions with PT yields applied for net yield calculation
  const suppliedPositionsWithPTYields = useMemo(() => {
    return suppliedPositions.map(p => ({
      ...p,
      currentRate: getExternalYieldOverride(p, findYield),
    }));
  }, [suppliedPositions, findYield]);

  const { netYield30d, netApyPercent } = useMemo(
    () =>
      calculateNetYieldMetrics(suppliedPositionsWithPTYields, borrowedPositions, {
        netBalanceOverride: netBalance,
      }),
    [suppliedPositionsWithPTYields, borrowedPositions, netBalance],
  );

  // Keep Markets section closed when forceShowAll is active to avoid auto-mounting extra hooks
  useEffect(() => {
    if (forceShowAll) {
      setIsMarketsOpen(false);
    }
  }, [forceShowAll]);

  // Use effective showAll state (component state OR forced from props)
  const effectiveShowAll = isMarketsOpen || forceShowAll;

  const loopingDisabled = disableLoop || protocolName.toLowerCase().includes("compound");

  // Filter positions based on wheter user has balance.
  // If inlineMarkets is true (e.g. Compound), clicking "Markets" (isMarketsOpen) should reveal all assets in these lists.
  // Otherwise (Aave), clicking "Markets" opens a separate section, so we keep these lists filtered to user positions.
  const showAllInLists = forceShowAll || (inlineMarkets && isMarketsOpen);

  // Filter and transform supplied positions
  const filteredSuppliedPositions = useMemo(() => {
    const basePositions = showAllInLists
      ? suppliedPositions
      : suppliedPositions.filter(p => p.balance > 0);

    return basePositions.map(p => {
      const currentRate = getExternalYieldOverride(p, findYield);
      const positionWithRate = { ...p, currentRate };
      return applyReadOnlyToPosition(positionWithRate, readOnly);
    });
  }, [showAllInLists, suppliedPositions, findYield, readOnly]);

  // Filter and transform borrowed positions
  const filteredBorrowedPositions = useMemo(() => {
    const basePositions = showAllInLists
      ? borrowedPositions
      : borrowedPositions.filter(p => p.balance < 0 || (p.collateralValue ?? 0) > 0);

    return basePositions.map(p => applyReadOnlyToPosition(p, readOnly));
  }, [showAllInLists, borrowedPositions, readOnly]);

  // Assuming tokenNameToLogo is defined elsewhere, we use a fallback here.
  // const getProtocolLogo = (protocol: string) => `/logos/${protocol.toLowerCase()}-logo.svg`;

  // Handle opening the token select modal for supply
  const handleAddSupply = useCallback(() => {
    if (readOnly) return;
    setIsTokenSelectModalOpen(true);
  }, [readOnly]);

  const handleOpenMultiply = useCallback(() => {
    if (readOnly) return;
    setIsMultiplyModalOpen(true);
  }, [readOnly]);

  // Handle closing the token select modal for supply
  const handleCloseTokenSelectModal = useCallback(() => {
    setIsTokenSelectModalOpen(false);
  }, []);

  // Handle opening the token select modal for borrowing
  const handleAddBorrow = useCallback(() => {
    if (readOnly) return;
    setIsTokenBorrowSelectModalOpen(true);
  }, [readOnly]);

  // Handle closing the token select modal for borrowing
  const handleCloseBorrowSelectModal = useCallback(() => {
    setIsTokenBorrowSelectModalOpen(false);
  }, []);

  // Handle opening the borrow modal directly (obsolete, but keeping for reference)
  // const handleOpenBorrowModal = () => setIsTokenBorrowModalOpen(true);

  // Handle closing the borrow modal
  const handleCloseBorrowModal = useCallback(() => {
    setIsTokenBorrowModalOpen(false);
    setSelectedToken(null);
  }, []);

  // Toggle collapse state
  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Toggle markets open state (with stopPropagation)
  // Also expand protocol if collapsed when opening markets
  const handleToggleMarkets = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMarketsOpen(prev => {
      const newState = !prev;
      // If opening markets and protocol is collapsed, expand it
      if (newState && isCollapsed) {
        setIsCollapsed(false);
      }
      return newState;
    });
  }, [isCollapsed]);

  // Stop propagation handler
  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Modal close handlers
  const handleCloseSwapModal = useCallback(() => {
    setIsSwapModalOpen(false);
  }, []);

  const handleCloseMultiplyModal = useCallback(() => {
    setIsMultiplyModalOpen(false);
  }, []);

  const handleCloseCloseModal = useCallback(() => {
    setIsCloseModalOpen(false);
    setSelectedClosePosition(null);
  }, []);

  const handleCloseDebtSwapModal = useCallback(() => {
    setIsDebtSwapModalOpen(false);
    setSelectedDebtSwapPosition(null);
  }, []);

  // Get all possible supply positions by using showAll setting
  // This ensures we include all tokens, even those with zero balance
  const allSupplyPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (effectiveShowAll) return suppliedPositions;

    // Otherwise, temporarily get all positions for the token modal
    return suppliedPositions;
  }, [suppliedPositions, effectiveShowAll]);

  // Get all possible borrow positions by using showAll setting
  const allBorrowPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (effectiveShowAll) return borrowedPositions;

    // Otherwise, temporarily get all positions for the token modal
    return borrowedPositions;
  }, [borrowedPositions, effectiveShowAll]);

  // Handle supply token selection for Starknet
  // Starknet deposit selection handled within TokenSelectModalStark in this view

  // Handle deposit modal close
  // const handleCloseDepositModal = () => undefined;

  // Memoized availableActions objects to avoid inline object creation
  const supplyAvailableActions = useMemo(() =>
    readOnly
      ? READONLY_SUPPLY_ACTIONS
      : { deposit: true, withdraw: true, move: enabledFeatures.move ?? true, swap: enabledFeatures.swap ?? false },
    [readOnly, enabledFeatures.move, enabledFeatures.swap]
  );

  const borrowAvailableActions = useMemo(() =>
    readOnly
      ? READONLY_BORROW_ACTIONS
      : { borrow: true, repay: true, move: enabledFeatures.move ?? true, close: true, swap: enabledFeatures.swap ?? true },
    [readOnly, enabledFeatures.move, enabledFeatures.swap]
  );

  // Memoized swap handlers for each supply position
  const supplySwapHandlers = useMemo(() => {
    return filteredSuppliedPositions.reduce<Record<string, () => void>>((acc, position, index) => {
      const key = `supplied-${position.name}-${index}`;
      acc[key] = () => handleSwap(position);
      return acc;
    }, {});
  }, [filteredSuppliedPositions, handleSwap]);

  // Memoized close and debt swap handlers for each borrow position
  const borrowCloseHandlers = useMemo(() => {
    return filteredBorrowedPositions.reduce<Record<string, () => void>>((acc, position, index) => {
      const key = `borrowed-${position.name}-${index}`;
      acc[key] = () => handleCloseWithCollateral(position);
      return acc;
    }, {});
  }, [filteredBorrowedPositions, handleCloseWithCollateral]);

  const borrowDebtSwapHandlers = useMemo(() => {
    return filteredBorrowedPositions.reduce<Record<string, () => void>>((acc, position, index) => {
      const key = `borrowed-${position.name}-${index}`;
      acc[key] = () => handleDebtSwap(position);
      return acc;
    }, {});
  }, [filteredBorrowedPositions, handleDebtSwap]);

  // Toggle handlers for borrow position expansion (for collateral views)
  const borrowExpandToggleHandlers = useMemo(() => {
    return filteredBorrowedPositions.reduce<Record<string, () => void>>((acc, position, index) => {
      const key = `borrowed-${position.name}-${index}`;
      acc[key] = () => {
        setExpandedBorrowPositions(prev => ({
          ...prev,
          [key]: !prev[key],
        }));
      };
      return acc;
    }, {});
  }, [filteredBorrowedPositions]);

  // Memoized tokens for Starknet TokenSelectModalStark - Supply
  const starknetSupplyTokens = useMemo(
    () => allSupplyPositions.map(pos => positionToStarknetToken(pos, true)),
    [allSupplyPositions]
  );

  // Memoized tokens for Starknet TokenSelectModalStark - Borrow
  const starknetBorrowTokens = useMemo(
    () => allBorrowPositions.map(pos => positionToStarknetToken(pos, false)),
    [allBorrowPositions]
  );

  // Memoized token prop for BorrowModalStark
  const borrowModalStarkToken = useMemo(
    () => createBorrowModalToken(selectedToken, borrowedPositions[0]),
    [selectedToken, borrowedPositions]
  );

  // Memoized currentDebt for BorrowModals
  const borrowModalCurrentDebt = useMemo(
    () => calculateCurrentDebt(selectedToken, borrowedPositions[0]),
    [selectedToken, borrowedPositions]
  );

  // Memoized token prop for BorrowModal (EVM)
  const borrowModalToken = useMemo(
    () => createBorrowModalToken(selectedToken, borrowedPositions[0]),
    [selectedToken, borrowedPositions]
  );

  // Memoized position prop for CollateralSwapModal
  const collateralSwapPosition = useMemo(() =>
    selectedSwapPosition
      ? {
          name: selectedSwapPosition.name,
          tokenAddress: selectedSwapPosition.tokenAddress,
          decimals: selectedSwapPosition.tokenDecimals || 18,
          balance: selectedSwapPosition.balance,
          type: "supply" as const
        }
      : null,
    [selectedSwapPosition]
  );

  // Whether the markets section (non-inline) should be shown
  const showMarketsSection = isMarketsOpen && !isCollapsed && !disableMarkets && !inlineMarkets;

  return (
    <div className={`hide-scrollbar flex w-full flex-col ${isCollapsed ? 'p-1' : 'space-y-2 p-3'}`}>
      {/* Protocol Header Card */}
      <div className="header-surface shadow-[inset_3px_0_0_0_rgba(255,255,255,0.12)]" onClick={handleToggleCollapse}>
        <div className="card-body px-4 py-3 sm:px-5 sm:py-3">
          <ProtocolHeaderMobile
            protocolIcon={protocolIcon} protocolName={protocolName} forceShowAll={forceShowAll}
            disableMarkets={disableMarkets} isMarketsOpen={isMarketsOpen} onToggleMarkets={handleToggleMarkets}
            readOnly={readOnly} isCollapsed={isCollapsed} hideUtilization={hideUtilization}
            netBalance={netBalance} netYield30d={netYield30d} netApyPercent={netApyPercent}
            utilizationPercentage={utilizationPercentage} headerElement={headerElement}
            onStopPropagation={handleStopPropagation}
          />
          <ProtocolHeaderDesktop
            protocolIcon={protocolIcon} protocolName={protocolName} forceShowAll={forceShowAll}
            disableMarkets={disableMarkets} isMarketsOpen={isMarketsOpen} onToggleMarkets={handleToggleMarkets}
            readOnly={readOnly} isCollapsed={isCollapsed} hideUtilization={hideUtilization}
            netBalance={netBalance} netYield30d={netYield30d} netApyPercent={netApyPercent}
            utilizationPercentage={utilizationPercentage} collateralBreakdown={collateralBreakdown}
            totalDebtUsd={totalDebtUsd} headerElement={headerElement}
            onStopPropagation={handleStopPropagation}
          />
        </div>
      </div>

      {/* Markets Section - expandable (only if not inlineMarkets) */}
      <InternalMarketsSection
        show={showMarketsSection}
        suppliedPositions={suppliedPositions}
        borrowedPositions={borrowedPositions}
        readOnly={readOnly}
        filteredSuppliedPositionsCount={filteredSuppliedPositions.length}
        protocolName={protocolName}
        networkType={networkType}
        chainId={chainId}
        findYield={findYield}
        onAddSupply={handleAddSupply}
        onAddBorrow={handleAddBorrow}
      />

      {/* Positions Container - collapsible with animation */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={MOTION_INITIAL}
            animate={MOTION_ANIMATE}
            exit={MOTION_EXIT}
            transition={MOTION_TRANSITION}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-4 pt-1 xl:grid-cols-2">
              <SuppliedAssetsPanel
                positions={filteredSuppliedPositions}
                protocolName={protocolName}
                networkType={networkType}
                chainId={chainId}
                positionManager={positionManager}
                disableMoveSupply={disableMoveSupply}
                readOnly={readOnly}
                supplyAvailableActions={supplyAvailableActions}
                supplySwapHandlers={supplySwapHandlers}
                expandFirstPositions={expandFirstPositions}
                adlCollateralToken={adlCollateralToken}
                effectiveShowAll={effectiveShowAll}
                loopingDisabled={loopingDisabled}
                availableCollateralsCount={availableCollaterals.length}
                debtOptionsCount={debtOptions.length}
                onAddSupply={handleAddSupply}
                onOpenMultiply={handleOpenMultiply}
              />
              <BorrowedAssetsPanel
                positions={filteredBorrowedPositions}
                protocolName={protocolName}
                networkType={networkType}
                chainId={chainId}
                positionManager={positionManager}
                availableCollaterals={availableCollaterals}
                borrowAvailableActions={borrowAvailableActions}
                borrowCloseHandlers={borrowCloseHandlers}
                borrowDebtSwapHandlers={borrowDebtSwapHandlers}
                expandFirstPositions={expandFirstPositions}
                expandedBorrowPositions={expandedBorrowPositions}
                borrowExpandToggleHandlers={borrowExpandToggleHandlers}
                adlDebtToken={adlDebtToken}
                readOnly={readOnly}
                effectiveShowAll={effectiveShowAll}
                filteredSuppliedPositionsCount={filteredSuppliedPositions.length}
                onAddBorrow={handleAddBorrow}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals - Conditional based on network type */}
      {renderProtocolModals(networkType, readOnly, {
        isTokenSelectModalOpen, onCloseTokenSelectModal: handleCloseTokenSelectModal,
        starknetSupplyTokens, protocolName, positionManager,
        isTokenBorrowSelectModalOpen, onCloseBorrowSelectModal: handleCloseBorrowSelectModal,
        starknetBorrowTokens, isTokenBorrowModalOpen, onCloseBorrowModal: handleCloseBorrowModal,
        borrowModalStarkToken, borrowModalCurrentDebt, selectedToken, borrowedPositions,
        isCloseModalOpen, selectedClosePosition, onCloseCloseModal: handleCloseCloseModal,
        chainId: chainId || 1, availableCollaterals,
        isDebtSwapModalOpen, selectedDebtSwapPosition, onCloseDebtSwapModal: handleCloseDebtSwapModal,
      }, {
        isTokenSelectModalOpen, onCloseTokenSelectModal: handleCloseTokenSelectModal,
        allSupplyPositions, protocolName, positionManager, chainId,
        isTokenBorrowSelectModalOpen, onCloseBorrowSelectModal: handleCloseBorrowSelectModal,
        allBorrowPositions, isSwapModalOpen, selectedSwapPosition, collateralSwapPosition,
        onCloseSwapModal: handleCloseSwapModal, availableCollaterals,
        isMultiplyModalOpen, onCloseMultiplyModal: handleCloseMultiplyModal,
        debtOptions, ltvBps, lltvBps, supplyApyMap, borrowApyMap,
        isAaveProtocol, userEMode, isTokenBorrowModalOpen,
        onCloseBorrowModal: handleCloseBorrowModal, borrowModalToken, borrowModalCurrentDebt,
      })}
    </div>
  );
};

// Added display name to fix linting issue
ProtocolView.displayName = "ProtocolView";

// Static example data for ExampleProtocolView
const EXAMPLE_SUPPLIED_POSITIONS: ProtocolPosition[] = [
  {
    icon: "/logos/ethereum-logo.svg",
    name: "ETH",
    balance: 5000.75,
    tokenBalance: BigInt(2.5 * 10 ** 18),
    currentRate: 2.8,
    tokenAddress: "0x0000000000000000000000000000000000000000",
  },
];

const EXAMPLE_BORROWED_POSITIONS: ProtocolPosition[] = [
  {
    icon: "/logos/dai-logo.svg",
    name: "DAI",
    balance: -2500.25,
    tokenBalance: BigInt(2500.25 * 10 ** 18),
    currentRate: 4.2,
    tokenAddress: "0x0000000000000000000000000000000000000000",
  },
  {
    icon: "/logos/usdc-logo.svg",
    name: "USDC",
    balance: -1000.5,
    tokenBalance: BigInt(1000.5 * 10 ** 6), // USDC has 6 decimals
    currentRate: 3.5,
    tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  },
];

export const ExampleProtocolView: FC = () => {
  return (
    <ProtocolView
      protocolName="Aave V3"
      protocolIcon="/logos/aave-logo.svg"
      ltvBps={6500n}
      lltvBps={8000n}
      suppliedPositions={EXAMPLE_SUPPLIED_POSITIONS}
      borrowedPositions={EXAMPLE_BORROWED_POSITIONS}
      networkType="evm"
    />
  );
};

ExampleProtocolView.displayName = "ExampleProtocolView";
