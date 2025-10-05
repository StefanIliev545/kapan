"use client";

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  autoCompact?: boolean; // if true, hide labels for compactOnHover actions when overflow would occur
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

export const SegmentedActionBar: FC<SegmentedActionBarProps> = ({ actions, className, autoCompact = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const hasActions = actions.length > 0;

  useEffect(() => {
    if (!autoCompact || !hasActions) return;
    const el = containerRef.current;
    if (!el) return;

    const HYSTERESIS_PX = 24; // extra space required before expanding again

    const compute = () => {
      // Measure in current state and apply hysteresis to avoid thrashing
      const hasOverflow = el.scrollWidth > el.clientWidth + 1;
      if (!isCompact) {
        // Only compact when overflowing
        if (hasOverflow) setIsCompact(true);
      } else {
        // Only expand when there is ample room
        const hasAmpleRoom = el.scrollWidth + HYSTERESIS_PX <= el.clientWidth;
        if (hasAmpleRoom) setIsCompact(false);
      }
    };

    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [autoCompact, actions, hasActions, isCompact]);

  const renderedActions = useMemo(() => {
    return actions.map(action => {
      const hideLabel = autoCompact && isCompact && action.compactOnHover;
      return (
        <button
          key={action.key}
          className={`group btn btn-sm h-7 px-2 flex items-center justify-center gap-1 flex-1 basis-0 rounded-none ${variantClass(
            action.variant,
          )}`}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.ariaLabel || action.label}
          title={action.title}
        >
          {action.icon}
          <span className={`ml-1 ${hideLabel ? "hidden group-hover:inline" : ""}`}>{action.label}</span>
        </button>
      );
    });
  }, [actions, autoCompact, isCompact]);

  return (
    hasActions ? (
      <div
        ref={containerRef}
        className={`flex w-full items-stretch py-0 ${className || ""}`}
      >
        {renderedActions}
      </div>
    ) : null
  );
};

export default SegmentedActionBar;


