import React, { FC, memo, useCallback, useMemo } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { addrKey } from "~~/utils/address";
import { CollateralAmountInputStyled } from "../../common/CollateralAmountInput";
import { LoadingSpinner } from "../../../common/Loading";
import { useCollateralState, useMorphoState, useEulerState } from "../RefinanceContext";
import type { Collateral } from "../../common/useRefinanceTypes";

/* ------------------------------ Collateral Tile ------------------------------ */

type CollateralTileProps = {
  collateral: Collateral;
  isAdded: boolean;
  isExpanded: boolean;
  supported: boolean;
  morphoHasOtherSelected: boolean;
  isMorphoSelected?: boolean;
  disableCollateralSelection?: boolean;
  addedAmount?: string;
  getUsdValue: (address: string, amount: string) => number;
  localeOptionsMinMax2: Intl.NumberFormatOptions;
  localeOptionsMax6: Intl.NumberFormatOptions;
  tempAmount: string;
  onTileClick: (address: string) => void;
  onInputChange: (val: string) => void;
  onMaxClick: (rawBalance: bigint, decimals: number) => void;
  onConfirm: (address: string, balance: number) => void;
};

const CollateralTile = memo<CollateralTileProps>(({
  collateral,
  isAdded,
  isExpanded,
  supported,
  morphoHasOtherSelected,
  isMorphoSelected,
  disableCollateralSelection,
  addedAmount,
  getUsdValue,
  localeOptionsMinMax2,
  localeOptionsMax6,
  tempAmount,
  onTileClick,
  onInputChange,
  onMaxClick,
  onConfirm,
}) => {
  const c = collateral;

  const handleClick = useCallback(() => {
    if (c.balance <= 0 || morphoHasOtherSelected) return;
    onTileClick(c.address);
  }, [c.balance, c.address, morphoHasOtherSelected, onTileClick]);

  const handleMaxClick = useCallback(() => {
    onMaxClick(c.rawBalance, c.decimals);
  }, [c.rawBalance, c.decimals, onMaxClick]);

  const handleConfirm = useCallback(() => {
    onConfirm(c.address, c.balance);
  }, [c.address, c.balance, onConfirm]);

  return (
    <div
      className={`rounded border p-2 ${isExpanded ? "col-span-2" : ""} ${isAdded ? "border-success bg-success/10" : supported && !morphoHasOtherSelected ? "border-base-300" : "border-error/50 opacity-60"
        } ${c.balance <= 0 || morphoHasOtherSelected ? "cursor-not-allowed opacity-50" : disableCollateralSelection ? "cursor-default" : "cursor-pointer"}`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2">
        <div className="relative size-6">
          <Image src={c.icon} alt={c.symbol} fill className="rounded-full" />
        </div>
        <span className="flex items-center gap-1 font-medium">
          {c.symbol}
          {isAdded && <span className="text-success">&#x2713;</span>}
        </span>
        {!supported && (
          <span className="badge badge-error badge-outline badge-xs ml-1">
            {isMorphoSelected ? "No market" : "Not supported"}
          </span>
        )}
        <span className="text-base-content/70 ml-auto text-sm">
          {addedAmount
            ? `$${getUsdValue(c.address, addedAmount).toLocaleString(undefined, localeOptionsMinMax2)}`
            : `${c.balance.toLocaleString(undefined, localeOptionsMax6)}`}
        </span>
      </div>

      {isExpanded && (
        <CollateralAmountInputStyled
          variant="expanded"
          value={tempAmount}
          onChange={onInputChange}
          onMaxClick={handleMaxClick}
          onConfirm={handleConfirm}
          rawBalance={c.rawBalance}
          decimals={c.decimals}
          balance={c.balance}
        />
      )}
    </div>
  );
});
CollateralTile.displayName = "CollateralTile";

/* ------------------------------ Collateral Grid ------------------------------ */

export type PreSelectedCollateralItem = {
  token: string;
  symbol: string;
  decimals: number;
  amount?: bigint;
  maxAmount?: bigint;
  inputValue?: string;
  /** Euler-specific: The collateral vault address for this collateral */
  eulerCollateralVault?: string;
};

export type CollateralGridProps = {
  /** Available collaterals */
  collaterals: Collateral[];
  /** Whether collaterals are loading */
  isLoadingCollaterals: boolean;
  /** Map of supported collaterals by address key */
  effectiveSupportedMap: Record<string, boolean>;
  /** Map of added collateral amounts by address key */
  addedCollaterals: Record<string, string>;
  /** Currently expanded collateral address key */
  expandedCollateral: string | null;
  /** Temporary amount input value */
  tempAmount: string;
  /** Callback to update temp amount */
  setTempAmount: (value: string) => void;
  /** Callback to track if max was clicked */
  setTempIsMax: (value: boolean) => void;
  /** Callback when collateral tile is clicked */
  onCollateralTileClick: (address: string) => void;
  /** Callback when collateral is added/confirmed */
  onAddCollateral: (address: string, balance: number) => void;
  /** Whether collateral selection is disabled (Vesu mode) */
  disableCollateralSelection?: boolean;
  /** Pre-selected collaterals (for Vesu pair isolation) */
  preSelectedCollaterals?: PreSelectedCollateralItem[];
  /** Function to get USD value for a token amount */
  getUsdValue: (address: string, amount: string) => number;
  /** Whether Morpho protocol is selected */
  isMorphoSelected?: boolean;
  /** Morpho-specific supported collaterals map */
  morphoSupportedCollaterals?: Record<string, boolean>;
  /** Whether Euler protocol is selected */
  isEulerSelected?: boolean;
  /** Euler-specific supported collaterals map */
  eulerSupportedCollaterals?: Record<string, boolean>;
};

/**
 * Internal component that renders the collateral grid UI
 */
const CollateralGridUI: FC<{
  collaterals: Collateral[];
  isLoading: boolean;
  effectiveCollateralSupport: Record<string, boolean>;
  addedCollaterals: Record<string, string>;
  expandedCollateral: string | null;
  tempAmount: string;
  disableSelection?: boolean;
  preSelectedCollaterals?: PreSelectedCollateralItem[];
  getUsdValue: (address: string, amount: string) => number;
  isMorphoSelected?: boolean;
  localeOptionsMinMax2: Intl.NumberFormatOptions;
  localeOptionsMax6: Intl.NumberFormatOptions;
  onTileClick: (address: string) => void;
  onInputChange: (val: string) => void;
  onMaxClick: (rawBalance: bigint, decimals: number) => void;
  onConfirm: (address: string, balance: number) => void;
}> = memo(({
  collaterals,
  isLoading,
  effectiveCollateralSupport,
  addedCollaterals,
  expandedCollateral,
  tempAmount,
  disableSelection,
  preSelectedCollaterals,
  getUsdValue,
  isMorphoSelected,
  localeOptionsMinMax2,
  localeOptionsMax6,
  onTileClick,
  onInputChange,
  onMaxClick,
  onConfirm,
}) => {
  // Filter collaterals if using pre-selected mode
  const displayedCollaterals = disableSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0
    ? collaterals.filter(c =>
      preSelectedCollaterals.some(pc => addrKey(pc.token) === addrKey(c.address)),
    )
    : collaterals;

  return (
    <div className="space-y-2">
      <div className="text-base-content/80 text-sm">
        {disableSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0
          ? "Collateral to Move"
          : isMorphoSelected
            ? "Select Collateral to Move"
            : "Select Collaterals to Move"}
      </div>
      {disableSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
        <div className="text-base-content/60 bg-info/10 mb-2 rounded p-2 text-xs">
          <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this collateral cannot be changed.
        </div>
      )}
      {isMorphoSelected && !disableSelection && (
        <div className="text-base-content/60 bg-info/10 mb-2 rounded p-2 text-xs">
          <strong>Note:</strong> Morpho markets are isolated by collateral type. Select one collateral to see available markets.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {isLoading ? (
          <div className="col-span-2 flex items-center justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          displayedCollaterals.map(c => {
            const key = addrKey(c.address);
            const supported =
              Object.keys(effectiveCollateralSupport || {}).length === 0
                ? true
                : effectiveCollateralSupport?.[key] ?? false;
            const isAdded = Boolean(addedCollaterals[key]);
            const isExpanded = expandedCollateral === key;

            // For Morpho, only allow one collateral to be selected
            const morphoHasOtherSelected = Boolean(
              isMorphoSelected &&
              Object.keys(addedCollaterals).length > 0 &&
              !isAdded
            );

            return (
              <CollateralTile
                key={c.address}
                collateral={c}
                isAdded={isAdded}
                isExpanded={isExpanded}
                supported={supported}
                morphoHasOtherSelected={morphoHasOtherSelected}
                isMorphoSelected={isMorphoSelected}
                disableCollateralSelection={disableSelection}
                addedAmount={addedCollaterals[key]}
                getUsdValue={getUsdValue}
                localeOptionsMinMax2={localeOptionsMinMax2}
                localeOptionsMax6={localeOptionsMax6}
                tempAmount={tempAmount}
                onTileClick={onTileClick}
                onInputChange={onInputChange}
                onMaxClick={onMaxClick}
                onConfirm={onConfirm}
              />
            );
          })
        )}
      </div>
    </div>
  );
});
CollateralGridUI.displayName = "CollateralGridUI";

/**
 * CollateralGrid displays selectable collateral tiles with amount input
 * for the refinance modal.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const CollateralGrid: FC<Partial<CollateralGridProps>> = memo((props) => {
  // Check if we have all required props
  const hasAllProps = props.collaterals !== undefined &&
    props.isLoadingCollaterals !== undefined &&
    props.effectiveSupportedMap !== undefined &&
    props.addedCollaterals !== undefined &&
    props.expandedCollateral !== undefined &&
    props.tempAmount !== undefined &&
    props.setTempAmount !== undefined &&
    props.setTempIsMax !== undefined &&
    props.onCollateralTileClick !== undefined &&
    props.onAddCollateral !== undefined &&
    props.getUsdValue !== undefined;

  let collateralState: {
    collaterals: Collateral[];
    isLoading: boolean;
    effectiveSupportedMap: Record<string, boolean>;
    addedCollaterals: Record<string, string>;
    expandedCollateral: string | null;
    tempAmount: string;
    setTempAmount: (value: string) => void;
    setTempIsMax: (value: boolean) => void;
    onTileClick: (address: string) => void;
    onAddCollateral: (address: string, balance: number) => void;
    disableSelection?: boolean;
    preSelectedCollaterals?: PreSelectedCollateralItem[];
    getUsdValue: (address: string, amount: string) => number;
  };

  let morphoState: {
    isSelected?: boolean;
    supportedCollaterals?: Record<string, boolean>;
  };

  let eulerState: {
    isSelected?: boolean;
    supportedCollaterals?: Record<string, boolean>;
  };

  if (hasAllProps) {
    // Use props directly
    collateralState = {
      collaterals: props.collaterals!,
      isLoading: props.isLoadingCollaterals!,
      effectiveSupportedMap: props.effectiveSupportedMap!,
      addedCollaterals: props.addedCollaterals!,
      expandedCollateral: props.expandedCollateral!,
      tempAmount: props.tempAmount!,
      setTempAmount: props.setTempAmount!,
      setTempIsMax: props.setTempIsMax!,
      onTileClick: props.onCollateralTileClick!,
      onAddCollateral: props.onAddCollateral!,
      disableSelection: props.disableCollateralSelection,
      preSelectedCollaterals: props.preSelectedCollaterals,
      getUsdValue: props.getUsdValue!,
    };
    morphoState = {
      isSelected: props.isMorphoSelected,
      supportedCollaterals: props.morphoSupportedCollaterals,
    };
    eulerState = {
      isSelected: props.isEulerSelected,
      supportedCollaterals: props.eulerSupportedCollaterals,
    };
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    collateralState = useCollateralState();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    morphoState = useMorphoState();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    eulerState = useEulerState();
  }

  const {
    collaterals,
    isLoading,
    effectiveSupportedMap,
    addedCollaterals,
    expandedCollateral,
    tempAmount,
    setTempAmount,
    setTempIsMax,
    onTileClick,
    onAddCollateral,
    disableSelection,
    preSelectedCollaterals,
    getUsdValue,
  } = collateralState;

  const { isSelected: isMorphoSelected, supportedCollaterals: morphoSupportedCollaterals } = morphoState;
  const { isSelected: isEulerSelected, supportedCollaterals: eulerSupportedCollaterals } = eulerState;

  // Determine effective supported collateral map
  const effectiveCollateralSupport = isMorphoSelected && morphoSupportedCollaterals
    ? morphoSupportedCollaterals
    : isEulerSelected && eulerSupportedCollaterals
      ? eulerSupportedCollaterals
      : effectiveSupportedMap;

  // toLocaleString options - memoized to avoid recreating objects
  const localeOptionsMinMax2 = useMemo(
    () => ({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );
  const localeOptionsMax6 = useMemo(() => ({ maximumFractionDigits: 6 }), []);

  // Handler for CollateralAmountInputStyled onChange
  const handleCollateralInputChange = useCallback(
    (val: string) => {
      setTempIsMax(false);
      setTempAmount(val);
    },
    [setTempIsMax, setTempAmount],
  );

  // Handler for collateral max click
  const handleCollateralMaxClick = useCallback(
    (rawBalance: bigint, decimals: number) => {
      setTempIsMax(true);
      setTempAmount(formatUnits(rawBalance, decimals));
    },
    [setTempIsMax, setTempAmount],
  );

  // Handler for collateral confirm
  const handleCollateralConfirm = useCallback(
    (address: string, balance: number) => {
      onAddCollateral(address, balance);
    },
    [onAddCollateral],
  );

  return (
    <CollateralGridUI
      collaterals={collaterals}
      isLoading={isLoading}
      effectiveCollateralSupport={effectiveCollateralSupport}
      addedCollaterals={addedCollaterals}
      expandedCollateral={expandedCollateral}
      tempAmount={tempAmount}
      disableSelection={disableSelection}
      preSelectedCollaterals={preSelectedCollaterals}
      getUsdValue={getUsdValue}
      isMorphoSelected={isMorphoSelected}
      localeOptionsMinMax2={localeOptionsMinMax2}
      localeOptionsMax6={localeOptionsMax6}
      onTileClick={onTileClick}
      onInputChange={handleCollateralInputChange}
      onMaxClick={handleCollateralMaxClick}
      onConfirm={handleCollateralConfirm}
    />
  );
});

CollateralGrid.displayName = "CollateralGrid";
