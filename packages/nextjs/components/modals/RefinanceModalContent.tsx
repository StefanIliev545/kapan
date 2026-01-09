import React, { FC, ReactNode, useMemo, useCallback, memo } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon } from "@heroicons/react/24/outline";
import { formatUnits } from "viem";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { MorphoMarketSelector } from "../common/MorphoMarketSelector";
import { ErrorDisplay } from "../common/ErrorDisplay";
import { LoadingSpinner, ButtonLoading } from "../common/Loading";
import { VesuPoolSelect, CollateralAmountInputStyled, clampAmount } from "./common";
import type { MorphoMarket, MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";
import type {
  Collateral,
  Protocol,
  FlashLoanProvider,
  VesuPools,
} from "./common/useRefinanceTypes";

// Memoized protocol tile component to avoid inline function in map
type ProtocolTileProps = {
  protocol: Protocol;
  isSelected: boolean;
  isVesu: boolean;
  vesuPools?: VesuPools;
  selectedVersion: "v1" | "v2";
  sourcePoolName: string | null;
  setSelectedVersion: (v: "v1" | "v2") => void;
  selectedPool?: string;
  setSelectedPool?: (pool: string) => void;
  selectedPoolId?: bigint;
  selectedV2PoolAddress?: string;
  onPoolIdChange: (id: bigint) => void;
  onV2PoolAddressChange: (addr: string) => void;
  onSelect: (name: string) => void;
};

const ProtocolTile = memo<ProtocolTileProps>(({
  protocol,
  isSelected,
  isVesu,
  vesuPools,
  selectedVersion,
  sourcePoolName,
  setSelectedVersion,
  selectedPool,
  setSelectedPool,
  selectedPoolId,
  selectedV2PoolAddress,
  onPoolIdChange,
  onV2PoolAddressChange,
  onSelect,
}) => {
  const shouldExpand = isSelected && isVesu && vesuPools;
  const handleClick = useCallback(() => {
    onSelect(protocol.name);
  }, [onSelect, protocol.name]);

  return (
    <div
      className={`${shouldExpand ? "col-span-2 sm:col-span-3" : "col-span-1"} border p-2 ${isSelected ? "border-primary bg-primary/10" : "border-base-300"} cursor-pointer rounded transition-all`}
      onClick={handleClick}
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <Image src={protocol.logo} alt={protocol.name} width={24} height={24} className="flex-shrink-0 rounded" />
        <span className="flex-shrink-0 whitespace-nowrap text-sm">{protocol.name}</span>

        {(isSelected && isVesu && vesuPools) && (
          selectedPool !== undefined && setSelectedPool ? (
            <VesuPoolSelect
              mode="evm"
              selectedVersion={selectedVersion}
              vesuPools={vesuPools}
              sourcePoolName={sourcePoolName}
              onVersionChange={setSelectedVersion}
              selectedPool={selectedPool}
              onPoolChange={setSelectedPool}
            />
          ) : (
            <VesuPoolSelect
              mode="starknet"
              selectedVersion={selectedVersion}
              vesuPools={vesuPools}
              sourcePoolName={sourcePoolName}
              onVersionChange={setSelectedVersion}
              selectedPoolId={selectedPoolId}
              selectedV2PoolAddress={selectedV2PoolAddress}
              onPoolIdChange={onPoolIdChange}
              onV2PoolAddressChange={onV2PoolAddressChange}
            />
          )
        )}
      </div>
    </div>
  );
});
ProtocolTile.displayName = "ProtocolTile";

// Memoized flash loan provider button
type FlashLoanProviderButtonProps = {
  provider: FlashLoanProvider;
  isSelected: boolean;
  onSelect: (name: string) => void;
};

const FlashLoanProviderButton = memo<FlashLoanProviderButtonProps>(({
  provider,
  isSelected,
  onSelect,
}) => {
  const displayName = provider.name.replace(/\sV[0-9]+$/i, "");
  const handleClick = useCallback(() => {
    onSelect(provider.name);
  }, [onSelect, provider.name]);

  return (
    <button
      onClick={handleClick}
      className={`rounded border p-2 text-left ${isSelected ? "border-primary bg-primary/10" : "border-base-300"}`}
    >
      <div className="flex items-center gap-2">
        <Image src={provider.icon} alt={provider.name} width={20} height={20} className="rounded" />
        <span className="text-sm">{displayName}</span>
      </div>
    </button>
  );
});
FlashLoanProviderButton.displayName = "FlashLoanProviderButton";

// Memoized collateral tile component
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
    if (c.balance <= 0 || disableCollateralSelection || morphoHasOtherSelected) return;
    onTileClick(c.address);
  }, [c.balance, c.address, disableCollateralSelection, morphoHasOtherSelected, onTileClick]);

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
          {isAdded && <span className="text-success">✓</span>}
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

      {isExpanded && !disableCollateralSelection && (
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
      {disableCollateralSelection && !isAdded && (
        <CollateralAmountInputStyled
          variant="preselected"
          value={tempAmount || ""}
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
};

export const RefinanceModalContent: FC<RefinanceModalContentProps> = ({
  isOpen,
  onClose,
  debtSymbol,
  debtIcon,
  debtAmount,
  setDebtAmount,
  debtMaxLabel,
  debtMaxRaw,
  debtConfirmed,
  setDebtConfirmed,
  debtInputRef,
  sourceProtocol,
  setIsDebtMaxClicked,
  activeTab,
  setActiveTab,
  showFlashLoanTab,
  filteredDestinationProtocols,
  selectedProtocol,
  setSelectedProtocol,
  selectedVersion,
  setSelectedVersion,
  vesuPools,
  sourcePoolName,
  selectedPool,
  setSelectedPool,
  selectedPoolId,
  setSelectedPoolId,
  selectedV2PoolAddress,
  setSelectedV2PoolAddress,
  flashLoanProviders,
  selectedProvider,
  setSelectedProvider,
  collaterals,
  isLoadingCollaterals,
  effectiveSupportedMap,
  addedCollaterals,
  expandedCollateral,
  tempAmount,
  setTempAmount,
  setTempIsMax,
  onCollateralTileClick,
  onAddCollateral,
  disableCollateralSelection,
  preSelectedCollaterals,
  getUsdValue,
  refiHF,
  hfColor,
  totalCollateralUsd,
  ltv,
  debtUsd,
  isActionDisabled,
  isSubmitting,
  handleExecuteMove,
  showBatchingOption,
  preferBatching,
  setPreferBatching,
  revokePermissions,
  setRevokePermissions,
  errorMessage,
  apiProbes,
  // Morpho-specific props
  isMorphoSelected,
  morphoMarkets,
  selectedMorphoMarket,
  onMorphoMarketSelect,
  morphoSupportedCollaterals,
  isLoadingMorphoMarkets,
  chainId,
}) => {
  const addrKey = (a?: string) => (a ?? "").toLowerCase();

  // Determine effective supported collateral map
  // When Morpho is selected, use morphoSupportedCollaterals instead
  const effectiveCollateralSupport = isMorphoSelected && morphoSupportedCollaterals
    ? morphoSupportedCollaterals
    : effectiveSupportedMap;

  // Motion animation constants
  const motionInitial = useMemo(() => ({ opacity: 0, x: -12 }), []);
  const motionAnimate = useMemo(() => ({ opacity: 1, x: 0 }), []);
  const motionExit = useMemo(() => ({ opacity: 0, x: 12 }), []);
  const motionTransition = useMemo(() => ({ duration: 0.15 }), []);

  // Handlers for backdrop and close button
  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleCloseClick = useCallback(() => {
    onClose();
  }, [onClose]);

  // Debt input handlers
  const handleDebtInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = clampAmount(e.target.value, debtMaxRaw);
      setIsDebtMaxClicked(false);
      setDebtAmount(sanitized);
    },
    [debtMaxRaw, setIsDebtMaxClicked, setDebtAmount],
  );

  const handleDebtInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        setDebtConfirmed(Boolean(debtAmount && parseFloat(debtAmount) > 0));
      }
    },
    [debtAmount, setDebtConfirmed],
  );

  const handleMaxClick = useCallback(() => {
    const maxValue = (debtMaxRaw || debtMaxLabel || "").replace(/,/g, "");
    setIsDebtMaxClicked(true);
    setDebtAmount(maxValue);
  }, [debtMaxRaw, debtMaxLabel, setIsDebtMaxClicked, setDebtAmount]);

  const handleDebtConfirmClick = useCallback(() => {
    setDebtConfirmed(Boolean(debtAmount && parseFloat(debtAmount) > 0));
  }, [debtAmount, setDebtConfirmed]);

  const handleDebtUnconfirmClick = useCallback(() => {
    setDebtConfirmed(false);
  }, [setDebtConfirmed]);

  // Tab handlers
  const handleProtocolTabClick = useCallback(() => {
    setActiveTab("protocol");
  }, [setActiveTab]);

  const handleFlashLoanTabClick = useCallback(() => {
    setActiveTab("flashloan");
  }, [setActiveTab]);

  // Batching/revoke handlers
  const handleToggleBatching = useCallback(() => {
    setPreferBatching?.(prev => !prev);
  }, [setPreferBatching]);

  const handleToggleRevoke = useCallback(() => {
    setRevokePermissions?.(prev => !prev);
  }, [setRevokePermissions]);

  // Segmented action bar actions
  const segmentedActions = useMemo(
    () => [
      {
        key: "refinance",
        label: isSubmitting ? "Processing..." : "Refinance",
        icon: isSubmitting ? <ButtonLoading size="xs" /> : undefined,
        onClick: handleExecuteMove,
        disabled: isActionDisabled || isSubmitting,
        variant: "ghost" as const,
      },
    ],
    [isSubmitting, handleExecuteMove, isActionDisabled],
  );

  // Handler for CollateralAmountInputStyled onChange
  const handleCollateralInputChange = useCallback(
    (val: string) => {
      setTempIsMax(false);
      setTempAmount(val);
    },
    [setTempIsMax, setTempAmount],
  );

  // Handler for Vesu pool selection (Starknet mode)
  const handlePoolIdChange = useCallback(
    (id: bigint) => {
      setSelectedPoolId?.(id);
    },
    [setSelectedPoolId],
  );

  const handleV2PoolAddressChange = useCallback(
    (addr: string) => {
      setSelectedV2PoolAddress?.(addr);
    },
    [setSelectedV2PoolAddress],
  );

  // toLocaleString options - memoized to avoid recreating objects
  const localeOptionsMinMax2 = useMemo(
    () => ({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );
  const localeOptionsMax6 = useMemo(() => ({ maximumFractionDigits: 6 }), []);

  // Empty array for Morpho markets fallback
  const emptyMorphoMarkets = useMemo(() => [] as MorphoMarket[], []);

  // Handler for collateral max click (receives rawBalance and decimals from child)
  const handleCollateralMaxClick = useCallback(
    (rawBalance: bigint, decimals: number) => {
      setTempIsMax(true);
      setTempAmount(formatUnits(rawBalance, decimals));
    },
    [setTempIsMax, setTempAmount],
  );

  // Handler for collateral confirm (receives address and balance from child)
  const handleCollateralConfirm = useCallback(
    (address: string, balance: number) => {
      onAddCollateral(address, balance);
    },
    [onAddCollateral],
  );

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleBackdropClick} />
      <div className="modal-box bg-base-100 border-base-300/50 relative flex max-h-[90vh] max-w-2xl flex-col rounded-xl border p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base-content text-lg font-semibold">Refinance Position</h3>
          <button className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1.5 transition-colors" onClick={handleCloseClick}>✕</button>
        </div>

        <div className="space-y-4 overflow-y-auto">
          {/* Invisible price probes (debt + collaterals) */}
          {apiProbes}

          {/* Debt amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-base-content/80 text-sm">Amount to Refinance</span>
              {debtConfirmed && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-base-content/60 text-[11px] leading-none">Source Protocol</span>
                </div>
              )}
            </div>

            {!debtConfirmed ? (
              <div className="flex items-center gap-3">
                <div className="relative size-6">
                  <Image src={debtIcon} alt={debtSymbol} fill className="rounded-full" />
                </div>
                <span className="font-medium">{debtSymbol}</span>
                <div className="relative flex-1">
                  <input
                    ref={debtInputRef}
                    type="number"
                    value={debtAmount}
                    onChange={handleDebtInputChange}
                    onKeyDown={handleDebtInputKeyDown}
                    placeholder="0.00"
                    className="border-base-300 w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-20 outline-none"
                  />
                  {debtMaxLabel && (
                    <button
                      onClick={handleMaxClick}
                      className="text-primary absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      {debtMaxLabel}
                    </button>
                  )}
                </div>
                <button
                  onClick={handleDebtConfirmClick}
                  disabled={!debtAmount || parseFloat(debtAmount) <= 0}
                  className="text-base-content/40 hover:text-success p-1 disabled:opacity-40"
                  title="Confirm amount"
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex cursor-pointer items-center gap-3" onClick={handleDebtUnconfirmClick}>
                  <div className="relative size-6">
                    <Image src={debtIcon} alt={debtSymbol} fill className="rounded-full" />
                  </div>
                  <span className="font-medium">{debtSymbol}</span>
                  <span>{debtAmount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Image src={sourceProtocol.logo} alt={sourceProtocol.name} width={20} height={20} className="rounded-full" />
                  <span>{sourceProtocol.name}</span>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="space-y-2">
            <div className="border-base-300 flex items-center gap-6 border-b">
              <button
                className={`-mb-[1px] border-b-2 pb-2 ${activeTab === "protocol" ? "border-primary" : "text-base-content/60 border-transparent"}`}
                onClick={handleProtocolTabClick}
              >
                Destination Protocol
              </button>
              {showFlashLoanTab && (
                <button
                  className={`-mb-[1px] border-b-2 pb-2 ${activeTab === "flashloan" ? "border-primary" : "text-base-content/60 border-transparent"}`}
                  onClick={handleFlashLoanTabClick}
                >
                  Flash Loan Provider
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "protocol" ? (
                <motion.div
                  key="protocol"
                  initial={motionInitial}
                  animate={motionAnimate}
                  exit={motionExit}
                  transition={motionTransition}
                  className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                >
                  {filteredDestinationProtocols.map(p => (
                    <ProtocolTile
                      key={p.name}
                      protocol={p}
                      isSelected={selectedProtocol === p.name}
                      isVesu={p.name === "Vesu"}
                      vesuPools={vesuPools}
                      selectedVersion={selectedVersion}
                      sourcePoolName={sourcePoolName}
                      setSelectedVersion={setSelectedVersion}
                      selectedPool={selectedPool}
                      setSelectedPool={setSelectedPool}
                      selectedPoolId={selectedPoolId}
                      selectedV2PoolAddress={selectedV2PoolAddress}
                      onPoolIdChange={handlePoolIdChange}
                      onV2PoolAddressChange={handleV2PoolAddressChange}
                      onSelect={setSelectedProtocol}
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="flashloan"
                  initial={motionInitial}
                  animate={motionAnimate}
                  exit={motionExit}
                  transition={motionTransition}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5"
                >
                  {flashLoanProviders.map(p => (
                    <FlashLoanProviderButton
                      key={`${p.name}-${p.version}`}
                      provider={p}
                      isSelected={selectedProvider === p.name}
                      onSelect={setSelectedProvider}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="divider my-2" />

          {/* Collaterals */}
          <div className="space-y-2">
            <div className="text-base-content/80 text-sm">
              {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0
                ? "Collateral to Move"
                : isMorphoSelected
                  ? "Select Collateral to Move"
                  : "Select Collaterals to Move"}
            </div>
            {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
              <div className="text-base-content/60 bg-info/10 mb-2 rounded p-2 text-xs">
                <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this collateral cannot be changed.
              </div>
            )}
            {isMorphoSelected && !disableCollateralSelection && (
              <div className="text-base-content/60 bg-info/10 mb-2 rounded p-2 text-xs">
                <strong>Note:</strong> Morpho markets are isolated by collateral type. Select one collateral to see available markets.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {isLoadingCollaterals ? (
                <div className="col-span-2 flex items-center justify-center py-6">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
                (disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0
                  ? collaterals.filter(c =>
                    preSelectedCollaterals.some(pc => addrKey(pc.token) === addrKey(c.address)),
                  )
                  : collaterals
                ).map(c => {
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
                      disableCollateralSelection={disableCollateralSelection}
                      addedAmount={addedCollaterals[key]}
                      getUsdValue={getUsdValue}
                      localeOptionsMinMax2={localeOptionsMinMax2}
                      localeOptionsMax6={localeOptionsMax6}
                      tempAmount={tempAmount}
                      onTileClick={onCollateralTileClick}
                      onInputChange={handleCollateralInputChange}
                      onMaxClick={handleCollateralMaxClick}
                      onConfirm={handleCollateralConfirm}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Morpho Market Selector - shown when Morpho is selected and a collateral is chosen */}
          {isMorphoSelected && Object.keys(addedCollaterals).length > 0 && onMorphoMarketSelect && chainId && (
            <>
              <div className="divider my-2" />
              <MorphoMarketSelector
                markets={morphoMarkets ?? emptyMorphoMarkets}
                selectedMarket={selectedMorphoMarket ?? null}
                onSelectMarket={onMorphoMarketSelect}
                chainId={chainId}
                isLoading={isLoadingMorphoMarkets}
              />
            </>
          )}

          <div className="divider my-2" />

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-base-content/70 text-xs">Health Factor</div>
              <div className={`font-medium ${hfColor.tone}`}>
                {refiHF >= 999 ? "∞" : refiHF.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-base-content/70 text-xs">Collateral Amount</div>
              <div className="font-medium">
                ${totalCollateralUsd.toLocaleString(undefined, localeOptionsMinMax2)}
              </div>
            </div>
            <div>
              <div className="text-base-content/70 text-xs">LTV</div>
              <div className="font-medium">{ltv}%</div>
            </div>
            <div>
              <div className="text-base-content/70 text-xs">Debt Amount</div>
              <div className="font-medium">
                ${debtUsd.toLocaleString(undefined, localeOptionsMinMax2)}
              </div>
            </div>
          </div>

          {/* Error display */}
          {errorMessage && (
            <ErrorDisplay message={errorMessage} size="sm" />
          )}

          {/* Action */}
          <div className="flex items-center justify-between pt-2">
            {showBatchingOption && setPreferBatching && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={handleToggleBatching}
                  className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"
                    }`}
                >
                  <CheckIcon className={`size-4 ${preferBatching ? "" : "opacity-40"}`} />
                  Batch transactions
                </button>
                {setRevokePermissions && (
                  <button
                    type="button"
                    onClick={handleToggleRevoke}
                    className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${revokePermissions ? "text-success" : "text-base-content/60"
                      }`}
                  >
                    <CheckIcon className={`size-4 ${revokePermissions ? "" : "opacity-40"}`} />
                    Revoke permissions
                  </button>
                )}
              </div>
            )}
            {!showBatchingOption && <div />}

            <div className="ml-4 flex-1">
              <SegmentedActionBar
                className="w-full"
                autoCompact
                actions={segmentedActions}
              />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};

