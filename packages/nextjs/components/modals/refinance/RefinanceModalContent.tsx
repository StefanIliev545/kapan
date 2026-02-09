import React, { FC, ReactNode, useCallback, useMemo } from "react";
import { ErrorDisplay } from "../../common/ErrorDisplay";
import {
  DebtSection,
  ProtocolSelector,
  CollateralGrid,
  MorphoMarketSection,
  EulerVaultSection,
  StatsDisplay,
  ActionsFooter,
} from "./sections";
import {
  RefinanceProvider,
  buildRefinanceContextValue,
  type RefinanceContextBuilderProps,
} from "./RefinanceContext";
import type { MorphoMarket, MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";
import type {
  Collateral,
  Protocol,
  FlashLoanProvider,
  VesuPools,
} from "../common/useRefinanceTypes";

export type RefinanceModalContentProps = {
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

  // EVM-specific pool selection
  selectedPool?: string;
  setSelectedPool?: (pool: string) => void;

  // Starknet-specific pool selection
  selectedPoolId?: bigint;
  setSelectedPoolId?: (id: bigint) => void;
  selectedV2PoolAddress?: string;
  setSelectedV2PoolAddress?: (address: string) => void;

  // Flash loan providers (EVM only)
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
  preSelectedCollaterals?: Array<{
    token: string;
    symbol: string;
    decimals: number;
    amount?: bigint;
    maxAmount?: bigint;
    inputValue?: string;
    /** Euler-specific: The collateral vault address for this collateral */
    eulerCollateralVault?: string;
  }>;
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

  // Network-specific options
  showBatchingOption: boolean;
  preferBatching: boolean;
  setPreferBatching?: React.Dispatch<React.SetStateAction<boolean>>;
  revokePermissions?: boolean;
  setRevokePermissions?: React.Dispatch<React.SetStateAction<boolean>>;
  /** Whether user has active ADL orders (disables revoke permissions) */
  hasActiveADLOrders?: boolean;

  // Error display
  errorMessage?: string;

  // Price probes (invisible)
  apiProbes?: ReactNode;

  // Morpho-specific props (EVM only)
  isMorphoSelected?: boolean;
  morphoMarkets?: MorphoMarket[];
  selectedMorphoMarket?: MorphoMarket | null;
  onMorphoMarketSelect?: (market: MorphoMarket, context: MorphoMarketContext) => void;
  morphoSupportedCollaterals?: Record<string, boolean>;
  isLoadingMorphoMarkets?: boolean;
  chainId?: number;

  // Euler-specific props (EVM only)
  isEulerSelected?: boolean;
  eulerSupportedCollaterals?: Record<string, boolean>;
  /** Euler sub-account index (0 = main account, 1-255 = sub-accounts) */
  eulerSubAccountIndex?: number;
  /** Whether this will create a new Euler sub-account vs adding to existing */
  isNewEulerSubAccount?: boolean;
};

/**
 * RefinanceModalContent is the main orchestrator component for the refinance modal.
 * It composes the following sections using a Context pattern to avoid prop drilling:
 * - DebtSection: Debt amount input and confirmation
 * - ProtocolSelector: Destination protocol and flash loan provider tabs
 * - EulerVaultSection: Euler sub-account indicator
 * - CollateralGrid: Collateral selection grid
 * - MorphoMarketSection: Morpho market selector
 * - StatsDisplay: Health factor, LTV, and amounts
 * - ActionsFooter: Execute button and options
 *
 * All sub-components can be used either:
 * 1. With the RefinanceProvider (context) - no props needed
 * 2. Standalone with explicit props - for custom compositions
 */
export const RefinanceModalContent: FC<RefinanceModalContentProps> = (props) => {
  const {
    isOpen,
    onClose,
    errorMessage,
    apiProbes,
  } = props;

  // Handlers for backdrop and close button
  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleCloseClick = useCallback(() => {
    onClose();
  }, [onClose]);

  // Build context value from props for backwards compatibility
  const contextValue = useMemo(() => {
    const builderProps: RefinanceContextBuilderProps = {
      isOpen: props.isOpen,
      onClose: props.onClose,
      debtSymbol: props.debtSymbol,
      debtIcon: props.debtIcon,
      debtAmount: props.debtAmount,
      setDebtAmount: props.setDebtAmount,
      debtMaxLabel: props.debtMaxLabel,
      debtMaxRaw: props.debtMaxRaw,
      debtConfirmed: props.debtConfirmed,
      setDebtConfirmed: props.setDebtConfirmed,
      debtInputRef: props.debtInputRef,
      sourceProtocol: props.sourceProtocol,
      setIsDebtMaxClicked: props.setIsDebtMaxClicked,
      activeTab: props.activeTab,
      setActiveTab: props.setActiveTab,
      showFlashLoanTab: props.showFlashLoanTab,
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
      flashLoanProviders: props.flashLoanProviders,
      selectedProvider: props.selectedProvider,
      setSelectedProvider: props.setSelectedProvider,
      collaterals: props.collaterals,
      isLoadingCollaterals: props.isLoadingCollaterals,
      effectiveSupportedMap: props.effectiveSupportedMap,
      addedCollaterals: props.addedCollaterals,
      expandedCollateral: props.expandedCollateral,
      tempAmount: props.tempAmount,
      setTempAmount: props.setTempAmount,
      setTempIsMax: props.setTempIsMax,
      onCollateralTileClick: props.onCollateralTileClick,
      onAddCollateral: props.onAddCollateral,
      disableCollateralSelection: props.disableCollateralSelection,
      preSelectedCollaterals: props.preSelectedCollaterals,
      getUsdValue: props.getUsdValue,
      refiHF: props.refiHF,
      hfColor: props.hfColor,
      totalCollateralUsd: props.totalCollateralUsd,
      ltv: props.ltv,
      debtUsd: props.debtUsd,
      isActionDisabled: props.isActionDisabled,
      isSubmitting: props.isSubmitting,
      handleExecuteMove: props.handleExecuteMove,
      showBatchingOption: props.showBatchingOption,
      preferBatching: props.preferBatching,
      setPreferBatching: props.setPreferBatching,
      revokePermissions: props.revokePermissions,
      setRevokePermissions: props.setRevokePermissions,
      hasActiveADLOrders: props.hasActiveADLOrders,
      errorMessage: props.errorMessage,
      apiProbes: props.apiProbes,
      isMorphoSelected: props.isMorphoSelected,
      morphoMarkets: props.morphoMarkets,
      selectedMorphoMarket: props.selectedMorphoMarket,
      onMorphoMarketSelect: props.onMorphoMarketSelect,
      morphoSupportedCollaterals: props.morphoSupportedCollaterals,
      isLoadingMorphoMarkets: props.isLoadingMorphoMarkets,
      chainId: props.chainId,
      isEulerSelected: props.isEulerSelected,
      eulerSupportedCollaterals: props.eulerSupportedCollaterals,
      eulerSubAccountIndex: props.eulerSubAccountIndex,
      isNewEulerSubAccount: props.isNewEulerSubAccount,
    };
    return buildRefinanceContextValue(builderProps);
  }, [props]);

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleBackdropClick} />
      <div className="modal-box bg-base-100 border-base-300/50 relative flex max-h-[90vh] max-w-2xl flex-col rounded-xl border p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base-content text-lg font-semibold">Refinance Position</h3>
          <button
            className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1.5 transition-colors"
            onClick={handleCloseClick}
          >
            &#x2715;
          </button>
        </div>

        <RefinanceProvider value={contextValue}>
          <div className="space-y-4 overflow-y-auto">
            {/* Invisible price probes (debt + collaterals) */}
            {apiProbes}

            {/* Debt Section - uses context */}
            <DebtSection />

            {/* Protocol and Flash Loan Selector - uses context */}
            <ProtocolSelector />

            {/* Euler Sub-account Indicator - uses context */}
            <EulerVaultSection />

            <div className="divider my-2" />

            {/* Collateral Grid - uses context */}
            <CollateralGrid />

            {/* Morpho Market Selector - uses context */}
            <MorphoMarketSection />

            <div className="divider my-2" />

            {/* Stats Display - uses context */}
            <StatsDisplay />

            {/* Error Display */}
            {errorMessage && (
              <ErrorDisplay message={errorMessage} size="sm" />
            )}

            {/* Actions Footer - uses context */}
            <ActionsFooter />
          </div>
        </RefinanceProvider>
      </div>
    </dialog>
  );
};
