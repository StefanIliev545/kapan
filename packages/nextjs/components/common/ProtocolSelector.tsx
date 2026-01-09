import { FC, memo, useCallback, useMemo } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { ProtocolLogo } from "./ProtocolLogo";
import { ProtocolDropdownItem } from "./ProtocolDropdownItem";
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
export const formatProtocolName = (protocolId: string): string => {
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
          <label className="text-base-content/80 mb-1 block text-sm font-medium">
            {label}
          </label>
        )}
        <div className="dropdown w-full">
          <div
            tabIndex={disabled ? undefined : 0}
            role="button"
            className={`
              border-base-300/60 w-full rounded-xl border
              ${compact ? "p-2" : "p-3"}
              flex items-center justify-between
              ${disabled ? "cursor-not-allowed opacity-50" : "hover:border-primary/40 cursor-pointer"}
              transition-colors
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`${compact ? "size-8" : "size-12"} bg-base-200 relative overflow-hidden rounded-full`}>
                {selectedOption ? (
                  <ProtocolLogo
                    protocolName={selectedOption.name}
                    logoUrl={selectedOption.logo}
                    size={compact ? "md" : "lg"}
                    rounded="full"
                  />
                ) : (
                  <div className="text-base-content/50 flex size-full items-center justify-center text-xs">
                    Pick
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className={`font-semibold ${compact ? "text-sm" : ""}`}>
                  {selectedOption ? formatProtocolName(selectedOption.name) : placeholder}
                </span>
                {selectedOption && getRate(selectedOption) !== undefined && (
                  <span className="text-base-content/60 text-xs">
                    {formatRate(getRate(selectedOption)!)} APY
                  </span>
                )}
              </div>
            </div>
            <ChevronDownIcon className="text-base-content/50 size-5" />
          </div>

          {!disabled && (
            <div
              tabIndex={0}
              className="dropdown-content menu bg-base-100 border-base-200 z-50 w-full overflow-hidden rounded-2xl border p-0 shadow-xl"
            >
              {protocols.length === 0 ? (
                <div className="text-base-content/50 px-4 py-3">No protocols available</div>
              ) : (
                <div className="max-h-[240px] overflow-y-auto">
                  {protocols.map((protocol) => {
                    const rate = getRate(protocol);
                    const rateDiff = getRateDifference(rate);
                    const isRateWorse = rateDiff !== undefined && rateDiff < 0;
                    const isRateBetter = rateDiff !== undefined && rateDiff > 0;

                    return (
                      <ProtocolDropdownItem
                        key={protocol.name}
                        protocolName={protocol.name}
                        displayName={formatProtocolName(protocol.name)}
                        logoUrl={protocol.logo}
                        rate={rate}
                        isOptimal={protocol.isOptimal}
                        isRateWorse={isRateWorse}
                        isRateBetter={isRateBetter}
                        isSelected={protocol.name === selectedProtocol}
                        disabled={protocol.disabled}
                        disabledReason={protocol.disabledReason}
                        onClick={() => handleSelect(protocol.name)}
                      />
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
          <div className="mb-2 flex items-center justify-between">
            <div className="text-base-content/80 text-sm font-semibold">{label}</div>
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
                  cursor-pointer rounded-lg border transition-all
                  ${isSelected ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/40"}
                  ${protocol.disabled ? "cursor-not-allowed opacity-50" : ""}
                `}
                onClick={() => !protocol.disabled && handleSelect(protocol.name)}
                title={protocol.disabled ? protocol.disabledReason : undefined}
              >
                <div className="flex items-center gap-2">
                  <ProtocolLogo
                    protocolName={protocol.name}
                    logoUrl={protocol.logo}
                    size={compact ? "xs" : "sm"}
                    rounded="md"
                  />
                  <span className={`${compact ? "text-xs" : "text-sm"} truncate font-medium`}>
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
        <label className="text-base-content/80 mb-2 block text-sm font-medium">
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
                ${isSelected ? "btn-primary" : "btn-ghost border-base-300 border"}
                ${protocol.disabled ? "btn-disabled" : ""}
              `}
              onClick={() => !protocol.disabled && handleSelect(protocol.name)}
              title={protocol.disabled ? protocol.disabledReason : undefined}
            >
              <ProtocolLogo
                protocolName={protocol.name}
                logoUrl={protocol.logo}
                size="xs"
                rounded="md"
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
      <span className="badge badge-sm bg-base-200 text-base-content/70 border-0">
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
