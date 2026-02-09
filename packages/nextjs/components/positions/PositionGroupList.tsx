"use client";

import { FC, useMemo } from "react";
import type { PositionGroup, ProtocolId } from "~~/types/positions";
import { PositionGroupCard } from "./PositionGroupCard";
import { totalCollateralUsd, totalDebtUsd } from "~~/types/positions";
import { formatCurrency } from "~~/utils/formatNumber";

interface PositionGroupListProps {
  groups: PositionGroup[];
  /** Group cards by protocol? Default: true */
  groupByProtocol?: boolean;
  /** Optional loading state */
  isLoading?: boolean;
}

/** Protocol display names for grouping headers */
const PROTOCOL_LABELS: Record<ProtocolId, string> = {
  aave: "Aave V3",
  compound: "Compound V3",
  venus: "Venus",
  morpho: "Morpho Blue",
  euler: "Euler V2",
  vesu: "Vesu",
  nostra: "Nostra",
};

/**
 * Renders a list of PositionGroups, optionally grouped by protocol.
 *
 * This is the main integration component for the unified position system.
 * Feed it PositionGroup[] from the adapter hooks and it handles the rest.
 *
 * NOTE: This component is read-only (no modal wiring yet). To add actions,
 * wire onClick handlers on the PositionGroupCard that use the modalBridge
 * to open protocol-specific modals. See components/positions/modalBridge.ts.
 */
export const PositionGroupList: FC<PositionGroupListProps> = ({
  groups,
  groupByProtocol = true,
  isLoading,
}) => {
  // Aggregate metrics across all groups
  const totals = useMemo(() => {
    const totalSupply = groups.reduce((sum, g) => sum + totalCollateralUsd(g), 0);
    const totalDebt = groups.reduce((sum, g) => sum + totalDebtUsd(g), 0);
    const net = totalSupply - totalDebt;
    return { totalSupply, totalDebt, net };
  }, [groups]);

  // Group by protocol for sectioned display
  const sections = useMemo(() => {
    if (!groupByProtocol) return null;

    const map = new Map<ProtocolId, PositionGroup[]>();
    for (const g of groups) {
      const existing = map.get(g.protocol) ?? [];
      existing.push(g);
      map.set(g.protocol, existing);
    }
    return Array.from(map.entries());
  }, [groups, groupByProtocol]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-base-content/50 ml-2 text-sm">Loading positions...</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-base-content/40 py-12 text-center text-sm">
        No positions found. Supply collateral to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aggregate summary */}
      <div className="flex items-center gap-6 px-1 text-xs">
        <div>
          <span className="text-base-content/50 uppercase tracking-wider">Total Supply</span>
          <span className="ml-2 font-medium">{formatCurrency(totals.totalSupply)}</span>
        </div>
        <div>
          <span className="text-base-content/50 uppercase tracking-wider">Total Debt</span>
          <span className="text-error ml-2 font-medium">{formatCurrency(totals.totalDebt)}</span>
        </div>
        <div>
          <span className="text-base-content/50 uppercase tracking-wider">Net</span>
          <span className={`ml-2 font-semibold ${totals.net >= 0 ? "text-success" : "text-error"}`}>
            {formatCurrency(totals.net)}
          </span>
        </div>
      </div>

      {/* Grouped or flat list */}
      {sections
        ? sections.map(([protocol, protocolGroups]) => (
            <div key={protocol} className="space-y-2">
              <h3 className="text-base-content/70 px-1 text-xs font-semibold uppercase tracking-wider">
                {PROTOCOL_LABELS[protocol] || protocol}
              </h3>
              {protocolGroups.map(g => (
                <PositionGroupCard key={g.id} group={g} />
              ))}
            </div>
          ))
        : groups.map(g => <PositionGroupCard key={g.id} group={g} />)}
    </div>
  );
};
