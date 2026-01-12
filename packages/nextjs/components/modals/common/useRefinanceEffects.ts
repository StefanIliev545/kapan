import { useEffect } from "react";
import { formatUnits } from "viem";

/* ------------------------------ Types ------------------------------ */
export type Protocol = {
  name: string;
  logo: string;
};

export type PreSelectedCollateral = {
  token: string;
  symbol: string;
  decimals: number;
  amount?: bigint;
  maxAmount?: bigint;
  inputValue?: string;
};

export type CollateralMeta = {
  address: string;
  decimals: number;
  rawBalance: bigint;
  balance: number;
};

/* ------------------------------ Helpers ------------------------------ */
const addrKey = (a?: string) => (a ?? "").toLowerCase();

/* ------------------------------ Effects ------------------------------ */

/**
 * Effect for initializing preselected collaterals
 *
 * Sets the expanded collateral and temp amount based on preselected values
 */
export type UsePreselectedCollateralsEffectOptions = {
  isOpen: boolean;
  preSelectedCollaterals?: PreSelectedCollateral[];
  collaterals: CollateralMeta[];
  expandedCollateral: string | null;
  setExpandedCollateral: (key: string) => void;
  setTempAmount: (amount: string) => void;
  setTempIsMax?: (isMax: boolean) => void;
};

export function usePreselectedCollateralsEffect({
  isOpen,
  preSelectedCollaterals,
  collaterals,
  expandedCollateral,
  setExpandedCollateral,
  setTempAmount,
  setTempIsMax,
}: UsePreselectedCollateralsEffectOptions): void {
  useEffect(() => {
    if (!isOpen || !preSelectedCollaterals || preSelectedCollaterals.length === 0 || collaterals.length === 0) {
      return;
    }

    const firstPreselected = preSelectedCollaterals[0];
    const firstPreselectedKey = addrKey(firstPreselected.token);
    const meta = collaterals.find(col => addrKey(col.address) === firstPreselectedKey);

    if (!meta || expandedCollateral) {
      return;
    }

    setExpandedCollateral(firstPreselectedKey);

    if (firstPreselected.amount) {
      const amount = formatUnits(firstPreselected.amount, firstPreselected.decimals);
      setTempAmount(amount);

      // If the provided amount equals full raw balance, mark as MAX by default
      if (setTempIsMax && firstPreselected.amount === meta.rawBalance) {
        setTempIsMax(true);
      }
    } else if (firstPreselected.inputValue) {
      setTempAmount(firstPreselected.inputValue);
    } else {
      // Default to full balance and mark as MAX until edited
      setTempAmount(formatUnits(meta.rawBalance, meta.decimals));
      setTempIsMax?.(true);
    }
  }, [isOpen, preSelectedCollaterals, collaterals, expandedCollateral, setExpandedCollateral, setTempAmount, setTempIsMax]);
}

/**
 * Effect for maintaining stable protocol selection
 *
 * Ensures a protocol is always selected when the modal is open
 */
export type UseStableProtocolSelectionOptions = {
  isOpen: boolean;
  filteredDestinationProtocols: Protocol[];
  selectedProtocol: string;
  setSelectedProtocol: (protocol: string) => void;
};

export function useStableProtocolSelection({
  isOpen,
  filteredDestinationProtocols,
  selectedProtocol,
  setSelectedProtocol,
}: UseStableProtocolSelectionOptions): void {
  useEffect(() => {
    if (!isOpen) return;

    // No protocol selected but we have options - select the first one
    if (!selectedProtocol && filteredDestinationProtocols.length > 0) {
      setSelectedProtocol(filteredDestinationProtocols[0].name);
      return;
    }

    // Selected protocol is no longer in the list - select the first available
    if (
      selectedProtocol &&
      filteredDestinationProtocols.length > 0 &&
      !filteredDestinationProtocols.some(p => p.name === selectedProtocol)
    ) {
      setSelectedProtocol(filteredDestinationProtocols[0].name);
    }
  }, [isOpen, filteredDestinationProtocols, selectedProtocol, setSelectedProtocol]);
}

/**
 * Effect for auto-focusing the debt input when modal opens
 */
export type UseDebtInputFocusOptions = {
  isOpen: boolean;
  debtConfirmed: boolean;
  debtInputRef: React.RefObject<HTMLInputElement | null>;
};

export function useDebtInputFocus({
  isOpen,
  debtConfirmed,
  debtInputRef,
}: UseDebtInputFocusOptions): void {
  useEffect(() => {
    if (!(isOpen && !debtConfirmed)) return;
    const t = setTimeout(() => debtInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isOpen, debtConfirmed, debtInputRef]);
}

/**
 * Combined hook for common refinance modal effects
 */
export type UseRefinanceEffectsOptions = UsePreselectedCollateralsEffectOptions &
  UseStableProtocolSelectionOptions &
  UseDebtInputFocusOptions & {
    resetState: () => void;
  };

export function useRefinanceEffects(options: UseRefinanceEffectsOptions): void {
  const {
    isOpen,
    preSelectedCollaterals,
    collaterals,
    expandedCollateral,
    setExpandedCollateral,
    setTempAmount,
    setTempIsMax,
    filteredDestinationProtocols,
    selectedProtocol,
    setSelectedProtocol,
    debtConfirmed,
    debtInputRef,
    resetState,
  } = options;

  // Initialize preselected collaterals
  usePreselectedCollateralsEffect({
    isOpen,
    preSelectedCollaterals,
    collaterals,
    expandedCollateral,
    setExpandedCollateral,
    setTempAmount,
    setTempIsMax,
  });

  // Maintain stable protocol selection
  useStableProtocolSelection({
    isOpen,
    filteredDestinationProtocols,
    selectedProtocol,
    setSelectedProtocol,
  });

  // Auto-focus debt input
  useDebtInputFocus({
    isOpen,
    debtConfirmed,
    debtInputRef,
  });

  // Reset state when modal closes/opens
  useEffect(() => {
    resetState();
  }, [isOpen, resetState]);
}
