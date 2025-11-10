import React, { FC, ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheck, FiAlertTriangle } from "react-icons/fi";
import { formatUnits } from "viem";

/* ------------------------------ Helpers ------------------------------ */
const clampAmount = (value: string, max?: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "";

  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return "";

  if (max != null) {
    const maxParsed = parseFloat(max);
    if (Number.isFinite(maxParsed) && parsed > maxParsed) {
      return max;
    }
  }

  return trimmed;
};

type Collateral = {
  address: string;
  symbol: string;
  icon: string;
  decimals: number;
  rawBalance: bigint;
  balance: number;
};

type Protocol = {
  name: string;
  logo: string;
};

type FlashLoanProvider = {
  name: string;
  icon: string;
  version: string;
};

type VesuPools = {
  v1Pools: Array<{ name: string; id?: bigint }>;
  v2Pools: Array<{ name: string; address?: string }>;
};

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
  debtInputRef: React.RefObject<HTMLInputElement>;
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
  
  // Error display
  errorMessage?: string;
  
  // Price probes (invisible)
  apiProbes?: ReactNode;
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
  errorMessage,
  apiProbes,
}) => {
  const addrKey = (a?: string) => (a ?? "").toLowerCase();

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-2xl max-h-[90vh] p-6 rounded-none flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Refinance Position</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-4 overflow-y-auto">
          {/* Invisible price probes (debt + collaterals) */}
          {apiProbes}

          {/* Debt amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/80">Amount to Refinance</span>
              {debtConfirmed && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11px] text-base-content/60 leading-none">Source Protocol</span>
                </div>
              )}
            </div>

            {!debtConfirmed ? (
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 relative">
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
                    className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-20 outline-none"
                  />
                  {debtMaxLabel && (
                    <button
                      onClick={() => {
                        const maxValue = (debtMaxRaw || debtMaxLabel).replace(/,/g, "");
                        setIsDebtMaxClicked(true);
                        setDebtAmount(maxValue);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
                    >
                      {debtMaxLabel}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setDebtConfirmed(Boolean(debtAmount && parseFloat(debtAmount) > 0))}
                  disabled={!debtAmount || parseFloat(debtAmount) <= 0}
                  className="p-1 text-base-content/40 hover:text-success disabled:opacity-40"
                  title="Confirm amount"
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setDebtConfirmed(false)}>
                  <div className="w-6 h-6 relative">
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
            <div className="flex items-center gap-6 border-b border-base-300">
              <button
                className={`pb-2 -mb-[1px] border-b-2 ${activeTab === "protocol" ? "border-primary" : "border-transparent text-base-content/60"}`}
                onClick={() => setActiveTab("protocol")}
              >
                Destination Protocol
              </button>
              {showFlashLoanTab && (
                <button
                  className={`pb-2 -mb-[1px] border-b-2 ${activeTab === "flashloan" ? "border-primary" : "border-transparent text-base-content/60"}`}
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
                  className="grid grid-cols-3 sm:grid-cols-4 gap-2"
                >
                  {filteredDestinationProtocols.map(p => {
                    const isSelected = selectedProtocol === p.name;
                    const isVesu = p.name === "Vesu";
                    const shouldExpand = isSelected && isVesu && vesuPools;

                    return (
                      <div
                        key={p.name}
                        className={`${shouldExpand ? "col-span-2 sm:col-span-3" : "col-span-1"} p-2 border ${isSelected ? "border-primary bg-primary/10" : "border-base-300"} rounded cursor-pointer transition-all`}
                        onClick={() => setSelectedProtocol(p.name)}
                      >
                        <div className="flex items-center gap-2 flex-nowrap min-w-0">
                          <Image src={p.logo} alt={p.name} width={24} height={24} className="rounded flex-shrink-0" />
                          <span className="text-sm whitespace-nowrap flex-shrink-0">{p.name}</span>
                          
                          {(isSelected && isVesu && vesuPools) && (
                            <div className="flex items-center gap-1 flex-nowrap ml-auto flex-shrink-0">
                              {/* Version toggle */}
                              <div className="join join-xs flex-shrink-0">
                                <button
                                  className={`btn btn-ghost btn-xs join-item ${selectedVersion === "v1" ? "btn-active" : ""}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (selectedVersion !== "v1") {
                                      setSelectedVersion("v1");
                                      if (selectedPoolId !== undefined && vesuPools.v1Pools[0]?.id) {
                                        setSelectedPoolId?.(vesuPools.v1Pools[0].id);
                                      }
                                    }
                                  }}
                                >
                                  V1
                                </button>
                                <button
                                  className={`btn btn-ghost btn-xs join-item ${selectedVersion === "v2" ? "btn-active" : ""}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (selectedVersion !== "v2") {
                                      setSelectedVersion("v2");
                                      if (selectedV2PoolAddress !== undefined && vesuPools.v2Pools[0]?.address) {
                                        setSelectedV2PoolAddress?.(vesuPools.v2Pools[0].address);
                                      }
                                    }
                                  }}
                                >
                                  V2
                                </button>
                              </div>

                              {/* Pool select */}
                              {selectedPool !== undefined && setSelectedPool ? (
                                <select
                                  className="select select-bordered select-xs flex-shrink-0 w-auto max-w-[140px] min-w-[100px] text-xs"
                                  value={selectedPool}
                                  onChange={e => {
                                    e.stopPropagation();
                                    setSelectedPool(e.target.value);
                                  }}
                                >
                                  {selectedVersion === "v1"
                                    ? vesuPools.v1Pools
                                        .filter(pool => pool.name !== sourcePoolName)
                                        .map(pool => (
                                          <option key={pool.name} value={pool.name}>
                                            {pool.name}
                                          </option>
                                        ))
                                    : vesuPools.v2Pools
                                        .filter(pool => pool.name !== sourcePoolName)
                                        .map(pool => (
                                          <option key={pool.name} value={pool.name}>
                                            {pool.name}
                                          </option>
                                        ))}
                                </select>
                              ) : (
                                <select
                                  className="select select-bordered select-xs flex-shrink-0 w-auto max-w-[140px] min-w-[100px] text-xs"
                                  value={selectedVersion === "v1" 
                                    ? vesuPools.v1Pools.find(p => p.id === selectedPoolId)?.name || ""
                                    : vesuPools.v2Pools.find(p => p.address === selectedV2PoolAddress)?.name || ""}
                                  onChange={e => {
                                    e.stopPropagation();
                                    if (selectedVersion === "v1") {
                                      const pool = vesuPools.v1Pools.find(p => p.name === e.target.value);
                                      if (pool?.id != null) setSelectedPoolId?.(pool.id);
                                    } else {
                                      const pool = vesuPools.v2Pools.find(p => p.name === e.target.value);
                                      if (pool?.address) setSelectedV2PoolAddress?.(pool.address);
                                    }
                                  }}
                                >
                                  {selectedVersion === "v1"
                                    ? vesuPools.v1Pools
                                        .filter(pool => pool.name !== sourcePoolName)
                                        .map(pool => (
                                          <option key={pool.name} value={pool.name}>
                                            {pool.name}
                                          </option>
                                        ))
                                    : vesuPools.v2Pools
                                        .filter(pool => pool.name !== sourcePoolName)
                                        .map(pool => (
                                          <option key={pool.name} value={pool.name}>
                                            {pool.name}
                                          </option>
                                        ))}
                                </select>
                              )}
                            </div>
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
                  className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2"
                >
                  {flashLoanProviders.map(p => {
                    const displayName = p.name.replace(/\sV[0-9]+$/i, "");
                    return (
                      <button
                        key={`${p.name}-${p.version}`}
                        onClick={() => setSelectedProvider(p.name)}
                        className={`p-2 border rounded text-left ${selectedProvider === p.name ? "border-primary bg-primary/10" : "border-base-300"}`}
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
            <div className="text-sm text-base-content/80">
              {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0
                ? "Collateral to Move"
                : "Select Collaterals to Move"}
            </div>
            {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
              <div className="text-xs text-base-content/60 mb-2 p-2 bg-info/10 rounded">
                <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this collateral cannot be changed.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {isLoadingCollaterals ? (
                <div className="col-span-2 flex items-center justify-center py-6">
                  <span className="loading loading-spinner loading-md" />
                </div>
              ) : (
                (disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0
                  ? collaterals.filter(c =>
                      preSelectedCollaterals.some(pc => addrKey(pc.token) === addrKey(c.address)),
                    )
                  : collaterals
                ).map(c => {
                  const key = addrKey(c.address);
                  const supported = effectiveSupportedMap?.[key] ?? true;
                  const isAdded = Boolean(addedCollaterals[key]);
                  const isExpanded = expandedCollateral === key;

                  return (
                    <div
                      key={c.address}
                        className={`p-2 border rounded ${isExpanded ? "col-span-2" : ""} ${
                        isAdded ? "border-success bg-success/10" : supported ? "border-base-300" : "border-error/50 opacity-60"
                        } ${c.balance <= 0 ? "opacity-50 cursor-not-allowed" : disableCollateralSelection ? "cursor-default" : "cursor-pointer"}`}
                      onClick={() => {
                        if (c.balance <= 0 || disableCollateralSelection) return;
                        onCollateralTileClick(c.address);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 relative">
                          <Image src={c.icon} alt={c.symbol} fill className="rounded-full" />
                        </div>
                        <span className="font-medium flex items-center gap-1">
                          {c.symbol}
                          {isAdded && <span className="text-success">✓</span>}
                        </span>
                          {!supported && <span className="badge badge-error badge-outline badge-xs ml-1">Not supported</span>}
                        <span className="ml-auto text-sm text-base-content/70">
                            {addedCollaterals[key]
                              ? `$${getUsdValue(c.address, addedCollaterals[key]).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                            : `${c.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
                        </span>
                      </div>

                      {isExpanded && !disableCollateralSelection && (
                        <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={tempAmount}
                              onChange={e => {
                                setTempIsMax(false);
                                  setTempAmount(clampAmount(e.target.value, String(c.balance)));
                              }}
                              onKeyDown={e => e.key === "Enter" && onAddCollateral(c.address, c.balance)}
                              placeholder="0.00"
                              className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-20 outline-none"
                              autoFocus
                            />
                            <button
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
                              onClick={() => {
                                setTempIsMax(true);
                                setTempAmount(formatUnits(c.rawBalance, c.decimals));
                              }}
                            >
                              {c.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </button>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm text-success disabled:text-base-content/40"
                            onClick={() => onAddCollateral(c.address, c.balance)}
                            disabled={!tempAmount || parseFloat(tempAmount) <= 0}
                            title="Add collateral"
                          >
                            ✓
                          </button>
                        </div>
                      )}
                      {disableCollateralSelection && !isAdded && (
                        <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={tempAmount || ""}
                              onChange={e => {
                                setTempIsMax(false);
                                  setTempAmount(clampAmount(e.target.value, String(c.balance)));
                              }}
                              placeholder="0.00"
                              className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-20 outline-none text-base-content"
                              autoFocus
                            />
                            <button
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
                                onClick={() => {
                                setTempIsMax(true);
                                  setTempAmount(formatUnits(c.rawBalance, c.decimals));
                              }}
                            >
                              {c.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </button>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm text-success disabled:text-base-content/40"
                            onClick={() => onAddCollateral(c.address, c.balance)}
                            disabled={!tempAmount || parseFloat(tempAmount) <= 0}
                            title="Add collateral"
                          >
                            ✓
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="divider my-2" />

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-base-content/70">Health Factor</div>
              <div className={`font-medium ${hfColor.tone}`}>
                {refiHF >= 999 ? "∞" : refiHF.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/70">Collateral Amount</div>
              <div className="font-medium">
                ${totalCollateralUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/70">LTV</div>
              <div className="font-medium">{ltv}%</div>
            </div>
            <div>
              <div className="text-xs text-base-content/70">Debt Amount</div>
              <div className="font-medium">
                ${debtUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Error display */}
          {errorMessage && (
            <div className="alert alert-error">
              <FiAlertTriangle className="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action */}
          <div className="pt-2 flex items-center justify-between">
            {showBatchingOption && setPreferBatching && (
              <button
                type="button"
                onClick={() => setPreferBatching(prev => !prev)}
                className={`text-xs inline-flex items-center gap-1 cursor-pointer hover:opacity-80 ${
                  preferBatching ? "text-success" : "text-base-content/60"
                }`}
              >
                <FiCheck className={`w-4 h-4 ${preferBatching ? "" : "opacity-40"}`} />
                Batch transactions
              </button>
            )}
            {!showBatchingOption && <div />}

            <button
              className={`btn btn-primary ${isSubmitting ? "loading" : ""} ${
                isActionDisabled ? "btn-disabled" : ""
              }`}
              onClick={handleExecuteMove}
              disabled={isActionDisabled || isSubmitting}
            >
              {isSubmitting ? "Processing..." : "Refinance"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};

