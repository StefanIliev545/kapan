"use client";

import { FC, memo } from "react";
import type { PositionGroup } from "~~/types/positions";
import { PositionMetrics } from "./PositionMetrics";
import { CrossPositionLayout } from "./CrossPositionLayout";
import { IsolatedPositionLayout } from "./IsolatedPositionLayout";
import { MultiPositionLayout } from "./MultiPositionLayout";

interface PositionGroupCardProps {
  group: PositionGroup;
}

/**
 * Selects the correct layout component based on the group's topology.
 * This is an internal routing component -- consumers use PositionGroupCard.
 */
const TopologyLayout: FC<{ group: PositionGroup }> = ({ group }) => {
  switch (group.topology) {
    case "cross":
      return <CrossPositionLayout group={group} />;
    case "isolated":
      return <IsolatedPositionLayout group={group} />;
    case "multi":
      return <MultiPositionLayout group={group} />;
  }
};

/**
 * Main entry point for rendering a single PositionGroup.
 *
 * Delegates to topology-specific layouts (Cross, Isolated, Multi) and
 * displays aggregate metrics (net value, net APY) in the card header.
 *
 * This is a read-only display component. Modal/action wiring will be added
 * via the modal bridge layer (see components/positions/modalBridge.ts).
 */
export const PositionGroupCard: FC<PositionGroupCardProps> = memo(({ group }) => {
  const hasPositions = group.collaterals.length > 0 || group.debts.length > 0;
  if (!hasPositions) return null;

  return (
    <div className="bg-base-200/50 rounded-xl border border-base-300/50 p-4 space-y-3">
      {/* Header: protocol badge + metrics */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="badge badge-sm badge-ghost uppercase text-[10px]">{group.protocol}</span>
          {/* Show label in header only for non-cross topologies (cross shows all positions inline) */}
          {group.topology !== "cross" && group.label && (
            <span className="text-base-content/60 text-xs">{group.label}</span>
          )}
        </div>
        <PositionMetrics group={group} />
      </div>

      {/* Topology-specific layout */}
      <TopologyLayout group={group} />
    </div>
  );
});

PositionGroupCard.displayName = "PositionGroupCard";
