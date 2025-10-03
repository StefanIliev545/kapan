"use client";

import type { FC } from "react";

type ActionVariant = "ghost" | "primary" | "error" | "secondary";

export type SegmentedAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  variant?: ActionVariant;
  compactOnHover?: boolean;
};

interface SegmentedActionBarProps {
  actions: SegmentedAction[];
  className?: string;
}

const variantClass = (variant?: ActionVariant) => {
  switch (variant) {
    case "primary":
      return "btn-primary";
    case "error":
      return "btn-error";
    case "secondary":
      return "btn-secondary";
    default:
      return "btn-ghost";
  }
};

export const SegmentedActionBar: FC<SegmentedActionBarProps> = ({ actions, className }) => {
  if (!actions.length) return null;

  return (
    <div
      className={`inline-flex overflow-x-auto rounded-md border border-base-300 divide-x divide-base-300 items-stretch ${
        className || ""
      }`}
    >
      {actions.map(action => (
        <button
          key={action.key}
          className={`group btn btn-sm h-7 px-2 flex items-center gap-1 shrink-0 rounded-none ${variantClass(
            action.variant,
          )}`}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.ariaLabel || action.label}
          title={action.title}
        >
          {action.icon}
          {action.compactOnHover ? (
            <span className="ml-1 hidden group-hover:inline">{action.label}</span>
          ) : (
            <span className="ml-1">{action.label}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default SegmentedActionBar;


