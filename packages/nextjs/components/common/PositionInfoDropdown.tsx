import { FC, ReactNode, MouseEvent } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

export type PositionInfoDropdownProps = {
  /** Token/asset name */
  name: string;
  /** Contract address (optional) */
  tokenAddress?: string;
  /** Protocol name (e.g. "Aave", "Compound") */
  protocolName: string;
  /** Position type (e.g. "Supply Position", "Borrow Position") */
  positionType: string;
  /** Optional extra content to render in the dropdown body */
  extraContent?: ReactNode;
  /** Additional wrapper className */
  className?: string;
  /** Whether to stop click propagation (useful when inside clickable parent) */
  stopPropagation?: boolean;
};

/**
 * A dropdown component that shows position details (name, address, protocol, type).
 * Used in SupplyPosition, BorrowPosition, and PositionCard components.
 *
 * This is the consolidated version that replaces the duplicate in PositionCard.tsx.
 */
export const PositionInfoDropdown: FC<PositionInfoDropdownProps> = ({
  name,
  tokenAddress,
  protocolName,
  positionType,
  extraContent,
  className = "",
  stopPropagation = false,
}) => {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
  };

  return (
    <div
      className={`dropdown dropdown-end dropdown-bottom flex-shrink-0 ${className}`}
      onClick={handleClick}
    >
      <div
        tabIndex={0}
        role="button"
        className="cursor-pointer flex items-center justify-center h-[1.125em]"
      >
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
            {tokenAddress && (
              <>
                <p className="text-base-content/70">Contract Address:</p>
                <p className="font-mono break-all">{tokenAddress}</p>
              </>
            )}
            <p className="text-base-content/70">Protocol:</p>
            <p>{protocolName}</p>
            <p className="text-base-content/70">Type:</p>
            <p className="capitalize">{positionType}</p>
            {extraContent}
          </div>
        </div>
      </div>
    </div>
  );
};
