import { useMemo } from "react";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

/* ------------------------------ Types ------------------------------ */
export type PreSelectedCollateral = {
  token: string;
  symbol: string;
  decimals: number;
  amount?: bigint;
  maxAmount?: bigint;
  inputValue?: string;
};

export type CollateralFromHook = {
  address: string;
  symbol: string;
  icon: string;
  decimals: number;
  rawBalance: bigint;
  balance: number;
};

export type MergeCollateralsOptions = {
  /** Collaterals from the hook/data source */
  collateralsFromHook: CollateralFromHook[];
  /** Pre-selected collaterals passed to the modal */
  preSelectedCollaterals?: PreSelectedCollateral[];
  /** Whether collateral selection is disabled (use only preselected) */
  disableCollateralSelection?: boolean;
  /** Whether to sort by address (for Starknet consistency) */
  sortByAddress?: boolean;
};

/* ------------------------------ Helpers ------------------------------ */
import { addrKey } from "~~/utils/address";

/**
 * Creates a collateral entry from a pre-selected collateral
 */
const createCollateralFromPreselected = (pc: PreSelectedCollateral): CollateralFromHook => {
  const rawBalance = pc.maxAmount || pc.amount || 0n;
  return {
    address: pc.token,
    symbol: pc.symbol,
    icon: tokenNameToLogo(pc.symbol.toLowerCase()),
    decimals: pc.decimals,
    rawBalance,
    balance: rawBalance ? Number(formatUnits(rawBalance, pc.decimals)) : 0,
  };
};

/**
 * Merges pre-selected collaterals with collaterals from hook
 *
 * Logic:
 * - If disableCollateralSelection and preSelectedCollaterals exist, only use preselected
 * - Otherwise, merge preselected into hook collaterals, preferring higher balances
 */
export function mergeCollaterals({
  collateralsFromHook,
  preSelectedCollaterals,
  disableCollateralSelection,
  sortByAddress,
}: MergeCollateralsOptions): CollateralFromHook[] {
  const sortList = (list: CollateralFromHook[]) =>
    sortByAddress
      ? [...list].sort((a, b) => addrKey(a.address).localeCompare(addrKey(b.address)))
      : list;

  // If collateral selection is disabled and we have preselected collaterals,
  // ONLY use the preselected collaterals (don't merge with hook data)
  // This is important for protocols like Morpho where the collateral is fixed per market
  if (disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0) {
    return sortList(preSelectedCollaterals.map(createCollateralFromPreselected));
  }

  if (!preSelectedCollaterals || preSelectedCollaterals.length === 0) {
    return sortList(collateralsFromHook);
  }

  const existingMap = new Map(collateralsFromHook.map(c => [addrKey(c.address), c]));
  const merged = [...collateralsFromHook];

  preSelectedCollaterals.forEach(pc => {
    const key = addrKey(pc.token);
    if (!existingMap.has(key)) {
      // Add new collateral from preselected
      merged.push(createCollateralFromPreselected(pc));
    } else {
      // Update existing if preselected has higher balance
      const existing = existingMap.get(key);
      if (existing && (pc.maxAmount || pc.amount)) {
        const preselectedBalance = pc.maxAmount || pc.amount || 0n;
        if (preselectedBalance > existing.rawBalance) {
          const index = merged.findIndex(c => addrKey(c.address) === key);
          if (index >= 0) {
            merged[index] = {
              ...existing,
              rawBalance: preselectedBalance,
              balance: Number(formatUnits(preselectedBalance, pc.decimals)),
            };
          }
        }
      }
    }
  });

  return sortList(merged);
}

/**
 * Hook that merges collaterals with proper memoization
 */
export function useMergedCollaterals(options: MergeCollateralsOptions): CollateralFromHook[] {
  const { collateralsFromHook, preSelectedCollaterals, disableCollateralSelection, sortByAddress } = options;
  return useMemo(
    () => mergeCollaterals({ collateralsFromHook, preSelectedCollaterals, disableCollateralSelection, sortByAddress }),
    [collateralsFromHook, preSelectedCollaterals, disableCollateralSelection, sortByAddress]
  );
}
