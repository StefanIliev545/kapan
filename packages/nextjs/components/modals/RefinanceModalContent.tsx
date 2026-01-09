import React, { FC, ReactNode } from "react";
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

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-box bg-base-100 border-base-300/50 relative flex max-h-[90vh] max-w-2xl flex-col rounded-xl border p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base-content text-lg font-semibold">Refinance Position</h3>
          <button className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1.5 transition-colors" onClick={onClose}>✕</button>
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
                    onChange={e => {
                      const sanitized = clampAmount(e.target.value, debtMaxRaw);
                      setIsDebtMaxClicked(false);
                      setDebtAmount(sanitized);
                    }}
                    onKeyDown={e => e.key === "Enter" && setDebtConfirmed(Boolean(debtAmount && parseFloat(debtAmount) > 0))}
                    placeholder="0.00"
                    className="border-base-300 w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-20 outline-none"
                  />
                  {debtMaxLabel && (
                    <button
                      onClick={() => {
                        const maxValue = (debtMaxRaw || debtMaxLabel).replace(/,/g, "");
                        setIsDebtMaxClicked(true);
                        setDebtAmount(maxValue);
                      }}
                      className="text-primary absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      {debtMaxLabel}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setDebtConfirmed(Boolean(debtAmount && parseFloat(debtAmount) > 0))}
                  disabled={!debtAmount || parseFloat(debtAmount) <= 0}
                  className="text-base-content/40 hover:text-success p-1 disabled:opacity-40"
                  title="Confirm amount"
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex cursor-pointer items-center gap-3" onClick={() => setDebtConfirmed(false)}>
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
                onClick={() => setActiveTab("protocol")}
              >
                Destination Protocol
              </button>
              {showFlashLoanTab && (
                <button
                  className={`-mb-[1px] border-b-2 pb-2 ${activeTab === "flashloan" ? "border-primary" : "text-base-content/60 border-transparent"}`}
                  onClick={() => setActiveTab("flashloan")}
                >
                  Flash Loan Provider
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "protocol" ? (
                <motion.div
                  key="protocol"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                >
                  {filteredDestinationProtocols.map(p => {
                    const isSelected = selectedProtocol === p.name;
                    const isVesu = p.name === "Vesu";
                    const shouldExpand = isSelected && isVesu && vesuPools;

                    return (
                      <div
                        key={p.name}
                        className={`${shouldExpand ? "col-span-2 sm:col-span-3" : "col-span-1"} border p-2 ${isSelected ? "border-primary bg-primary/10" : "border-base-300"} cursor-pointer rounded transition-all`}
                        onClick={() => setSelectedProtocol(p.name)}
                      >
                        <div className="flex min-w-0 flex-nowrap items-center gap-2">
                          <Image src={p.logo} alt={p.name} width={24} height={24} className="flex-shrink-0 rounded" />
                          <span className="flex-shrink-0 whitespace-nowrap text-sm">{p.name}</span>

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
                                onPoolIdChange={id => setSelectedPoolId?.(id)}
                                onV2PoolAddressChange={addr => setSelectedV2PoolAddress?.(addr)}
                              />
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="flashloan"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5"
                >
                  {flashLoanProviders.map(p => {
                    const displayName = p.name.replace(/\sV[0-9]+$/i, "");
                    return (
                      <button
                        key={`${p.name}-${p.version}`}
                        onClick={() => setSelectedProvider(p.name)}
                        className={`rounded border p-2 text-left ${selectedProvider === p.name ? "border-primary bg-primary/10" : "border-base-300"}`}
                      >
                        <div className="flex items-center gap-2">
                          <Image src={p.icon} alt={p.name} width={20} height={20} className="rounded" />
                          <span className="text-sm">{displayName}</span>
                        </div>
                      </button>
                    );
                  })}
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
                  const morphoHasOtherSelected = isMorphoSelected && 
                    Object.keys(addedCollaterals).length > 0 && 
                    !isAdded;

                  return (
                    <div
                      key={c.address}
                      className={`rounded border p-2 ${isExpanded ? "col-span-2" : ""} ${isAdded ? "border-success bg-success/10" : supported && !morphoHasOtherSelected ? "border-base-300" : "border-error/50 opacity-60"
                        } ${c.balance <= 0 || morphoHasOtherSelected ? "cursor-not-allowed opacity-50" : disableCollateralSelection ? "cursor-default" : "cursor-pointer"}`}
                      onClick={() => {
                        if (c.balance <= 0 || disableCollateralSelection || morphoHasOtherSelected) return;
                        onCollateralTileClick(c.address);
                      }}
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
                          {addedCollaterals[key]
                            ? `$${getUsdValue(c.address, addedCollaterals[key]).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                            : `${c.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
                        </span>
                      </div>

                      {isExpanded && !disableCollateralSelection && (
                        <CollateralAmountInputStyled
                          variant="expanded"
                          value={tempAmount}
                          onChange={val => {
                            setTempIsMax(false);
                            setTempAmount(val);
                          }}
                          onMaxClick={() => {
                            setTempIsMax(true);
                            setTempAmount(formatUnits(c.rawBalance, c.decimals));
                          }}
                          onConfirm={() => onAddCollateral(c.address, c.balance)}
                          rawBalance={c.rawBalance}
                          decimals={c.decimals}
                          balance={c.balance}
                        />
                      )}
                      {disableCollateralSelection && !isAdded && (
                        <CollateralAmountInputStyled
                          variant="preselected"
                          value={tempAmount || ""}
                          onChange={val => {
                            setTempIsMax(false);
                            setTempAmount(val);
                          }}
                          onMaxClick={() => {
                            setTempIsMax(true);
                            setTempAmount(formatUnits(c.rawBalance, c.decimals));
                          }}
                          onConfirm={() => onAddCollateral(c.address, c.balance)}
                          rawBalance={c.rawBalance}
                          decimals={c.decimals}
                          balance={c.balance}
                        />
                      )}
                    </div>
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
                markets={morphoMarkets || []}
                selectedMarket={selectedMorphoMarket || null}
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
                ${totalCollateralUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-base-content/70 text-xs">LTV</div>
              <div className="font-medium">{ltv}%</div>
            </div>
            <div>
              <div className="text-base-content/70 text-xs">Debt Amount</div>
              <div className="font-medium">
                ${debtUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  onClick={() => setPreferBatching(prev => !prev)}
                  className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"
                    }`}
                >
                  <CheckIcon className={`size-4 ${preferBatching ? "" : "opacity-40"}`} />
                  Batch transactions
                </button>
                {setRevokePermissions && (
                  <button
                    type="button"
                    onClick={() => setRevokePermissions(prev => !prev)}
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
                actions={[
                  {
                    key: "refinance",
                    label: isSubmitting ? "Processing..." : "Refinance",
                    icon: isSubmitting ? <ButtonLoading size="xs" /> : undefined,
                    onClick: handleExecuteMove,
                    disabled: isActionDisabled || isSubmitting,
                    variant: "ghost",
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};

