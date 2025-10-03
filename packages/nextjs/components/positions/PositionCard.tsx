import React, { FC, ReactNode } from "react";
import { FiChevronDown, FiChevronUp, FiInfo } from "react-icons/fi";

type PositionCardProps = {
  isExpanded: boolean;
  canToggle: boolean;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
  containerClassName?: string;
  header: React.ReactNode;
  headerClassName?: string;
  stats: React.ReactNode;
  statsClassName?: string;
  indicator?: React.ReactNode;
  indicatorClassName?: string;
  actionSection?: React.ReactNode | null;
  footer?: React.ReactNode;
};

export const PositionCard: FC<PositionCardProps> = ({
  isExpanded,
  canToggle,
  onToggle,
  containerClassName,
  header,
  headerClassName,
  stats,
  statsClassName,
  indicator,
  indicatorClassName,
  actionSection,
  footer,
}) => {
  const containerClasses = `w-full p-3 rounded-md ${
    isExpanded ? "bg-base-300" : "bg-base-200"
  } ${
    canToggle ? "cursor-pointer hover:bg-primary/10 hover:shadow-md" : "cursor-default"
  } transition-all duration-200 ${containerClassName ?? ""}`;

  return (
    <>
      <div className={containerClasses} onClick={onToggle}>
        <div className="grid grid-cols-1 lg:grid-cols-12 relative">
          <div
            className={`order-1 lg:order-none lg:col-span-3 flex items-center min-w-0 ${
              headerClassName ?? ""
            }`}
          >
            {header}
          </div>
          <div
            className={`order-2 lg:order-none lg:col-span-6 grid gap-0 items-center min-w-[200px] ${
              statsClassName ?? ""
            }`}
          >
            {stats}
          </div>
          <div
            className={`order-3 lg:order-none lg:col-span-3 flex items-center justify-end gap-2 ${
              indicatorClassName ?? ""
            }`}
          >
            {indicator}
          </div>
        </div>
        {actionSection}
      </div>
      {footer}
    </>
  );
};

type PositionInfoDropdownProps = {
  name: string;
  protocolName: string;
  tokenAddress?: string;
  typeLabel: string;
  extraDetails?: React.ReactNode;
};

export const PositionInfoDropdown: FC<PositionInfoDropdownProps> = ({
  name,
  protocolName,
  tokenAddress,
  typeLabel,
  extraDetails,
}) => (
  <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
    <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
      <FiInfo className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors" aria-hidden="true" />
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
          {tokenAddress ? (
            <>
              <p className="text-base-content/70">Contract Address:</p>
              <p className="font-mono break-all">{tokenAddress}</p>
            </>
          ) : null}
          <p className="text-base-content/70">Protocol:</p>
          <p>{protocolName}</p>
          <p className="text-base-content/70">Type:</p>
          <p className="capitalize">{typeLabel}</p>
          {extraDetails}
        </div>
      </div>
    </div>
  </div>
);

type PositionToggleIndicatorProps = {
  isExpanded: boolean;
};

export const PositionToggleIndicator: FC<PositionToggleIndicatorProps> = ({ isExpanded }) => (
  <div
    className={`flex items-center justify-center w-7 h-7 rounded-full ${
      isExpanded ? "bg-primary/20" : "bg-base-300/50"
    } transition-colors duration-200`}
  >
    {isExpanded ? (
      <FiChevronUp className="w-4 h-4 text-primary" />
    ) : (
      <FiChevronDown className="w-4 h-4 text-base-content/70" />
    )}
  </div>
);

type PositionActionButton = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  icon?: ReactNode;
};

type PositionActionButtonsProps = {
  actions: Array<PositionActionButton | null | undefined>;
};

export const PositionActionButtons: FC<PositionActionButtonsProps> = ({ actions }) => {
  const visibleActions = actions.filter((action): action is PositionActionButton => Boolean(action));

  if (!visibleActions.length) {
    return null;
  }

  const actionGridClass =
    visibleActions.length === 1 ? "grid-cols-1" : visibleActions.length === 2 ? "grid-cols-2" : "grid-cols-3";

  const renderButton = (action: PositionActionButton, variant: "mobile" | "desktop") => {
    const baseClasses = variant === "mobile" ? "btn btn-sm w-full flex justify-center items-center" : "btn btn-sm flex justify-center items-center";

    return (
      <button
        key={`${variant}-${action.key}`}
        className={`${baseClasses} ${action.className ?? "btn-outline"}`}
        onClick={action.onClick}
        disabled={action.disabled}
        aria-label={action.ariaLabel ?? action.label}
        title={action.title}
      >
        <div className="flex items-center justify-center gap-1">
          {action.icon}
          <span>{action.label}</span>
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2 md:hidden">
        {visibleActions.map(action => renderButton(action, "mobile"))}
      </div>
      <div className={`hidden md:grid gap-3 ${actionGridClass}`}>
        {visibleActions.map(action => renderButton(action, "desktop"))}
      </div>
    </>
  );
};

export type { PositionActionButton };
