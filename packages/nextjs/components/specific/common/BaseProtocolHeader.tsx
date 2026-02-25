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

/** Resolve metric color + formatted value */
function resolveMetric(metric: HeaderMetric, hasPositions: boolean) {
  const colorClass = metric.type === "apy"
    ? getApyColorClass(hasPositions, metric.value)
    : metric.type === "currency"
      ? getValueColorClass(hasPositions, metric.value ?? 0)
      : hasPositions ? "text-base-content" : MetricColors.MUTED;

  const formattedValue = metric.type === "apy"
    ? formatApyValue(hasPositions, metric.value)
    : metric.type === "currency"
      ? formatMetricValue(hasPositions, metric.value ?? 0)
      : hasPositions ? String(metric.value ?? "\u2014") : "\u2014";

  return { colorClass, formattedValue };
}

/**
 * Single metric display — mobile
 */
const MobileMetric: FC<{ metric: HeaderMetric; hasPositions: boolean }> = ({ metric, hasPositions }) => {
  const label = metric.mobileLabel || metric.label;

  if (metric.customRender) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="header-label">{label}</span>
        {metric.customRender(hasPositions)}
      </div>
    );
  }

  const { colorClass, formattedValue } = resolveMetric(metric, hasPositions);

  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <span className="header-label">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>
        {formattedValue}
      </span>
    </div>
  );
};

/**
 * Single metric display — desktop
 */
const DesktopMetric: FC<{ metric: HeaderMetric; hasPositions: boolean }> = ({ metric, hasPositions }) => {
  if (metric.customRender) {
    return (
      <div className="hover:bg-base-content/[0.03] flex min-w-[96px] flex-col items-center gap-1.5 rounded-lg px-4 py-2 transition-colors duration-200">
        <span className="header-label">{metric.label}</span>
        {metric.customRender(hasPositions)}
      </div>
    );
  }

  const { colorClass, formattedValue } = resolveMetric(metric, hasPositions);

  return (
    <div className="hover:bg-base-content/[0.03] flex min-w-[96px] flex-col items-center gap-1.5 rounded-lg px-4 py-2 transition-colors duration-200">
      <span className="header-label">{metric.label}</span>
      <span className={`header-value ${colorClass}`}>
        {formattedValue}
      </span>
    </div>
  );
};

/**
 * Protocol name + optional link — shared between mobile/desktop
 */
const ProtocolName: FC<{
  name: string;
  url?: string;
  className?: string;
}> = ({ name, url, className = "text-lg font-semibold tracking-tight" }) => {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group/link flex items-center gap-1 whitespace-nowrap transition-colors hover:text-primary ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {name}
        <ArrowTopRightOnSquareIcon className="size-3 opacity-0 transition-opacity group-hover/link:opacity-50" />
      </a>
    );
  }
  return <span className={`whitespace-nowrap ${className}`}>{name}</span>;
};

/**
 * Shared protocol header component for Morpho, Euler, and similar protocol views.
 * Provides consistent layout with collapsible state and markets toggle.
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
      className={`header-surface shadow-[inset_3px_0_0_0_rgba(255,255,255,0.12)] ${className}`}
      onClick={onToggleCollapsed}
    >
      {/* Mobile Layout (< sm) */}
      <div className="space-y-2 px-4 py-3 sm:hidden">
        {/* Row 1: Protocol identity (left), controls (right) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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
            <ProtocolName name={protocolName} url={protocolUrl} className="text-sm font-semibold tracking-tight" />
          </div>
          <div className="flex items-center gap-1.5">
            {headerExtra}
            <button
              className="btn btn-xs btn-ghost gap-0.5 opacity-60 hover:opacity-100"
              type="button"
              onClick={onToggleMarkets}
            >
              <span className="text-[9px] font-medium tracking-wider">Markets</span>
              {isMarketsOpen ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
            </button>
            <ChevronDownIcon
              className={`text-base-content/30 size-4 transition-transform duration-300 ${isCollapsed ? "-rotate-90" : ""}`}
            />
          </div>
        </div>
        {/* Row 2: Stats — generous spacing */}
        <div className="flex items-center justify-evenly">
          {metrics.slice(0, 4).map((metric, idx) => (
            <MobileMetric key={idx} metric={metric} hasPositions={hasPositions} />
          ))}
        </div>
      </div>

      {/* Desktop Layout (>= sm) */}
      <div
        className="hidden items-center sm:grid"
        style={{ gridTemplateColumns: "200px 1px repeat(4, 1fr) auto" }}
      >
        {/* Protocol identity — fixed-width column */}
        <div className="flex items-center gap-3.5 py-3 pl-5">
          <div className="token-icon-wrapper-lg">
            <Image
              src={protocolIcon}
              alt={altText}
              width={26}
              height={26}
              className="object-contain drop-shadow-sm"
              onError={handleImageError}
            />
          </div>
          <ProtocolName name={protocolName} url={protocolUrl} />
        </div>

        {/* Divider */}
        <div className="via-base-300/60 mx-1 h-12 w-px bg-gradient-to-b from-transparent to-transparent" />

        {/* Stats — always 4 grid cells */}
        {Array.from({ length: 4 }, (_, idx) => {
          const metric = metrics[idx];
          if (!metric) return <div key={idx} />;
          return (
            <div key={idx} className="flex justify-center">
              <DesktopMetric metric={metric} hasPositions={hasPositions} />
            </div>
          );
        })}

        {/* Actions: Markets + collapse chevron */}
        <div className="flex items-center gap-2 pr-5 pl-3">
          {headerExtra}
          <button
            className="btn btn-sm btn-ghost gap-1 opacity-50 hover:opacity-100"
            type="button"
            onClick={onToggleMarkets}
          >
            <span className="text-[10px] font-medium tracking-wider">Markets</span>
            {isMarketsOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
          </button>
          <ChevronDownIcon
            className={`text-base-content/30 size-5 transition-transform duration-300 ${isCollapsed ? "-rotate-90" : ""}`}
          />
        </div>
      </div>
    </div>
  );
};
