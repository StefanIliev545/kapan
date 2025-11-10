import React, {
    FC,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    memo,
  } from "react";
  import Image from "next/image";
  import { AnimatePresence, motion } from "framer-motion";
  import { useMovePositionData, type NetworkType } from "~~/hooks/useMovePositionData";
  import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
  import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
  import type { Address } from "viem";
  import { FiCheck } from "react-icons/fi";
  import { formatUnits, parseUnits } from "viem";
  import { useTokenPriceApi } from "~~/hooks/useTokenPriceApi";
  
  /* ------------------------------ Helpers ------------------------------ */
  
  type PriceMap = Record<string, bigint>;
  const addrKey = (a?: string) => (a ?? "").toLowerCase();
  
  const price8 = (addr: string, tokenToPrices: PriceMap) =>
    tokenToPrices[addrKey(addr)] ?? 0n;
  
  const toUsdFromP8 = (humanAmount: number, p8: bigint): number => {
    if (!p8 || p8 === 0n || !isFinite(humanAmount) || humanAmount <= 0) return 0;
    // p8 is 8‑decimals fixed price
    return humanAmount * Number(formatUnits(p8, 8));
  };
  
  const toUsdRaw = (amountRaw: bigint, decimals: number, p8: bigint): number => {
    if (!amountRaw || !p8) return 0;
    return Number(formatUnits(amountRaw, decimals)) * Number(formatUnits(p8, 8));
  };
  
  const clampNonNegative = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? v : "";
  };
  
  const getLtBps = (c: any): number => {
    const v = Number(
      c?.liquidationThresholdBps ??
        c?.collateralFactorBps ??
        c?.ltBps ??
        c?.ltvBps ??
        8273
    );
    return Math.max(0, Math.min(10000, v));
  };
  
  /* --------------------------- Price Probe ----------------------------- */
  /** Fetches one price (by symbol) and reports it once when it becomes available. */
  const CollatPriceProbe: FC<{
    symbol?: string;
    address: string;
    enabled: boolean;
    onPrice: (addressLower: string, p8: bigint) => void;
  }> = memo(({ symbol, address, enabled, onPrice }) => {
    const sym = (symbol || "").trim();
    // Treat hook as returning stable primitives (avoid spreading objects)
    const { isSuccess, price } = useTokenPriceApi(sym) as {
      isSuccess?: boolean;
      price?: number;
    };
  
    // Report each concrete price at most once per mount/address
    const lastReported = useRef<bigint | null>(null);
    const lower = addrKey(address);
  
    useEffect(() => {
      if (!enabled || !sym) return;
      const ok = isSuccess && typeof price === "number" && isFinite(price) && price > 0;
      if (!ok) return;
  
      const p8 = BigInt(Math.round(price! * 1e8));
      if (lastReported.current === p8) return;
  
      lastReported.current = p8;
      onPrice(lower, p8);
    }, [enabled, sym, isSuccess, price, lower, onPrice]);
  
    return null;
  });
  CollatPriceProbe.displayName = "CollatPriceProbe";
  
  /* ---------------------------- Component ------------------------------ */
  
  type RefinanceModalProps = {
    isOpen: boolean;
    onClose: () => void;
    fromProtocol: string;
    position: {
      name: string; // debt token symbol
      tokenAddress: string;
      decimals: number;
      balance?: number | bigint;
      poolId?: bigint | string;
      type: "borrow" | "supply";
    };
    chainId?: number;
    networkType: NetworkType;
  };
  
  export const RefinanceModal: FC<RefinanceModalProps> = ({
    isOpen,
    onClose,
    fromProtocol,
    position,
    chainId,
    networkType,
  }) => {
    /* ------------------------- External data hooks ------------------------- */
    const {
      debtSymbol,
      debtIcon,
      debtMaxRaw,
      debtMaxLabel,
      sourceProtocol,
      collaterals,
      isLoadingCollaterals,
      supportedCollateralMap,
      tokenToPrices: seedPrices,
      destinationProtocols,
      flashLoanProviders,
      defaultFlashLoanProvider,
      vesuPools,
    } = useMovePositionData({
      isOpen,
      networkType,
      fromProtocol,
      chainId,
      position,
    });
  
    /* ----------------------- Stable prices (merged) ------------------------ */
    const [mergedPrices, setMergedPrices] = useState<PriceMap>({});
  
    // Merge seed prices exactly once per change; only write if something truly changed.
    useEffect(() => {
      if (!isOpen) return;
      setMergedPrices(prev => {
        let changed = false;
        let next = prev;
        for (const [k, v] of Object.entries(seedPrices || {})) {
          if (!v || v <= 0n) continue;
          const key = addrKey(k);
          if (prev[key] !== v) {
            if (next === prev) next = { ...prev };
            next[key] = v;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, [isOpen, seedPrices]);
  
    const reportPrice = useCallback((lower: string, p8: bigint) => {
      if (!p8 || p8 <= 0n) return;
      setMergedPrices(prev => (prev[lower] === p8 ? prev : { ...prev, [lower]: p8 }));
    }, []);
  
    /* ----------------------------- UI state ------------------------------ */
    const [debtAmount, setDebtAmount] = useState<string>("");
    const [debtConfirmed, setDebtConfirmed] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<"protocol" | "flashloan">("protocol");
  
    // We prefer single‑source-of‑truth: initialize from arrays when they appear, and never
    // overwrite if the selection stays valid.
    const [selectedProtocol, setSelectedProtocol] = useState<string>("");
    const [selectedProvider, setSelectedProvider] = useState<string | undefined>(undefined);
    const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2">("v1");
    const [selectedPool, setSelectedPool] = useState<string>("");
  
    const [expandedCollateral, setExpandedCollateral] = useState<string | null>(null);
    const [tempAmount, setTempAmount] = useState<string>("");
    const [tempIsMax, setTempIsMax] = useState<boolean>(false);
    const [addedCollaterals, setAddedCollaterals] = useState<Record<string, string>>({});
    const [collateralIsMaxMap, setCollateralIsMaxMap] = useState<Record<string, boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [preferBatching, setPreferBatching] = useState<boolean>(false);
    const [autoSelectedDest, setAutoSelectedDest] = useState<boolean>(false);
  
    const debtInputRef = useRef<HTMLInputElement>(null);
  
    /* -------------------------- Stable selections ------------------------- */
    // Seed protocol when options arrive
    useEffect(() => {
      if (!isOpen) return;
      if (!selectedProtocol && destinationProtocols.length > 0) {
        setSelectedProtocol(destinationProtocols[0].name);
      } else if (
        selectedProtocol &&
        destinationProtocols.length > 0 &&
        !destinationProtocols.some(p => p.name === selectedProtocol)
      ) {
        // Current selection disappeared -> pick first
        setSelectedProtocol(destinationProtocols[0].name);
      }
    }, [isOpen, destinationProtocols, selectedProtocol]);
  
    // Seed provider when options arrive
    useEffect(() => {
      if (!isOpen) return;
      if (!selectedProvider && defaultFlashLoanProvider?.name) {
        setSelectedProvider(defaultFlashLoanProvider.name);
      }
    }, [isOpen, selectedProvider, defaultFlashLoanProvider?.name]);
  
    // Seed Vesu pool when Vesu selected
    useEffect(() => {
      if (!isOpen) return;
      const isVesu = selectedProtocol === "Vesu" || selectedProtocol === "VesuV2";
      if (!isVesu || !vesuPools) return;
  
      if (selectedVersion === "v1") {
        const first = vesuPools.v1Pools[0]?.name || "";
        if (first && selectedPool !== first) setSelectedPool(first);
      } else {
        const first = vesuPools.v2Pools[0]?.name || "";
        if (first && selectedPool !== first) setSelectedPool(first);
      }
    }, [isOpen, selectedProtocol, selectedVersion, vesuPools, selectedPool]);
  
    // Auto pick a destination once, based on support + balances
    useEffect(() => {
      if (!isOpen || networkType !== "evm" || autoSelectedDest) return;
      if (!destinationProtocols.length) return;
  
      const supportedMap = supportedCollateralMap; // fallback map from hook for initial decision
      const hasSupportedNonZero = collaterals.some(c => {
        const supported = supportedMap?.[c.address];
        return supported && c.balance > 0;
      });
  
      if (hasSupportedNonZero) {
        setAutoSelectedDest(true);
        return;
      }
      const alt = destinationProtocols.find(p => p.name !== selectedProtocol);
      if (alt && alt.name !== selectedProtocol) setSelectedProtocol(alt.name);
      setAutoSelectedDest(true);
    }, [
      isOpen,
      networkType,
      autoSelectedDest,
      destinationProtocols,
      selectedProtocol,
      collaterals,
      supportedCollateralMap,
    ]);
  
    // Focus once when opening (and not confirmed yet)
    useEffect(() => {
      if (!(isOpen && !debtConfirmed)) return;
      const t = setTimeout(() => debtInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }, [isOpen, debtConfirmed]);
  
    // Reset transient state when closed
    useEffect(() => {
      if (isOpen) return;
      setDebtAmount("");
      setDebtConfirmed(false);
      setActiveTab("protocol");
      setExpandedCollateral(null);
      setTempAmount("");
      setTempIsMax(false);
      setAddedCollaterals({});
      setCollateralIsMaxMap({});
      setAutoSelectedDest(false);
    }, [isOpen]);
  
    /* ---------------------- Support map for selection --------------------- */
    const collateralAddresses = useMemo(() => collaterals.map(c => c.address), [collaterals]);
  
    const { supportedCollaterals: supportFromHook } = useCollateralSupport(
      selectedProtocol || destinationProtocols[0]?.name || "",
      position.tokenAddress,
      collateralAddresses,
      isOpen && networkType === "evm" && collateralAddresses.length > 0 && Boolean(selectedProtocol || destinationProtocols[0]?.name),
    );
  
    const effectiveSupportedMap = networkType === "evm" ? supportFromHook : undefined;
  
    /* --------------------------- Router helpers --------------------------- */
    const { createMoveBuilder, executeFlowBatchedIfPossible, canDoAtomicBatch } = useKapanRouterV2();
  
    // Only write if changed
    useEffect(() => {
      if (!isOpen) return;
      const next = Boolean(canDoAtomicBatch);
      setPreferBatching(prev => (prev === next ? prev : next));
    }, [isOpen, canDoAtomicBatch]);
  
    /* ------------------------ Price‑based calculations -------------------- */
    const debtPrice8 = mergedPrices[addrKey(position.tokenAddress)] ?? 0n;
  
    const debtUsd = useMemo(() => {
      if (!debtConfirmed) return 0;
      const parsed = parseFloat(debtAmount || "0");
      if (Number.isNaN(parsed) || parsed <= 0) return 0;
      return toUsdFromP8(parsed, debtPrice8);
    }, [debtAmount, debtConfirmed, debtPrice8]);
  
    const getUsdValue = useCallback(
      (address: string, humanAmount: string): number => {
        if (networkType !== "evm") return 0;
        const p8 = price8(address, mergedPrices);
        if (!p8 || p8 === 0n) return 0;
        const amt = parseFloat(humanAmount || "0");
        if (Number.isNaN(amt) || amt <= 0) return 0;
        return toUsdFromP8(amt, p8);
      },
      [networkType, mergedPrices]
    );
  
    const totalCollateralUsd = useMemo(() => {
      let acc = 0;
      for (const [addr, amt] of Object.entries(addedCollaterals)) {
        acc += getUsdValue(addr, amt);
      }
      return acc;
    }, [addedCollaterals, getUsdValue]);
  
    const ltv = useMemo(() => {
      if (!totalCollateralUsd) return "0.0";
      return ((debtUsd / totalCollateralUsd) * 100).toFixed(1);
    }, [debtUsd, totalCollateralUsd]);
  
    const HF_SAFE = 2.0;
    const HF_RISK = 1.5;
    const HF_DANGER = 1.1;
  
    const computeHF = useCallback(
      (
        all: any[],
        moved: { address?: string; amount: bigint; decimals: number }[],
        tokenPrices: PriceMap,
        totalDebtUsd: number
      ): number => {
        // Track how much of each collateral is being moved (by address)
        const movedByAddr = new Map<string, bigint>();
        for (const m of moved) {
          const key = addrKey(m.address || "");
          if (!key) continue;
          movedByAddr.set(key, (movedByAddr.get(key) ?? 0n) + (m.amount ?? 0n));
        }
  
        let weightedCollUsd = 0;
  
        for (const c of all) {
          const key = addrKey(c.address || c.token || "");
          if (!key) continue;
  
          const rawBal: bigint = c.rawBalance ?? 0n;
          const decs: number = c.decimals ?? 18;
          const lt = getLtBps(c) / 1e4;
          if (lt <= 0) continue;
  
          const movedAmt = movedByAddr.get(key) ?? 0n;
          const remaining = rawBal - movedAmt;
          if (remaining <= 0n) continue;
  
          const p8 = price8(key, tokenPrices);
          if (p8 === 0n) continue;
  
          const usd = toUsdRaw(remaining, decs, p8);
          weightedCollUsd += usd * lt;
        }
  
        if (!isFinite(totalDebtUsd) || totalDebtUsd <= 0) return 999;
        return weightedCollUsd / totalDebtUsd;
      },
      []
    );
  
    const movedList = useMemo(() => {
      const out: { address: string; amount: bigint; decimals: number }[] = [];
      for (const [addr, amt] of Object.entries(addedCollaterals)) {
        const col = collaterals.find(c => addrKey(c.address) === addrKey(addr));
        if (!col) continue;
        out.push({
          address: addrKey(addr),
          amount: parseUnits(amt || "0", col.decimals),
          decimals: col.decimals,
        });
      }
      return out;
    }, [addedCollaterals, collaterals]);
  
    const currentDebtUsd = debtUsd;
  
    const refiHF = useMemo(() => {
      return computeHF(collaterals, movedList, mergedPrices, currentDebtUsd);
    }, [collaterals, movedList, mergedPrices, currentDebtUsd, computeHF]);
  
    const hfTone = (hf: number) => {
      if (hf >= HF_SAFE) return { tone: "text-success", badge: "badge-success" };
      if (hf >= HF_RISK) return { tone: "text-warning", badge: "badge-warning" };
      if (hf >= HF_DANGER) return { tone: "text-error", badge: "badge-error" };
      return { tone: "text-error", badge: "badge-error" };
    };
    const hfColor = hfTone(refiHF);
  
    /* ------------------------------ Probes ------------------------------- */
    const needDebtProbe =
      isOpen &&
      networkType === "evm" &&
      !!position?.name &&
      !!position?.tokenAddress &&
      !mergedPrices[addrKey(position.tokenAddress)];
  
    const apiProbes = useMemo(() => {
      if (!isOpen || networkType !== "evm") return null;
  
      const probes: React.ReactNode[] = [];
  
      if (needDebtProbe) {
        probes.push(
          <CollatPriceProbe
            key={`probe-debt-${addrKey(position.tokenAddress)}`}
            address={position.tokenAddress}
            symbol={position.name}
            enabled
            onPrice={reportPrice}
          />
        );
      }
  
      for (const c of collaterals) {
        const a = addrKey(c.address);
        if (!a || !c.symbol) continue;
        if (!mergedPrices[a]) {
          probes.push(
            <CollatPriceProbe
              key={`probe-${a}`}
              address={a}
              symbol={c.symbol}
              enabled
              onPrice={reportPrice}
            />
          );
        }
      }
  
      return <>{probes}</>;
    }, [isOpen, networkType, needDebtProbe, position.tokenAddress, position.name, collaterals, mergedPrices, reportPrice]);
  
    /* ------------------------------ Actions ------------------------------ */
    const onCollateralTileClick = useCallback((address: string) => {
      setExpandedCollateral(prev => (prev === address ? null : address));
      setTempAmount("");
      setTempIsMax(false);
    }, []);
  
    const onAddCollateral = useCallback((address: string, balance: number) => {
      const num = parseFloat(tempAmount || "0");
      if (!Number.isFinite(num) || num <= 0) return;
  
      setAddedCollaterals(prev => {
        const v = String(num);
        return prev[address] === v ? prev : { ...prev, [address]: v };
      });
      setCollateralIsMaxMap(prev => (prev[address] === tempIsMax ? prev : { ...prev, [address]: tempIsMax }));
      setExpandedCollateral(null);
      setTempAmount("");
      setTempIsMax(false);
    }, [tempAmount, tempIsMax]);
  
    const isActionDisabled = !debtConfirmed || !selectedProtocol || Object.keys(addedCollaterals).length === 0;
  
    /* -------------------------------- UI -------------------------------- */
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
                      onChange={e => setDebtAmount(clampNonNegative(e.target.value))}
                      onKeyDown={e => e.key === "Enter" && setDebtConfirmed(Boolean(debtAmount && parseFloat(debtAmount) > 0))}
                      placeholder="0.00"
                      className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-20 outline-none"
                    />
                    {debtMaxLabel && (
                      <button
                        onClick={() => setDebtAmount((debtMaxRaw || debtMaxLabel).replace(/,/g, ""))}
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
                <button
                  className={`pb-2 -mb-[1px] border-b-2 ${activeTab === "flashloan" ? "border-primary" : "border-transparent text-base-content/60"}`}
                  onClick={() => setActiveTab("flashloan")}
                >
                  Flash Loan Provider
                </button>
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
                    {destinationProtocols.map(p => {
                      const isSelected = selectedProtocol === p.name;
                      const isVesu = p.name === "Vesu" || p.name === "VesuV2";
  
                      return (
                        <div
                          key={p.name}
                          className={`col-span-1 p-2 border ${isSelected ? "border-primary bg-primary/10" : "border-base-300"} rounded cursor-pointer`}
                          onClick={() => setSelectedProtocol(p.name)}
                        >
                          <div className="flex items-center gap-2">
                            <Image src={p.logo} alt={p.name} width={24} height={24} className="rounded" />
                            <span className="text-sm">{p.name}</span>
                          </div>
  
                          {(isSelected && isVesu && vesuPools) && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {/* Version toggle */}
                              <div className="join join-xs">
                                <button
                                  className={`btn btn-ghost btn-xs join-item ${selectedVersion === "v1" ? "btn-active" : ""}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (selectedVersion !== "v1") setSelectedVersion("v1");
                                  }}
                                >
                                  V1
                                </button>
                                <button
                                  className={`btn btn-ghost btn-xs join-item ${selectedVersion === "v2" ? "btn-active" : ""}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (selectedVersion !== "v2") setSelectedVersion("v2");
                                  }}
                                >
                                  V2
                                </button>
                              </div>
  
                              {/* Pool select */}
                              <select
                                className="select select-bordered select-xs"
                                value={selectedPool}
                                onChange={e => {
                                  e.stopPropagation();
                                  setSelectedPool(e.target.value);
                                }}
                              >
                                {selectedVersion === "v1"
                                  ? vesuPools.v1Pools.map(pool => (
                                      <option key={pool.name} value={pool.name}>
                                        {pool.name}
                                      </option>
                                    ))
                                  : vesuPools.v2Pools.map(pool => (
                                      <option key={pool.name} value={pool.name}>
                                        {pool.name}
                                      </option>
                                    ))}
                              </select>
                            </div>
                          )}
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
              <div className="text-sm text-base-content/80">Select Collaterals to Move</div>
              <div className="grid grid-cols-2 gap-2">
                {isLoadingCollaterals ? (
                  <div className="col-span-2 flex items-center justify-center py-6">
                    <span className="loading loading-spinner loading-md" />
                  </div>
                ) : (
                  collaterals.map(c => {
                    const supported =
                      (effectiveSupportedMap ?? supportedCollateralMap)?.[c.address] ?? true;
                    const isAdded = Boolean(addedCollaterals[c.address]);
                    const isExpanded = expandedCollateral === c.address;
  
                    return (
                      <div
                        key={c.address}
                        className={`p-2 border rounded ${isExpanded ? "col-span-2" : ""} ${
                          isAdded ? "border-success bg-success/10" : supported ? "border-base-300" : "border-error/50 opacity-60"
                        } ${c.balance <= 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        onClick={() => {
                          if (c.balance <= 0) return;
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
                            {addedCollaterals[c.address]
                              ? `$${getUsdValue(c.address, addedCollaterals[c.address]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${c.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
                          </span>
                        </div>
  
                        {isExpanded && (
                          <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                value={tempAmount}
                                onChange={e => {
                                  setTempIsMax(false);
                                  setTempAmount(clampNonNegative(e.target.value));
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
                                  setTempAmount(String(c.balance));
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
  
            {/* Action */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreferBatching(p => !p)}
                className={`text-xs inline-flex items-center gap-1 cursor-pointer hover:opacity-80 ${
                  preferBatching ? "text-success" : "text-base-content/60"
                }`}
              >
                <FiCheck className={`w-4 h-4 ${preferBatching ? "" : "opacity-40"}`} />
                Batch transactions
              </button>
  
              <button
                className={`link link-primary disabled:text-base-content/40 disabled:no-underline ${isSubmitting ? "pointer-events-none opacity-60" : ""}`}
                onClick={async () => {
                  if (networkType !== "evm") return;
                  if (!debtConfirmed || !selectedProtocol) return;
                  try {
                    setIsSubmitting(true);
                    const builder = createMoveBuilder();
                    const pv = (selectedProvider || "").toLowerCase();
                    const providerVersion =
                      pv.includes("aave") ? "aave" : pv.includes("v3") ? "v3" : "v2";
  
                    builder.buildUnlockDebt({
                      fromProtocol,
                      debtToken: position.tokenAddress as Address,
                      expectedDebt: debtAmount,
                      debtDecimals: position.decimals,
                      flash: { version: providerVersion as any },
                    });
  
                    Object.entries(addedCollaterals).forEach(([addr, amt]) => {
                      const meta = collaterals.find(c => addrKey(c.address) === addrKey(addr));
                      if (!meta) return;
                      const isMax = collateralIsMaxMap[addr] === true;
                      builder.buildMoveCollateral({
                        fromProtocol,
                        toProtocol: selectedProtocol,
                        collateralToken: addr as Address,
                        withdraw: isMax ? { max: true } : { amount: amt },
                        collateralDecimals: meta.decimals,
                      });
                    });
  
                    builder.buildBorrow({
                      mode: "coverFlash",
                      toProtocol: selectedProtocol,
                      token: position.tokenAddress as Address,
                      decimals: position.decimals,
                    });
  
                    const flow = builder.build();
                    const res = await executeFlowBatchedIfPossible(flow, preferBatching);
                    if (!res) {
                      await executeFlowBatchedIfPossible(flow, false);
                    }
                  } catch (e) {
                    console.error("Refinance flow error:", e);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isActionDisabled || isSubmitting}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="loading loading-spinner loading-xs" />
                    Refinance
                  </span>
                ) : (
                  "Refinance"
                )}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    );
  };
  