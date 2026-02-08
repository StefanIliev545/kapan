"use client";

import { FC, ReactNode } from "react";
import Image from "next/image";
import { ChevronDownIcon, ChevronUpIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import {
  getValueColorClass,
  getApyColorClass,
  formatMetricValue,
  formatApyValue,
  MetricColors,
} from "~~/utils/protocolMetrics";

// Static image error handler
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).src = "/logos/default.svg";
};

/**
 * Configuration for a metric displayed in the protocol header
 */
export interface HeaderMetric {
  /** Label shown above the value */
  label: string;
  /** Short label for mobile (optional, defaults to label) */
  mobileLabel?: string;
  /** The metric value */
  value: number | null;
  /** Type of metric - determines formatting and coloring */
  type: "currency" | "apy" | "custom";
  /** Custom render function for complex displays (e.g., HealthStatus) */
  customRender?: (hasData: boolean) => ReactNode;
}

/**
 * Props for BaseProtocolHeader component
 */
export interface BaseProtocolHeaderProps {
  /** Protocol display name */
  protocolName: string;
  /** Path to protocol icon */
  protocolIcon: string;
  /** Alt text for icon */
  iconAlt?: string;
  /** URL to the protocol's dapp (makes name clickable) */
  protocolUrl?: string;

  /** Whether the header is collapsed */
  isCollapsed: boolean;
  /** Whether the markets section is open */
  isMarketsOpen: boolean;
  /** Callback when header is clicked to toggle collapse */
  onToggleCollapsed: () => void;
  /** Callback when markets button is clicked */
  onToggleMarkets: (e: React.MouseEvent) => void;

  /** Whether user has positions (affects metric display) */
  hasPositions: boolean;

  /** Array of metrics to display (exactly 4 recommended for alignment across protocols) */
  metrics: HeaderMetric[];

  /** Optional extra content to render in the header (e.g., E-Mode toggle) */
  headerExtra?: ReactNode;

  /** Optional custom class for the outer container */
  className?: string;
}

/**
 * Single metric display component for mobile layout
 */
const MobileMetric: FC<{
  metric: HeaderMetric;
  hasPositions: boolean;
}> = ({ metric, hasPositions }) => {
  const label = metric.mobileLabel || metric.label;

  if (metric.customRender) {
    return (
      <div className="flex flex-col items-center py-1">
        <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">
          {label}
        </span>
        {metric.customRender(hasPositions)}
      </div>
    );
  }

  const colorClass = metric.type === "apy"
    ? getApyColorClass(hasPositions, metric.value)
    : metric.type === "currency"
      ? getValueColorClass(hasPositions, metric.value ?? 0)
      : hasPositions ? "text-base-content" : MetricColors.MUTED;

  const formattedValue = metric.type === "apy"
    ? formatApyValue(hasPositions, metric.value)
    : metric.type === "currency"
      ? formatMetricValue(hasPositions, metric.value ?? 0)
      : hasPositions ? String(metric.value ?? "—") : "—";

  return (
    <div className="flex flex-col items-center py-1">
      <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider">
        {label}
      </span>
      <span className={`font-mono text-xs font-bold tabular-nums ${colorClass}`}>
        {formattedValue}
      </span>
    </div>
  );
};

/**
 * Single metric display component for desktop layout
 */
const DesktopMetric: FC<{
  metric: HeaderMetric;
  hasPositions: boolean;
}> = ({ metric, hasPositions }) => {
  if (metric.customRender) {
    return (
      <div className="hover:bg-base-200/30 group flex min-w-[88px] flex-col items-center gap-0.5 rounded-lg px-3 py-0.5 transition-colors">
        <span className="label-text-xs-semibold">{metric.label}</span>
        {metric.customRender(hasPositions)}
      </div>
    );
  }

  const colorClass = metric.type === "apy"
    ? getApyColorClass(hasPositions, metric.value)
    : metric.type === "currency"
      ? getValueColorClass(hasPositions, metric.value ?? 0)
      : hasPositions ? "text-base-content" : MetricColors.MUTED;

  const formattedValue = metric.type === "apy"
    ? formatApyValue(hasPositions, metric.value)
    : metric.type === "currency"
      ? formatMetricValue(hasPositions, metric.value ?? 0)
      : hasPositions ? String(metric.value ?? "—") : "—";

  return (
    <div className="hover:bg-base-200/30 group flex min-w-[88px] flex-col items-center gap-0.5 rounded-lg px-3 py-0.5 transition-colors">
      <span className="label-text-xs-semibold">{metric.label}</span>
      <span className={`font-mono text-[11px] font-bold tabular-nums tracking-tight ${colorClass}`}>
        {formattedValue}
      </span>
    </div>
  );
};

/**
 * Shared protocol header component for Morpho, Euler, and similar protocol views.
 * Provides consistent layout with collapsible state and markets toggle.
 *
 * @example
 * ```tsx
 * <BaseProtocolHeader
 *   protocolName="Morpho Blue"
 *   protocolIcon="/logos/morpho.svg"
 *   isCollapsed={isCollapsed}
 *   isMarketsOpen={isMarketsOpen}
 *   onToggleCollapsed={toggleCollapsed}
 *   onToggleMarkets={toggleMarketsOpen}
 *   hasPositions={hasPositions}
 *   metrics={[
 *     { label: "Balance", value: metrics.netBalance, type: "currency" },
 *     { label: "30D Yield", mobileLabel: "30D", value: metrics.netYield30d, type: "currency" },
 *     { label: "Net APY", value: metrics.netApyPercent, type: "apy" },
 *     { label: "LTV", value: metrics.avgUtilization, type: "custom", customRender: (hasData) =>
 *       hasData ? <HealthStatus utilizationPercentage={metrics.avgUtilization} /> : <span>—</span>
 *     },
 *   ]}
 * />
 * ```
 */
export const BaseProtocolHeader: FC<BaseProtocolHeaderProps> = ({
  protocolName,
  protocolIcon,
  iconAlt,
  protocolUrl,
  isCollapsed,
  isMarketsOpen,
  onToggleCollapsed,
  onToggleMarkets,
  hasPositions,
  metrics,
  headerExtra,
  className = "",
}) => {
  const altText = iconAlt || `${protocolName} icon`;

  return (
    <div
      className={`card-surface-interactive border-t-primary/40 border-t-[3px] shadow-lg sm:border-t-0 sm:border-l-[3px] sm:border-l-primary/40 ${className}`}
      onClick={onToggleCollapsed}
    >
      <div className="card-body px-3 py-1.5 sm:px-5 sm:py-2">
        {/* Mobile Layout (< sm) */}
        <div className="space-y-1.5 sm:hidden">
          {/* Row 1: Protocol icon + name (left), Markets + chevron (right) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="token-icon-wrapper-md">
                <Image
                  src={protocolIcon}
                  alt={altText}
                  width={20}
                  height={20}
                  className="object-contain drop-shadow-sm"
                  onError={handleImageError}
                />
              </div>
              {protocolUrl ? (
                <a
                  href={protocolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link flex items-center gap-1 text-sm font-bold tracking-tight hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {protocolName}
                  <ArrowTopRightOnSquareIcon className="size-3 opacity-0 transition-opacity group-hover/link:opacity-60" />
                </a>
              ) : (
                <span className="text-sm font-bold tracking-tight">{protocolName}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {headerExtra}
              <button
                className="btn btn-xs btn-ghost gap-0.5"
                type="button"
                onClick={onToggleMarkets}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider">Markets</span>
                {isMarketsOpen ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
              </button>
              <ChevronDownIcon
                className={`text-base-content/40 size-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </div>
          </div>
          {/* Row 2: Stats spread horizontally, centered */}
          <div className="flex items-center justify-center gap-4 px-2">
            {metrics.slice(0, 4).map((metric, idx) => (
              <MobileMetric key={idx} metric={metric} hasPositions={hasPositions} />
            ))}
          </div>
        </div>

        {/* Desktop Layout (>= sm) — CSS grid with fixed columns for cross-protocol alignment */}
        <div
          className="hidden items-center sm:grid"
          style={{ gridTemplateColumns: "160px 1px repeat(4, 1fr) auto" }}
        >
          {/* Protocol name + icon — fixed-width column */}
          <div className="flex items-center gap-3">
            <div className="token-icon-wrapper-lg">
              <Image
                src={protocolIcon}
                alt={altText}
                width={24}
                height={24}
                className="object-contain drop-shadow-sm"
                onError={handleImageError}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="label-text-xs-semibold">Protocol</span>
              {protocolUrl ? (
                <a
                  href={protocolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link flex items-center gap-1 whitespace-nowrap text-sm font-bold tracking-tight hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {protocolName}
                  <ArrowTopRightOnSquareIcon className="size-3 opacity-0 transition-opacity group-hover/link:opacity-60" />
                </a>
              ) : (
                <span className="whitespace-nowrap text-sm font-bold tracking-tight">{protocolName}</span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="via-base-300 h-10 w-px bg-gradient-to-b from-transparent to-transparent" />

          {/* Stats — always 4 grid cells, padded with empty slots if fewer metrics */}
          {Array.from({ length: 4 }, (_, idx) => {
            const metric = metrics[idx];
            if (!metric) {
              return <div key={idx} />;
            }
            return (
              <div key={idx} className="flex justify-center">
                <DesktopMetric metric={metric} hasPositions={hasPositions} />
              </div>
            );
          })}

          {/* Actions (Markets button + collapse indicator) */}
          <div className="border-base-300/50 flex items-center gap-2.5 border-l pl-2">
            {headerExtra}
            <button
              className="btn btn-sm btn-ghost gap-1.5"
              type="button"
              onClick={onToggleMarkets}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest">Markets</span>
              {isMarketsOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
            </button>
            <ChevronDownIcon
              className={`text-base-content/40 size-5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
