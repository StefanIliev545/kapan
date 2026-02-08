/**
 * Modal Bridge: converts PositionGroup.context back to protocol-specific modal props.
 *
 * This module provides type-safe access to the opaque context stored by adapter hooks.
 * It allows the unified position components to open the correct protocol-specific
 * modals without knowing the protocol details at compile time.
 *
 * Usage:
 *   const ctx = getContextForProtocol(group);
 *   if (ctx.type === "cross") {
 *     // Use ctx.context.suppliedPositions for Aave-like modal props
 *   }
 */

import type { PositionGroup, ProtocolId } from "~~/types/positions";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { MorphoPositionRow, MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";

// Re-export context interfaces from adapter hooks so consumers only import from the bridge
export type { CrossPositionContext } from "~~/hooks/adapters/useAavePositionGroups";
export type { MorphoPositionGroupContext } from "~~/hooks/adapters/useMorphoPositionGroups";
export type { EulerPositionGroupContext } from "~~/hooks/adapters/useEulerPositionGroups";
export type { CompoundPositionGroupContext } from "~~/hooks/adapters/useCompoundPositionGroups";
export type { VesuPositionGroupContext } from "~~/hooks/adapters/useVesuPositionGroups";

// Import for internal use in this module
import type { CrossPositionContext } from "~~/hooks/adapters/useAavePositionGroups";
import type { MorphoPositionGroupContext } from "~~/hooks/adapters/useMorphoPositionGroups";
import type { EulerPositionGroupContext } from "~~/hooks/adapters/useEulerPositionGroups";
import type { CompoundPositionGroupContext } from "~~/hooks/adapters/useCompoundPositionGroups";
import type { VesuPositionGroupContext } from "~~/hooks/adapters/useVesuPositionGroups";

// ── Discriminated union for safe access ───────────────────────────

type ContextResult =
  | { type: "cross"; context: CrossPositionContext }
  | { type: "compound"; context: CompoundPositionGroupContext }
  | { type: "morpho"; context: MorphoPositionGroupContext }
  | { type: "euler"; context: EulerPositionGroupContext }
  | { type: "vesu"; context: VesuPositionGroupContext }
  | { type: "unknown"; context: unknown };

/** Protocols using the cross-topology adapter (any collateral backs any debt) */
const CROSS_PROTOCOLS: ProtocolId[] = ["aave", "venus"];

/**
 * Safely extract and type-narrow the context from a PositionGroup.
 * Returns a discriminated union so callers get type-safe access.
 */
export function getContextForProtocol(group: PositionGroup): ContextResult {
  if (CROSS_PROTOCOLS.includes(group.protocol)) {
    return { type: "cross", context: group.context as CrossPositionContext };
  }
  if (group.protocol === "compound") {
    return { type: "compound", context: group.context as CompoundPositionGroupContext };
  }
  if (group.protocol === "morpho") {
    return { type: "morpho", context: group.context as MorphoPositionGroupContext };
  }
  if (group.protocol === "euler") {
    return { type: "euler", context: group.context as EulerPositionGroupContext };
  }
  if (group.protocol === "vesu") {
    return { type: "vesu", context: group.context as VesuPositionGroupContext };
  }
  return { type: "unknown", context: group.context };
}

// ── Convenience accessors ─────────────────────────────────────────

/**
 * Get the ProtocolPosition for a specific collateral token in a cross-topology group.
 * Returns undefined if not found or if the group is not a cross-topology group.
 */
export function getCrossCollateralPosition(
  group: PositionGroup,
  tokenAddress: string,
): ProtocolPosition | undefined {
  const ctx = group.context as CrossPositionContext;
  if (!ctx?.suppliedPositions) return undefined;
  return ctx.suppliedPositions.find(
    p => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
  );
}

/**
 * Get the ProtocolPosition for a specific debt token in a cross-topology group.
 * Returns undefined if not found or if the group is not a cross-topology group.
 */
export function getCrossDebtPosition(
  group: PositionGroup,
  tokenAddress: string,
): ProtocolPosition | undefined {
  const ctx = group.context as CrossPositionContext;
  if (!ctx?.borrowedPositions) return undefined;
  return ctx.borrowedPositions.find(
    p => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
  );
}

/**
 * Get all supplied ProtocolPositions from a cross-topology group.
 * Returns empty array if the group is not cross-topology.
 */
export function getCrossSuppliedPositions(group: PositionGroup): ProtocolPosition[] {
  const ctx = group.context as CrossPositionContext;
  return ctx?.suppliedPositions ?? [];
}

/**
 * Get all borrowed ProtocolPositions from a cross-topology group.
 * Returns empty array if the group is not cross-topology.
 */
export function getCrossBorrowedPositions(group: PositionGroup): ProtocolPosition[] {
  const ctx = group.context as CrossPositionContext;
  return ctx?.borrowedPositions ?? [];
}

/**
 * Get the Morpho market context for an isolated Morpho position group.
 */
export function getMorphoMarketContext(group: PositionGroup): MorphoMarketContext {
  const ctx = group.context as MorphoPositionGroupContext;
  return ctx.marketContext;
}

/**
 * Get the original MorphoPositionRow for a Morpho position group.
 */
export function getMorphoRow(group: PositionGroup): MorphoPositionRow {
  const ctx = group.context as MorphoPositionGroupContext;
  return ctx.row;
}

/**
 * Check whether a position group has any actionable positions.
 * A group is actionable if it has non-zero collateral or debt.
 */
export function isActionable(group: PositionGroup): boolean {
  const hasCollateral = group.collaterals.some(c => c.rawBalance > 0n);
  const hasDebt = group.debts.some(d => d.rawBalance > 0n);
  return hasCollateral || hasDebt;
}

/**
 * Determine available actions for a position group based on topology and protocol.
 * Returns an object with boolean flags for each action type.
 *
 * TODO: Expand with protocol-specific action availability when integrating with modals.
 * For example, some Morpho markets may not support certain operations, and
 * Vesu may have pool-specific constraints (see useVesuLendingPositions.ts).
 */
export function getAvailableActions(group: PositionGroup) {
  const hasCollateral = group.collaterals.some(c => c.rawBalance > 0n);
  const hasDebt = group.debts.some(d => d.rawBalance > 0n);
  const isEvm = group.network === "evm";

  return {
    deposit: true,
    withdraw: hasCollateral,
    borrow: hasCollateral, // Can borrow if there's collateral
    repay: hasDebt,
    move: isEvm && hasDebt, // Refinance/move is EVM-only for now
    swap: isEvm, // Collateral/debt swap is EVM-only
    close: isEvm && hasCollateral && hasDebt, // Close position requires both
    automate: isEvm && hasCollateral && hasDebt, // ADL requires both
  };
}
