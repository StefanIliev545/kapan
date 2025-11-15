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
      <div
        className="modal-box max-w-2xl max-h-[90vh] p-6 flex flex-col
        rounded-2xl border border-sky-500/30 bg-[#050816] text-slate-100
        shadow-[0_18px_60px_rgba(8,47,73,0.7)]"
      >
        {/* Header — structure kept the same, just styled */}
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
              Refinance position
            </div>
            <h3 className="text-base font-semibold tracking-tight text-slate-50">
              Refinance Position
            </h3>
          </div>
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/70
            bg-slate-900/80 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-100"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body — same sections, re-skinned */}
        <div className="space-y-4 overflow-y-auto text-sm">
          {/* Invisible price probes (debt + collaterals) */}
          {apiProbes}

          {/* Debt amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                1 · Amount to refinance
              </span>
              {debtAmount && parseFloat(debtAmount) > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11px] text-slate-500 leading-none">
                    Source protocol
                  </span>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Image
                      src={sourceProtocol.logo}
                      alt={sourceProtocol.name}
                      width={18}
                      height={18}
                      className="rounded-full"
                    />
                    <span>{sourceProtocol.name}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="relative h-7 w-7 rounded-full bg-slate-900/80">
                  <Image
                    src={debtIcon}
                    alt={debtSymbol}
                    fill
                    className="rounded-full object-contain"
                  />
                </div>

                <span className="text-sm font-medium text-slate-100">{debtSymbol}</span>

                <div className="relative flex-1">
                  <input
                    ref={debtInputRef}
                    type="number"
                    value={debtAmount}
                    onChange={e => {
                      const sanitized = clampAmount(e.target.value, debtMaxRaw);
                      setIsDebtMaxClicked(false);
                      setDebtAmount(sanitized);

                      const parsed = parseFloat(sanitized);
                      setDebtConfirmed(
                        Boolean(sanitized && Number.isFinite(parsed) && parsed > 0)
                      );
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 pr-20 text-sm text-slate-100
                              outline-none placeholder:text-slate-500 focus:border-sky-500/70"
                  />

                  {debtMaxLabel && (
                    <button
                      onClick={() => {
                        const maxValue = (debtMaxRaw || debtMaxLabel).replace(/,/g, "");
                        setIsDebtMaxClicked(true);
                        setDebtAmount(maxValue);

                        const parsed = parseFloat(maxValue);
                        setDebtConfirmed(
                          Boolean(maxValue && Number.isFinite(parsed) && parsed > 0)
                        );
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-sky-500/10 
                                px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20"
                    >
                      {debtMaxLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>


          {/* Tabs (Route type) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                2 · Route type
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="flex items-center gap-4 border-b border-slate-800 text-xs">
                <button
                  className={`pb-2 -mb-[1px] border-b-2 ${
                    activeTab === "protocol"
                      ? "border-sky-400 text-sky-300"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => setActiveTab("protocol")}
                >
                  Destination protocol
                </button>
                {showFlashLoanTab && (
                  <button
                    className={`pb-2 -mb-[1px] border-b-2 ${
                      activeTab === "flashloan"
                        ? "border-sky-400 text-sky-300"
                        : "border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                    onClick={() => setActiveTab("flashloan")}
                  >
                    Flash loan provider
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
                    className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4"
                  >
                    {filteredDestinationProtocols.map(p => {
                      const isSelected = selectedProtocol === p.name;
                      const isVesu = p.name === "Vesu";
                      const shouldExpand = isSelected && isVesu && vesuPools;

                      return (
                        <div
                          key={p.name}
                          className={`${shouldExpand ? "col-span-2 sm:col-span-4" : ""} rounded-lg border px-3 py-2 text-xs transition
                          ${
                            isSelected
                              ? "border-sky-500/70 bg-sky-500/10"
                              : "border-slate-800 bg-slate-950/80 hover:border-slate-600"
                          } cursor-pointer`}
                          onClick={() => setSelectedProtocol(p.name)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Image
                              src={p.logo}
                              alt={p.name}
                              width={24}
                              height={24}
                              className="flex-shrink-0 rounded"
                            />
                            <span className="flex-shrink-0 whitespace-nowrap text-xs font-medium">
                              {p.name}
                            </span>

                            {isSelected && isVesu && vesuPools && (
                              <div className="ml-auto flex flex-shrink-0 flex-nowrap items-center gap-1">
                                {/* Version toggle */}
                                <div className="inline-flex rounded-full bg-slate-900/80 p-0.5 text-[10px]">
                                  <button
                                    className={`rounded-full px-2 py-0.5 uppercase tracking-[0.12em] ${
                                      selectedVersion === "v1"
                                        ? "bg-sky-500/20 text-sky-200"
                                        : "text-slate-400"
                                    }`}
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
                                    className={`rounded-full px-2 py-0.5 uppercase tracking-[0.12em] ${
                                      selectedVersion === "v2"
                                        ? "bg-sky-500/20 text-sky-200"
                                        : "text-slate-400"
                                    }`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (selectedVersion !== "v2") {
                                        setSelectedVersion("v2");
                                        if (
                                          selectedV2PoolAddress !== undefined &&
                                          vesuPools.v2Pools[0]?.address
                                        ) {
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
                                    className="select select-bordered select-xs w-auto min-w-[120px] max-w-[160px]
                                    border-slate-700 bg-slate-950/90 text-[11px] text-slate-100"
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
                                    className="select select-bordered select-xs w-auto min-w-[120px] max-w-[160px]
                                    border-slate-700 bg-slate-950/90 text-[11px] text-slate-100"
                                    value={
                                      selectedVersion === "v1"
                                        ? vesuPools.v1Pools.find(p => p.id === selectedPoolId)?.name ||
                                          ""
                                        : vesuPools.v2Pools.find(
                                            p => p.address === selectedV2PoolAddress,
                                          )?.name || ""
                                    }
                                    onChange={e => {
                                      e.stopPropagation();
                                      if (selectedVersion === "v1") {
                                        const pool = vesuPools.v1Pools.find(
                                          p => p.name === e.target.value,
                                        );
                                        if (pool?.id != null) setSelectedPoolId?.(pool.id);
                                      } else {
                                        const pool = vesuPools.v2Pools.find(
                                          p => p.name === e.target.value,
                                        );
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
                    className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5"
                  >
                    {flashLoanProviders.map(p => {
                      const displayName = p.name.replace(/\sV[0-9]+$/i, "");
                      const isSelected = selectedProvider === p.name;

                      return (
                        <button
                          key={`${p.name}-${p.version}`}
                          onClick={() => setSelectedProvider(p.name)}
                          className={`rounded-lg border px-3 py-2 text-left text-xs transition
                          ${
                            isSelected
                              ? "border-sky-500/70 bg-sky-500/10"
                              : "border-slate-800 bg-slate-950/80 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Image
                              src={p.icon}
                              alt={p.name}
                              width={20}
                              height={20}
                              className="rounded"
                            />
                            <span className="text-xs font-medium text-slate-100">
                              {displayName}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Collaterals */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                3 · Collateral to move
              </span>
            </div>

            {disableCollateralSelection &&
              preSelectedCollaterals &&
              preSelectedCollaterals.length > 0 && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100">
                  <strong className="font-semibold">Note:</strong>{" "}
                  Vesu uses isolated collateral–debt pairs. You can change the amount, but not the asset.
                </div>
              )}

            <div className="grid grid-cols-2 gap-2">
              {isLoadingCollaterals ? (
                <div className="col-span-2 flex items-center justify-center py-6 text-xs text-slate-400">
                  <span className="loading loading-spinner loading-xs mr-2" />
                  Loading collateral positions…
                </div>
              ) : (
                (disableCollateralSelection &&
                preSelectedCollaterals &&
                preSelectedCollaterals.length > 0
                  ? collaterals.filter(c =>
                      preSelectedCollaterals.some(
                        pc => addrKey(pc.token) === addrKey(c.address),
                      ),
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
                      className={`rounded-lg border px-3 py-2.5 text-xs transition
                      ${isExpanded ? "col-span-2" : ""}
                      ${
                        isAdded
                          ? "border-emerald-500/80 bg-emerald-500/10"
                          : supported
                            ? "border-slate-800 bg-slate-950/80"
                            : "border-red-500/60 bg-red-950/40 opacity-70"
                      }
                      ${
                        c.balance <= 0
                          ? "cursor-not-allowed opacity-50"
                          : disableCollateralSelection
                            ? "cursor-default"
                            : "cursor-pointer hover:border-slate-600"
                      }`}
                      onClick={() => {
                        if (c.balance <= 0 || disableCollateralSelection) return;
                        onCollateralTileClick(c.address);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative h-6 w-6 rounded-full bg-slate-900/80">
                          <Image
                            src={c.icon}
                            alt={c.symbol}
                            fill
                            className="rounded-full object-contain"
                          />
                        </div>
                        <span className="flex items-center gap-1 text-xs font-medium text-slate-100">
                          {c.symbol}
                          {isAdded && (
                            <span className="text-emerald-400">
                              <FiCheck className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                        {!supported && (
                          <span className="ml-1 rounded-full border border-red-500/60 px-1.5 py-0.5 text-[10px] text-red-100">
                            Not supported
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-slate-300">
                          {addedCollaterals[key]
                            ? `$${getUsdValue(
                                c.address,
                                addedCollaterals[key],
                              ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : c.balance.toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}
                        </span>
                      </div>

                      {/* Editable row when expanded / forced selection */}
                      {isExpanded && !disableCollateralSelection && (
                        <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={tempAmount}
                              onChange={e => {
                                const val = clampAmount(e.target.value, String(c.balance));
                                setTempIsMax(false);
                                setTempAmount(val);
                              }}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  const parsed = parseFloat((e.currentTarget.value || "").trim());
                                  if (Number.isFinite(parsed) && parsed > 0) {
                                    onAddCollateral(c.address, c.balance);
                                  }
                                }
                              }}
                              onBlur={e => {
                                const parsed = parseFloat((e.currentTarget.value || "").trim());
                                if (Number.isFinite(parsed) && parsed > 0) {
                                  onAddCollateral(c.address, c.balance);
                                }
                              }}
                              placeholder="0.00"
                              className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-20 outline-none"
                              autoFocus
                            />
                            <button
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
                              onClick={() => {
                                setTempIsMax(true);
                                const maxVal = formatUnits(c.rawBalance, c.decimals);
                                setTempAmount(maxVal);
                                const parsed = parseFloat(maxVal);
                                if (Number.isFinite(parsed) && parsed > 0) {
                                  onAddCollateral(c.address, c.balance);
                                }
                              }}
                            >
                              {c.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </button>
                          </div>
                        </div>
                      )}

                      {disableCollateralSelection && !isAdded && (
                        <div
                          className="mt-3 flex items-center gap-2"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={tempAmount || ""}
                              onChange={e => {
                                setTempIsMax(false);
                                setTempAmount(
                                  clampAmount(e.target.value, String(c.balance)),
                                );
                              }}
                              placeholder="0.00"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950/90
                              px-3 py-1.5 pr-20 text-xs text-slate-100 outline-none placeholder:text-slate-500
                              focus:border-sky-500/70"
                              autoFocus
                            />
                            <button
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80
                              px-2.5 py-1 text-[10px] text-sky-300 hover:bg-sky-500/20"
                              onClick={() => {
                                setTempIsMax(true);
                                setTempAmount(formatUnits(c.rawBalance, c.decimals));
                              }}
                            >
                              {c.balance.toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}
                            </button>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm h-8 min-h-0 border border-emerald-500/70
                            bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300
                            hover:bg-emerald-500/20 disabled:text-slate-500"
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

          {/* Stats — styled like small Aave cards */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              4 · Resulting position snapshot
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-950/90 p-3 ring-1 ring-white/5">
                <div className="text-[11px] text-slate-400">Health factor</div>
                <div className={`mt-1 text-sm font-semibold ${hfColor.tone}`}>
                  {refiHF >= 999 ? "∞" : refiHF.toFixed(2)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Estimated after this refinance.
                </div>
              </div>
              <div className="rounded-xl bg-slate-950/90 p-3 ring-1 ring-white/5">
                <div className="text-[11px] text-slate-400">Collateral</div>
                <div className="mt-1 text-sm font-semibold text-slate-50">
                  $
                  {totalCollateralUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">Total after move.</div>
              </div>
              <div className="rounded-xl bg-slate-950/90 p-3 ring-1 ring-white/5">
                <div className="text-[11px] text-slate-400">LTV</div>
                <div className="mt-1 text-sm font-semibold text-slate-50">{ltv}%</div>
                <div className="mt-0.5 h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{
                      width: `${Math.min(100, Math.max(0, parseFloat(ltv || "0")))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="rounded-xl bg-slate-950/90 p-3 ring-1 ring-white/5">
                <div className="text-[11px] text-slate-400">Debt</div>
                <div className="mt-1 text-sm font-semibold text-slate-50">
                  $
                  {debtUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Borrow side after refinance.
                </div>
              </div>
            </div>
          </div>

          {/* Error display */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/60 bg-red-950/40 px-3 py-2.5 text-xs text-red-100">
              <FiAlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer — same structure, new styling */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
          {showBatchingOption && setPreferBatching ? (
            <button
              type="button"
              onClick={() => setPreferBatching(prev => !prev)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                preferBatching ? "text-emerald-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-[6px] border text-[10px] ${
                  preferBatching
                    ? "border-emerald-500 bg-emerald-500/20"
                    : "border-slate-600 bg-slate-900"
                }`}
              >
                <FiCheck className={`h-3 w-3 ${preferBatching ? "" : "opacity-40"}`} />
              </span>
              Batch transactions
            </button>
          ) : (
            <div />
          )}

          <button
            className={`btn h-9 min-h-0 rounded-full border-none px-5 text-xs font-semibold
            bg-sky-500 text-slate-950 hover:bg-sky-400
            ${isSubmitting ? "loading" : ""} ${isActionDisabled ? "btn-disabled opacity-70" : ""}`}
            onClick={handleExecuteMove}
            disabled={isActionDisabled || isSubmitting}
          >
            {isSubmitting ? "Processing..." : "Refinance"}
          </button>
        </div>
      </div>
    </dialog>
  );
};
