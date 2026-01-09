import React, { FC, ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
// Re-export the consolidated PositionInfoDropdown from common
export { PositionInfoDropdown } from "~~/components/common/PositionInfoDropdown";

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
    canToggle ? "cursor-pointer hover:bg-base-200/80 hover:border-base-content/15" : "cursor-default"
  } transition-all duration-200 border border-transparent ${containerClassName ?? ""}`;

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
      <ChevronUpIcon className="w-4 h-4 text-primary" />
    ) : (
      <ChevronDownIcon className="w-4 h-4 text-base-content/70" />
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
