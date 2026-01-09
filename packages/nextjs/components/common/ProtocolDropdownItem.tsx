import { FC, memo } from "react";
import { ProtocolLogo } from "./ProtocolLogo";
import formatPercentage from "~~/utils/formatPercentage";

/**
 * Props for the ProtocolDropdownItem component
 */
export interface ProtocolDropdownItemProps {
  /** Protocol name (e.g., "Aave V3", "Compound V3") */
  protocolName: string;
  /** Display name for the protocol */
  displayName: string;
  /** Optional logo URL */
  logoUrl?: string;
  /** Rate to display (optional) */
  rate?: number;
  /** Whether this is the optimal (best rate) option */
  isOptimal?: boolean;
  /** Whether the rate is worse than current */
  isRateWorse?: boolean;
  /** Whether the rate is better than current */
  isRateBetter?: boolean;
  /** Whether this item is currently selected */
  isSelected?: boolean;
  /** Whether this item is disabled */
  disabled?: boolean;
  /** Tooltip for disabled state */
  disabledReason?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Format rate for display
 */
const formatRate = (rate: number): string => `${formatPercentage(rate)}%`;

/**
 * ProtocolDropdownItem - A unified component for protocol selection dropdown items
 *
 * Used in dropdown menus for selecting lending protocols.
 * Supports rate display with color coding for better/worse rates.
 *
 * @example
 * <ProtocolDropdownItem
 *   protocolName="aave"
 *   displayName="Aave V3"
 *   rate={5.2}
 *   isOptimal={true}
 *   onClick={() => handleSelect("aave")}
 * />
 */
export const ProtocolDropdownItem: FC<ProtocolDropdownItemProps> = memo(({
  protocolName,
  displayName,
  logoUrl,
  rate,
  isOptimal = false,
  isRateWorse = false,
  isRateBetter = false,
  isSelected = false,
  disabled = false,
  disabledReason,
  onClick,
}) => {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`
        border-base-200 cursor-pointer border-b px-4 py-3 transition-colors
        last:border-b-0
        ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-base-200"}
        ${isSelected ? "bg-primary/5" : ""}
      `}
      onClick={handleClick}
      title={disabled ? disabledReason : undefined}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <ProtocolLogo
            protocolName={protocolName}
            logoUrl={logoUrl}
            size="sm"
            rounded="full"
          />
          <span className="font-medium">{displayName}</span>
          {isOptimal && (
            <span className="badge badge-success badge-xs">Best</span>
          )}
        </div>
        {rate !== undefined && (
          <span
            className={`font-medium ${
              isOptimal
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
});

ProtocolDropdownItem.displayName = "ProtocolDropdownItem";

export default ProtocolDropdownItem;
