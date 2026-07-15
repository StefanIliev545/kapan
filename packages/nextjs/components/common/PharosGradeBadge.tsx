"use client";

import * as React from "react";
import { Tooltip } from "@radix-ui/themes";
import { resolvePharosGrade, pharosStablecoinUrl, usePharosGrades } from "~~/utils/pharos/gradesApi";

/**
 * Colored stablecoin safety grade sourced from pharos.watch, rendered as a
 * small clickable pill next to token names in markets/positions rows. Renders
 * nothing for tokens Pharos doesn't grade (non-stables, unknown long-tail).
 *
 * PT tokens show the grade of their underlying stablecoin — see
 * utils/pharos/gradesApi.ts.
 */

const SIZE_CLASSES = {
  xs: "text-[9px] px-1 py-0.5",
  sm: "text-[10px] px-1.5 py-0.5",
};

// Bands follow the existing badge language: PositionHealthBadge greens/reds,
// PTBadge's info blue. A=solid, B=stable-but-watch, C=caution, D/F=risk.
function gradeColorClasses(grade: string): string {
  switch (grade[0]) {
    case "A":
      return "bg-success/15 text-success";
    case "B":
      return "bg-info/15 text-info";
    case "C":
      return "bg-warning/15 text-warning";
    default:
      return "bg-error/15 text-error"; // D, F
  }
}

interface PharosGradeBadgeProps {
  /** Token symbol as displayed in the row (PT symbols resolve to their underlying) */
  symbol: string;
  /** Token contract address when the caller has it — exact match for duplicate tickers */
  address?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function PharosGradeBadge({ symbol, address, size = "xs", className = "" }: PharosGradeBadgeProps) {
  const { data } = usePharosGrades();
  const resolved = React.useMemo(() => resolvePharosGrade(data, symbol, address), [data, symbol, address]);

  if (!resolved) return null;

  const scoreLabel = resolved.score != null ? ` · ${resolved.score}/100` : "";
  const tooltip = (
    <span className="block space-y-1">
      <span className="block font-medium">
        Pharos safety grade: {resolved.grade}
        {scoreLabel}
      </span>
      {resolved.viaPtUnderlying && (
        <span className="text-base-content/70 block text-xs">Based on underlying {resolved.resolvedSymbol}</span>
      )}
      <span className="text-base-content/70 block text-xs">View report on pharos.watch</span>
    </span>
  );

  return (
    <Tooltip content={tooltip} className="pharos-tooltip">
      <a
        href={pharosStablecoinUrl(resolved.id)}
        target="_blank"
        // noopener only — we deliberately keep the Referer so Pharos can
        // attribute traffic from kapan.finance (plus the UTM params on the URL).
        rel="noopener"
        // Badges live inside clickable rows/summaries — don't toggle/select the row.
        onClick={e => e.stopPropagation()}
        aria-label={`Pharos safety grade ${resolved.grade} for ${resolved.resolvedSymbol} — view on pharos.watch`}
        className={`${gradeColorClasses(resolved.grade)} ${SIZE_CLASSES[size]} inline-flex shrink-0 items-center rounded font-semibold leading-none transition-opacity hover:opacity-75 ${className}`}
      >
        {resolved.grade}
      </a>
    </Tooltip>
  );
}
