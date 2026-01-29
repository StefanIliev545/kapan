import React, { createContext, useContext, useMemo, type ReactNode, type JSX } from "react";
import type { MorphoMarket, MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";
import type {
  Collateral,
  Protocol,
  FlashLoanProvider,
  VesuPools,
} from "../common/useRefinanceTypes";

/* ------------------------------ Context Types ------------------------------ */

/**
 * Debt-related state and callbacks
 */
export type DebtState = {
  symbol: string;
  icon: string;
  amount: string;
  setAmount: (value: string) => void;
  maxLabel?: string;
  maxRaw?: string;
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  sourceProtocol: Protocol;
  setIsMaxClicked: (value: boolean) => void;
};

/**
 * Tab navigation state
 */
export type TabState = {
  activeTab: "protocol" | "flashloan";
  setActiveTab: (tab: "protocol" | "flashloan") => void;
  showFlashLoanTab: boolean;
};

/**
 * Protocol selection state and callbacks
 */
export type ProtocolState = {
  filteredDestinationProtocols: Protocol[];
  selectedProtocol: string;
  setSelectedProtocol: (protocol: string) => void;
  selectedVersion: "v1" | "v2";
  setSelectedVersion: (version: "v1" | "v2") => void;
  vesuPools?: VesuPools;
  sourcePoolName: string | null;
  // EVM-specific pool selection
  selectedPool?: string;
  setSelectedPool?: (pool: string) => void;
  // Starknet-specific pool selection
  selectedPoolId?: bigint;
  setSelectedPoolId?: (id: bigint) => void;
  selectedV2PoolAddress?: string;
  setSelectedV2PoolAddress?: (address: string) => void;
};

/**
 * Flash loan provider state (EVM only)
 */
export type FlashLoanState = {
  providers: FlashLoanProvider[];
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
};

/**
 * Pre-selected collateral item (for Vesu pair isolation)
 */
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

/**
 * Collateral selection state and callbacks
 */
export type CollateralState = {
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

/**
 * Stats display state
 */
export type StatsState = {
  refiHF: number;
  hfColor: { tone: string; badge: string };
  totalCollateralUsd: number;
  ltv: string;
  debtUsd: number;
};

/**
 * Action button state and callbacks
 */
export type ActionsState = {
  isDisabled: boolean;
  isSubmitting: boolean;
  handleExecuteMove: () => void;
  // Network-specific options
  showBatchingOption: boolean;
  preferBatching: boolean;
  setPreferBatching?: React.Dispatch<React.SetStateAction<boolean>>;
  revokePermissions?: boolean;
  setRevokePermissions?: React.Dispatch<React.SetStateAction<boolean>>;
  hasActiveADLOrders?: boolean;
};

/**
 * Morpho-specific state (EVM only)
 */
export type MorphoState = {
  isSelected?: boolean;
  markets?: MorphoMarket[];
  selectedMarket?: MorphoMarket | null;
  onMarketSelect?: (market: MorphoMarket, context: MorphoMarketContext) => void;
  supportedCollaterals?: Record<string, boolean>;
  isLoadingMarkets?: boolean;
  chainId?: number;
};

/**
 * Euler-specific state (EVM only)
 */
export type EulerState = {
  isSelected?: boolean;
  supportedCollaterals?: Record<string, boolean>;
  subAccountIndex?: number;
  isNewSubAccount?: boolean;
};

/**
 * Modal-level state
 */
export type ModalState = {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string;
  apiProbes?: ReactNode;
};

/**
 * Complete refinance context value
 */
export type RefinanceContextValue = {
  modal: ModalState;
  debt: DebtState;
  tabs: TabState;
  protocol: ProtocolState;
  flashLoan: FlashLoanState;
  collateral: CollateralState;
  stats: StatsState;
  actions: ActionsState;
  morpho: MorphoState;
  euler: EulerState;
};

/* ------------------------------ Context Definition ------------------------------ */

const RefinanceContext = createContext<RefinanceContextValue | null>(null);

/**
 * Hook to consume the RefinanceContext.
 * Throws an error if used outside of RefinanceProvider.
 */
export function useRefinanceContext(): RefinanceContextValue {
  const context = useContext(RefinanceContext);
  if (!context) {
    throw new Error("useRefinanceContext must be used within a RefinanceProvider");
  }
  return context;
}

/**
 * Selective hooks for accessing specific parts of the context.
 * These help with performance by allowing components to subscribe to only what they need.
 */
export function useDebtState(): DebtState {
  return useRefinanceContext().debt;
}

export function useTabState(): TabState {
  return useRefinanceContext().tabs;
}

export function useProtocolState(): ProtocolState {
  return useRefinanceContext().protocol;
}

export function useFlashLoanState(): FlashLoanState {
  return useRefinanceContext().flashLoan;
}

export function useCollateralState(): CollateralState {
  return useRefinanceContext().collateral;
}

export function useStatsState(): StatsState {
  return useRefinanceContext().stats;
}

export function useActionsState(): ActionsState {
  return useRefinanceContext().actions;
}

export function useMorphoState(): MorphoState {
  return useRefinanceContext().morpho;
}

export function useEulerState(): EulerState {
  return useRefinanceContext().euler;
}

export function useModalState(): ModalState {
  return useRefinanceContext().modal;
}

/* ------------------------------ Provider Props ------------------------------ */

export type RefinanceProviderProps = {
  children: ReactNode;
  value: RefinanceContextValue;
};

/**
 * Provider component that wraps refinance modal content and provides
 * all state through context, eliminating prop drilling.
 */
export function RefinanceProvider({ children, value }: RefinanceProviderProps): JSX.Element {
  // Memoize the context value to prevent unnecessary re-renders
  const memoizedValue = useMemo(() => value, [value]);

  return (
    <RefinanceContext.Provider value={memoizedValue}>
      {children}
    </RefinanceContext.Provider>
  );
}

/* ------------------------------ Helper to build context value ------------------------------ */

/**
 * Props that map to the original RefinanceModalContentProps interface.
 * Used to build the context value from the original props.
 */
export type RefinanceContextBuilderProps = {
  isOpen: boolean;
  onClose: () => void;

  // Debt section
  debtSymbol: string;
  debtIcon: string;
  debtAmount: string;
  setDebtAmount: (value: string) => void;
  debtMaxLabel?: string;
  debtMaxRaw?: string;
  debtConfirmed: boolean;
  setDebtConfirmed: (value: boolean) => void;
  debtInputRef: React.RefObject<HTMLInputElement | null>;
  sourceProtocol: Protocol;
  setIsDebtMaxClicked: (value: boolean) => void;

  // Tabs
  activeTab: "protocol" | "flashloan";
  setActiveTab: (tab: "protocol" | "flashloan") => void;
  showFlashLoanTab: boolean;

  // Protocol selection
  filteredDestinationProtocols: Protocol[];
  selectedProtocol: string;
  setSelectedProtocol: (protocol: string) => void;
  selectedVersion: "v1" | "v2";
  setSelectedVersion: (version: "v1" | "v2") => void;
  vesuPools?: VesuPools;
  sourcePoolName: string | null;
  selectedPool?: string;
  setSelectedPool?: (pool: string) => void;
  selectedPoolId?: bigint;
  setSelectedPoolId?: (id: bigint) => void;
  selectedV2PoolAddress?: string;
  setSelectedV2PoolAddress?: (address: string) => void;

  // Flash loan providers
  flashLoanProviders: FlashLoanProvider[];
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;

  // Collaterals
  collaterals: Collateral[];
  isLoadingCollaterals: boolean;
  effectiveSupportedMap: Record<string, boolean>;
  addedCollaterals: Record<string, string>;
  expandedCollateral: string | null;
  tempAmount: string;
  setTempAmount: (value: string) => void;
  setTempIsMax: (value: boolean) => void;
  onCollateralTileClick: (address: string) => void;
  onAddCollateral: (address: string, balance: number) => void;
  disableCollateralSelection?: boolean;
  preSelectedCollaterals?: PreSelectedCollateralItem[];
  getUsdValue: (address: string, amount: string) => number;

  // Stats
  refiHF: number;
  hfColor: { tone: string; badge: string };
  totalCollateralUsd: number;
  ltv: string;
  debtUsd: number;

  // Actions
  isActionDisabled: boolean;
  isSubmitting: boolean;
  handleExecuteMove: () => void;
  showBatchingOption: boolean;
  preferBatching: boolean;
  setPreferBatching?: React.Dispatch<React.SetStateAction<boolean>>;
  revokePermissions?: boolean;
  setRevokePermissions?: React.Dispatch<React.SetStateAction<boolean>>;
  hasActiveADLOrders?: boolean;

  // Error display
  errorMessage?: string;

  // Price probes
  apiProbes?: ReactNode;

  // Morpho-specific
  isMorphoSelected?: boolean;
  morphoMarkets?: MorphoMarket[];
  selectedMorphoMarket?: MorphoMarket | null;
  onMorphoMarketSelect?: (market: MorphoMarket, context: MorphoMarketContext) => void;
  morphoSupportedCollaterals?: Record<string, boolean>;
  isLoadingMorphoMarkets?: boolean;
  chainId?: number;

  // Euler-specific
  isEulerSelected?: boolean;
  eulerSupportedCollaterals?: Record<string, boolean>;
  eulerSubAccountIndex?: number;
  isNewEulerSubAccount?: boolean;
};

/**
 * Builds a RefinanceContextValue from the original props format.
 * This allows backwards compatibility while using the new context pattern internally.
 */
export function buildRefinanceContextValue(props: RefinanceContextBuilderProps): RefinanceContextValue {
  return {
    modal: {
      isOpen: props.isOpen,
      onClose: props.onClose,
      errorMessage: props.errorMessage,
      apiProbes: props.apiProbes,
    },
    debt: {
      symbol: props.debtSymbol,
      icon: props.debtIcon,
      amount: props.debtAmount,
      setAmount: props.setDebtAmount,
      maxLabel: props.debtMaxLabel,
      maxRaw: props.debtMaxRaw,
      confirmed: props.debtConfirmed,
      setConfirmed: props.setDebtConfirmed,
      inputRef: props.debtInputRef,
      sourceProtocol: props.sourceProtocol,
      setIsMaxClicked: props.setIsDebtMaxClicked,
    },
    tabs: {
      activeTab: props.activeTab,
      setActiveTab: props.setActiveTab,
      showFlashLoanTab: props.showFlashLoanTab,
    },
    protocol: {
      filteredDestinationProtocols: props.filteredDestinationProtocols,
      selectedProtocol: props.selectedProtocol,
      setSelectedProtocol: props.setSelectedProtocol,
      selectedVersion: props.selectedVersion,
      setSelectedVersion: props.setSelectedVersion,
      vesuPools: props.vesuPools,
      sourcePoolName: props.sourcePoolName,
      selectedPool: props.selectedPool,
      setSelectedPool: props.setSelectedPool,
      selectedPoolId: props.selectedPoolId,
      setSelectedPoolId: props.setSelectedPoolId,
      selectedV2PoolAddress: props.selectedV2PoolAddress,
      setSelectedV2PoolAddress: props.setSelectedV2PoolAddress,
    },
    flashLoan: {
      providers: props.flashLoanProviders,
      selectedProvider: props.selectedProvider,
      setSelectedProvider: props.setSelectedProvider,
    },
    collateral: {
      collaterals: props.collaterals,
      isLoading: props.isLoadingCollaterals,
      effectiveSupportedMap: props.effectiveSupportedMap,
      addedCollaterals: props.addedCollaterals,
      expandedCollateral: props.expandedCollateral,
      tempAmount: props.tempAmount,
      setTempAmount: props.setTempAmount,
      setTempIsMax: props.setTempIsMax,
      onTileClick: props.onCollateralTileClick,
      onAddCollateral: props.onAddCollateral,
      disableSelection: props.disableCollateralSelection,
      preSelectedCollaterals: props.preSelectedCollaterals,
      getUsdValue: props.getUsdValue,
    },
    stats: {
      refiHF: props.refiHF,
      hfColor: props.hfColor,
      totalCollateralUsd: props.totalCollateralUsd,
      ltv: props.ltv,
      debtUsd: props.debtUsd,
    },
    actions: {
      isDisabled: props.isActionDisabled,
      isSubmitting: props.isSubmitting,
      handleExecuteMove: props.handleExecuteMove,
      showBatchingOption: props.showBatchingOption,
      preferBatching: props.preferBatching,
      setPreferBatching: props.setPreferBatching,
      revokePermissions: props.revokePermissions,
      setRevokePermissions: props.setRevokePermissions,
      hasActiveADLOrders: props.hasActiveADLOrders,
    },
    morpho: {
      isSelected: props.isMorphoSelected,
      markets: props.morphoMarkets,
      selectedMarket: props.selectedMorphoMarket,
      onMarketSelect: props.onMorphoMarketSelect,
      supportedCollaterals: props.morphoSupportedCollaterals,
      isLoadingMarkets: props.isLoadingMorphoMarkets,
      chainId: props.chainId,
    },
    euler: {
      isSelected: props.isEulerSelected,
      supportedCollaterals: props.eulerSupportedCollaterals,
      subAccountIndex: props.eulerSubAccountIndex,
      isNewSubAccount: props.isNewEulerSubAccount,
    },
  };
}
