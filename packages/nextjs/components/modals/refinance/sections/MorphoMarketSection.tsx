import React, { FC, memo, useMemo } from "react";
import { MorphoMarketSelector } from "../../../common/MorphoMarketSelector";
import { useMorphoState, useCollateralState } from "../RefinanceContext";
import type { MorphoMarket, MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";

export type MorphoMarketSectionProps = {
  /** Whether Morpho protocol is selected */
  isMorphoSelected?: boolean;
  /** Map of added collaterals (used to check if collateral is chosen) */
  addedCollaterals: Record<string, string>;
  /** Available Morpho markets */
  morphoMarkets?: MorphoMarket[];
  /** Currently selected Morpho market */
  selectedMorphoMarket?: MorphoMarket | null;
  /** Callback when a market is selected */
  onMorphoMarketSelect?: (market: MorphoMarket, context: MorphoMarketContext) => void;
  /** Current chain ID */
  chainId?: number;
  /** Whether Morpho markets are loading */
  isLoadingMorphoMarkets?: boolean;
};

/**
 * MorphoMarketSection displays the Morpho market selector
 * when Morpho is the selected destination protocol and a collateral is chosen.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const MorphoMarketSection: FC<Partial<MorphoMarketSectionProps>> = memo((props) => {
  // Check if we have all required props
  const hasAllProps = props.addedCollaterals !== undefined;

  let morphoState: {
    isSelected?: boolean;
    markets?: MorphoMarket[];
    selectedMarket?: MorphoMarket | null;
    onMarketSelect?: (market: MorphoMarket, context: MorphoMarketContext) => void;
    isLoadingMarkets?: boolean;
    chainId?: number;
  };

  let addedCollaterals: Record<string, string>;

  if (hasAllProps) {
    // Use props directly
    morphoState = {
      isSelected: props.isMorphoSelected,
      markets: props.morphoMarkets,
      selectedMarket: props.selectedMorphoMarket,
      onMarketSelect: props.onMorphoMarketSelect,
      chainId: props.chainId,
      isLoadingMarkets: props.isLoadingMorphoMarkets,
    };
    addedCollaterals = props.addedCollaterals!;
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    morphoState = useMorphoState();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const collateralState = useCollateralState();
    addedCollaterals = collateralState.addedCollaterals;
  }

  const { isSelected, markets, selectedMarket, onMarketSelect, chainId, isLoadingMarkets } = morphoState;

  // Empty array for Morpho markets fallback
  const emptyMorphoMarkets = useMemo(() => [] as MorphoMarket[], []);

  // Only render when Morpho is selected, collateral is chosen, and we have the required props
  if (!isSelected || Object.keys(addedCollaterals).length === 0 || !onMarketSelect || !chainId) {
    return null;
  }

  return (
    <>
      <div className="divider my-2" />
      <MorphoMarketSelector
        markets={markets ?? emptyMorphoMarkets}
        selectedMarket={selectedMarket ?? null}
        onSelectMarket={onMarketSelect}
        chainId={chainId}
        isLoading={isLoadingMarkets}
      />
    </>
  );
});

MorphoMarketSection.displayName = "MorphoMarketSection";
