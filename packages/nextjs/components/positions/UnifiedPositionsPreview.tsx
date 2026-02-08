"use client";

/**
 * Preview component that demonstrates the unified position rendering system.
 *
 * Uses the adapter hooks to transform protocol-specific data into PositionGroup[]
 * and renders them with the topology-based PositionGroupCard components.
 *
 * Currently supports Morpho (isolated) and Euler (multi) since they have clean
 * hook-based data flows. Aave/Compound/Venus data comes from the AaveLike render-prop
 * component and will need a hook extraction to plug in here.
 *
 * TODO: Extract Aave/Compound/Venus data fetching into hooks so they can feed
 * into useAavePositionGroups adapter. See components/specific/aave/AaveLike.tsx.
 */

import { FC, useMemo } from "react";
import { useAccount } from "wagmi";
import { useMorphoLendingPositions } from "~~/hooks/useMorphoLendingPositions";
import { useEulerLendingPositions } from "~~/hooks/useEulerLendingPositions";
import { useMorphoPositionGroups } from "~~/hooks/adapters/useMorphoPositionGroups";
import { useEulerPositionGroups } from "~~/hooks/adapters/useEulerPositionGroups";
import { PositionGroupList } from "./PositionGroupList";
import type { PositionGroup } from "~~/types/positions";
import { getEffectiveChainId } from "~~/utils/forkChain";

interface UnifiedPositionsPreviewProps {
  chainId: number;
}

/**
 * Shows all positions for a given chain in the unified topology-based format.
 * This is a read-only preview — modals and actions are still handled by the
 * existing protocol views. Toggle this on to compare rendering side-by-side.
 */
export const UnifiedPositionsPreview: FC<UnifiedPositionsPreviewProps> = ({ chainId }) => {
  const { address } = useAccount();
  const effectiveChainId = getEffectiveChainId(chainId);

  // ── Morpho data (isolated topology) ─────────────────────────────
  const {
    rows: morphoRows,
    hasLoadedOnce: morphoLoaded,
    isLoadingPositions: morphoLoading,
  } = useMorphoLendingPositions(effectiveChainId, address);

  const morphoGroups = useMorphoPositionGroups(effectiveChainId, morphoRows);

  // ── Euler data (multi topology) ─────────────────────────────────
  const {
    enrichedPositionGroups: eulerEnriched,
    hasLoadedOnce: eulerLoaded,
    isLoadingPositions: eulerLoading,
  } = useEulerLendingPositions(effectiveChainId, address);

  const eulerGroups = useEulerPositionGroups(effectiveChainId, eulerEnriched);

  // ── Merge all groups ────────────────────────────────────────────
  const allGroups = useMemo<PositionGroup[]>(() => {
    return [...morphoGroups, ...eulerGroups];
  }, [morphoGroups, eulerGroups]);

  const isLoading = morphoLoading || eulerLoading;
  const hasLoaded = morphoLoaded || eulerLoaded;

  if (!address) {
    return (
      <div className="text-base-content/40 py-8 text-center text-sm">
        Connect wallet to see unified positions
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-base-content/50 text-[10px] font-medium uppercase tracking-wider">
          Unified Position View
        </span>
        <span className="badge badge-xs badge-outline">Preview</span>
        <span className="text-base-content/30 text-[10px]">
          Morpho + Euler (read-only)
        </span>
      </div>
      <PositionGroupList
        groups={allGroups}
        isLoading={isLoading && !hasLoaded}
        groupByProtocol
      />
    </div>
  );
};
