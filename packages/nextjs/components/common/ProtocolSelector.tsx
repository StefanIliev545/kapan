import { FC, memo, useCallback, useMemo } from "react";
import Image from "next/image";
import { ArrowRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { getProtocolLogo } from "~~/utils/protocol";
import formatPercentage from "~~/utils/formatPercentage";

/**
 * Protocol option for the selector
 */
export interface ProtocolOption {
  /** Protocol identifier/name (e.g., "Aave V3", "Compound V3") */
  name: string;
  /** Optional logo URL - will be fetched from getProtocolLogo if not provided */
  logo?: string;
  /** Optional supply rate for display */
  supplyRate?: number;
  /** Optional borrow rate for display */
  borrowRate?: number;
  /** Whether this is the optimal (best rate) option */
  isOptimal?: boolean;
  /** Whether this protocol is disabled/unavailable */
  disabled?: boolean;
  /** Optional tooltip for disabled state */
  disabledReason?: string;
}

/**
 * Display variants for the protocol selector
 */
export type ProtocolSelectorVariant = "dropdown" | "grid" | "tiles";

/**
 * Props for the ProtocolSelector component
 */
export interface ProtocolSelectorProps {
  /** List of protocol options */
  protocols: ProtocolOption[];
  /** Currently selected protocol name */
  selectedProtocol: string;
  /** Callback when a protocol is selected */
  onSelect: (protocolName: string) => void;
  /** Display variant */
  variant?: ProtocolSelectorVariant;
  /** Label shown above the selector */
  label?: string;
  /** Placeholder text when no protocol is selected */
  placeholder?: string;
  /** Whether the selector is in a loading state */
  isLoading?: boolean;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Current rate to compare against (for showing improvement badges) */
  currentRate?: number;
  /** Rate type being compared ("supply" or "borrow") */
  rateType?: "supply" | "borrow";
  /** Additional className for the container */
  className?: string;
  /** Number of grid columns for grid/tiles variant */
  gridCols?: number;
  /** Whether to show rate badges */
  showRateBadges?: boolean;
  /** Compact mode - smaller padding and text */
  compact?: boolean;
}

/**
 * Format rate for display
 */
const formatRate = (rate: number): string => `${formatPercentage(rate)}%`;

/**
 * Get the display name for a protocol (removes version suffix for cleaner UI)
 */
const formatProtocolName = (protocolId: string): string => {
  const protocolNameMap: Record<string, string> = {
    aave: "Aave V3",
    compound: "Compound V3",
    venus: "Venus",
    zerolend: "ZeroLend",
    spark: "Spark",
    morpho: "Morpho Blue",
    vesu: "Vesu",
    nostra: "Nostra",
  };
  return protocolNameMap[protocolId.toLowerCase()] || protocolId;
};

/**
 * ProtocolSelector - A unified component for selecting lending protocols
 *
 * Supports three display variants:
 * - dropdown: A dropdown menu (default) - best for modals with limited space
 * - grid: A grid of selectable cards - best for showing multiple protocols with rates
 * - tiles: Compact inline tiles - best for embedded selection
 *
 * @example
 * // Dropdown variant (default)
 * <ProtocolSelector
 *   protocols={[{ name: "Aave V3" }, { name: "Compound V3" }]}
 *   selectedProtocol={selected}
 *   onSelect={setSelected}
 * />
 *
 * @example
 * // Grid variant with rates
 * <ProtocolSelector
 *   variant="grid"
 *   protocols={protocols}
 *   selectedProtocol={selected}
 *   onSelect={setSelected}
 *   currentRate={5.2}
 *   rateType="supply"
 *   showRateBadges
 * />
 */
export const ProtocolSelector: FC<ProtocolSelectorProps> = memo(({
  protocols,
  selectedProtocol,
  onSelect,
  variant = "dropdown",
  label,
  placeholder = "Select protocol",
  isLoading = false,
  disabled = false,
  currentRate,
  rateType = "supply",
  className = "",
  gridCols = 3,
  showRateBadges = false,
  compact = false,
}) => {
  // Get the selected protocol object
  const selectedOption = useMemo(
    () => protocols.find(p => p.name === selectedProtocol),
    [protocols, selectedProtocol]
  );

  // Get the rate to display based on rateType
  const getRate = useCallback((protocol: ProtocolOption) => {
    return rateType === "supply" ? protocol.supplyRate : protocol.borrowRate;
  }, [rateType]);

  // Calculate rate difference for badges
  const getRateDifference = useCallback((rate?: number) => {
    if (rate === undefined || currentRate === undefined) return undefined;
    return rate - currentRate;
  }, [currentRate]);

  // Handle protocol selection
  const handleSelect = useCallback((name: string) => {
    if (!disabled) {
      onSelect(name);
    }
  }, [disabled, onSelect]);

  // Render loading state
  if (isLoading) {
    return (
      <div className={`flex justify-center py-4 ${className}`}>
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  // Render dropdown variant
  if (variant === "dropdown") {
    return (
      <div className={className}>
        {label && (
          <label className="text-sm font-medium text-base-content/80 block mb-1">
            {label}
          </label>
        )}
        <div className="dropdown w-full">
          <div
            tabIndex={disabled ? undefined : 0}
            role="button"
            className={`
              w-full rounded-xl border border-base-300/60
              ${compact ? "p-2" : "p-3"}
              flex items-center justify-between
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/40"}
              transition-colors
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`${compact ? "w-8 h-8" : "w-12 h-12"} relative rounded-full bg-base-200 overflow-hidden`}>
                {selectedOption ? (
                  <Image
                    src={selectedOption.logo || getProtocolLogo(selectedOption.name)}
                    alt={selectedOption.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-base-content/50 text-xs">
                    Pick
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className={`font-semibold ${compact ? "text-sm" : ""}`}>
                  {selectedOption ? formatProtocolName(selectedOption.name) : placeholder}
                </span>
                {selectedOption && getRate(selectedOption) !== undefined && (
                  <span className="text-xs text-base-content/60">
                    {formatRate(getRate(selectedOption)!)} APY
                  </span>
                )}
              </div>
            </div>
            <ChevronDownIcon className="w-5 h-5 text-base-content/50" />
          </div>

          {!disabled && (
            <div
              tabIndex={0}
              className="dropdown-content z-50 menu shadow-xl bg-base-100 rounded-2xl w-full p-0 border border-base-200 overflow-hidden"
            >
              {protocols.length === 0 ? (
                <div className="px-4 py-3 text-base-content/50">No protocols available</div>
              ) : (
                <div className="max-h-[240px] overflow-y-auto">
                  {protocols.map((protocol) => {
                    const rate = getRate(protocol);
                    const rateDiff = getRateDifference(rate);
                    const isRateWorse = rateDiff !== undefined && rateDiff < 0;
                    const isRateBetter = rateDiff !== undefined && rateDiff > 0;

                    return (
                      <div
                        key={protocol.name}
                        className={`
                          px-4 py-3 cursor-pointer border-b border-base-200 last:border-b-0
                          transition-colors
                          ${protocol.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-base-200"}
                          ${protocol.name === selectedProtocol ? "bg-primary/5" : ""}
                        `}
                        onClick={() => !protocol.disabled && handleSelect(protocol.name)}
                        title={protocol.disabled ? protocol.disabledReason : undefined}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <Image
                              src={protocol.logo || getProtocolLogo(protocol.name)}
                              alt={protocol.name}
                              width={24}
                              height={24}
                              className="rounded-full min-w-[24px]"
                            />
                            <span className="font-medium">{formatProtocolName(protocol.name)}</span>
                            {protocol.isOptimal && (
                              <span className="badge badge-success badge-xs">Best</span>
                            )}
                          </div>
                          {rate !== undefined && (
                            <span
                              className={`font-medium ${
                                protocol.isOptimal
                                  ? "text-success"
                                  : isRateWorse
                                    ? "text-error"
                                    : isRateBetter
                                      ? "text-success"
                                      : ""
                              }`}
                            >
                              {formatRate(rate)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render grid variant
  if (variant === "grid") {
    return (
      <div className={className}>
        {label && (
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-base-content/80">{label}</div>
            {showRateBadges && selectedOption && currentRate !== undefined && (
              <RateBadge
                selectedRate={getRate(selectedOption)}
                currentRate={currentRate}
                rateType={rateType}
              />
            )}
          </div>
        )}
        <div
          className={`grid gap-2`}
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {protocols.map((protocol) => {
            const isSelected = protocol.name === selectedProtocol;
            const rate = getRate(protocol);

            return (
              <div
                key={protocol.name}
                className={`
                  ${compact ? "p-2" : "p-2 sm:p-3"}
                  border rounded-lg cursor-pointer transition-all
                  ${isSelected ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/40"}
                  ${protocol.disabled ? "opacity-50 cursor-not-allowed" : ""}
                `}
                onClick={() => !protocol.disabled && handleSelect(protocol.name)}
                title={protocol.disabled ? protocol.disabledReason : undefined}
              >
                <div className="flex items-center gap-2">
                  <Image
                    src={protocol.logo || getProtocolLogo(protocol.name)}
                    alt={protocol.name}
                    width={compact ? 20 : 24}
                    height={compact ? 20 : 24}
                    className="rounded flex-shrink-0"
                  />
                  <span className={`${compact ? "text-xs" : "text-sm"} font-medium truncate`}>
                    {formatProtocolName(protocol.name)}
                  </span>
                  {protocol.isOptimal && (
                    <span className="badge badge-success badge-xs ml-auto">Best</span>
                  )}
                </div>
                {rate !== undefined && (
                  <div className={`${compact ? "text-[10px]" : "text-xs"} text-base-content/60 mt-1`}>
                    {formatRate(rate)} APY
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render tiles variant (compact inline)
  return (
    <div className={className}>
      {label && (
        <label className="text-sm font-medium text-base-content/80 block mb-2">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {protocols.map((protocol) => {
          const isSelected = protocol.name === selectedProtocol;

          return (
            <button
              key={protocol.name}
              type="button"
              className={`
                btn btn-sm gap-2
                ${isSelected ? "btn-primary" : "btn-ghost border border-base-300"}
                ${protocol.disabled ? "btn-disabled" : ""}
              `}
              onClick={() => !protocol.disabled && handleSelect(protocol.name)}
              title={protocol.disabled ? protocol.disabledReason : undefined}
            >
              <Image
                src={protocol.logo || getProtocolLogo(protocol.name)}
                alt={protocol.name}
                width={16}
                height={16}
                className="rounded"
              />
              <span>{formatProtocolName(protocol.name)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

ProtocolSelector.displayName = "ProtocolSelector";

/**
 * RateBadge - Shows whether the selected rate is better/worse than current
 */
interface RateBadgeProps {
  selectedRate?: number;
  currentRate: number;
  rateType: "supply" | "borrow";
}

const RateBadge: FC<RateBadgeProps> = memo(({ selectedRate, currentRate, rateType }) => {
  if (selectedRate === undefined) return null;

  const diff = selectedRate - currentRate;
  // For supply: higher is better; for borrow: lower is better
  const isImprovement = rateType === "supply" ? diff > 0 : diff < 0;
  const isSame = Math.abs(diff) < 0.01;

  if (isSame) {
    return (
      <span className="badge badge-sm border-0 bg-base-200 text-base-content/70">
        Same APY
      </span>
    );
  }

  return (
    <span
      className={`badge badge-sm border-0 ${
        isImprovement ? "bg-success/15 text-success" : "bg-error/15 text-error"
      }`}
    >
      {isImprovement ? "Better APY" : "Lower APY"}
    </span>
  );
});

RateBadge.displayName = "RateBadge";

export default ProtocolSelector;
