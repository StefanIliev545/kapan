import { track } from "@vercel/analytics";
import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { formatUnits, parseUnits, type Address } from "viem";
import { useTokenPriceApi } from "~~/hooks/useTokenPriceApi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useMovePositionState } from "~~/hooks/useMovePositionState";
import { RefinanceModalContent } from "./RefinanceModalContent";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMorphoMarketSupport } from "~~/hooks/useMorphoMarketSupport";
import { encodeMorphoContext, type MorphoMarketContextForEncoding } from "~~/utils/v2/instructionHelpers";

/* ------------------------------ Helpers ------------------------------ */
type PriceMap = Record<string, bigint>;
const addrKey = (a?: string) => (a ?? "").toLowerCase();

const price8 = (addr: string, tokenToPrices: PriceMap) =>
  tokenToPrices[addrKey(addr)] ?? 0n;

const toUsdFromP8 = (humanAmount: number, p8: bigint): number => {
  if (!p8 || p8 === 0n || !isFinite(humanAmount) || humanAmount <= 0) return 0;
  return humanAmount * Number(formatUnits(p8, 8));
};

const toUsdRaw = (amountRaw: bigint, decimals: number, p8: bigint): number => {
  if (!amountRaw || !p8) return 0;
  return Number(formatUnits(amountRaw, decimals)) * Number(formatUnits(p8, 8));
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
const CollatPriceProbe: FC<{
  symbol?: string;
  address: string;
  enabled: boolean;
  onPrice: (addressLower: string, p8: bigint) => void;
}> = memo(({ symbol, address, enabled, onPrice }) => {
  const sym = (symbol || "").trim();
  const { isSuccess, price } = useTokenPriceApi(sym) as {
    isSuccess?: boolean;
    price?: number;
  };

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
type RefinanceModalEvmProps = {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
  position: {
    name: string;
    tokenAddress: string;
    decimals: number;
    balance?: number | bigint;
    poolId?: bigint | string;
    type: "borrow" | "supply";
  };
  chainId?: number;
  preSelectedCollaterals?: Array<{
    token: string;
    symbol: string;
    decimals: number;
    amount?: bigint;
    maxAmount?: bigint;
    inputValue?: string;
  }>;
  disableCollateralSelection?: boolean;
  /** Pre-encoded context for the source protocol (e.g., Morpho MarketParams) */
  fromContext?: string;
};

export const RefinanceModalEvm: FC<RefinanceModalEvmProps> = ({
  isOpen,
  onClose,
  fromProtocol,
  position,
  fromContext,
  chainId,
  preSelectedCollaterals,
  disableCollateralSelection,
}) => {
  /* ------------------------- External data hooks ------------------------- */
  const {
    debtSymbol,
    debtIcon,
    debtMaxRaw,
    debtMaxLabel,
    sourceProtocol,
    collaterals: collateralsFromHook,
    isLoadingCollaterals,
    tokenToPrices: seedPrices,
    destinationProtocols,
    flashLoanProviders,
    defaultFlashLoanProvider,
    vesuPools: evmVesuPools,
  } = useMovePositionData({
    isOpen,
    networkType: "evm",
    fromProtocol,
    chainId,
    position,
  });

  const filteredDestinationProtocols = destinationProtocols;

  // Merge preselected collaterals with collaterals from hook
  const collaterals = useMemo(() => {
    // If collateral selection is disabled and we have preselected collaterals,
    // ONLY use the preselected collaterals (don't merge with hook data)
    // This is important for protocols like Morpho where the collateral is fixed per market
    if (disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0) {
      return preSelectedCollaterals.map(pc => {
        const rawBalance = pc.maxAmount || pc.amount || 0n;
        return {
          address: pc.token,
          symbol: pc.symbol,
          icon: tokenNameToLogo(pc.symbol.toLowerCase()),
          decimals: pc.decimals,
          rawBalance: rawBalance,
          balance: rawBalance ? Number(formatUnits(rawBalance, pc.decimals)) : 0,
        };
      });
    }

    if (!preSelectedCollaterals || preSelectedCollaterals.length === 0) {
      return collateralsFromHook;
    }

    const existingMap = new Map(collateralsFromHook.map(c => [addrKey(c.address), c]));
    const merged = [...collateralsFromHook];

    preSelectedCollaterals.forEach(pc => {
      const key = addrKey(pc.token);
      if (!existingMap.has(key)) {
        const rawBalance = pc.maxAmount || pc.amount || 0n;
        merged.push({
          address: pc.token,
          symbol: pc.symbol,
          icon: tokenNameToLogo(pc.symbol.toLowerCase()),
          decimals: pc.decimals,
          rawBalance: rawBalance,
          balance: rawBalance ? Number(formatUnits(rawBalance, pc.decimals)) : 0,
        });
      } else {
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

    return merged;
  }, [collateralsFromHook, preSelectedCollaterals, disableCollateralSelection]);

  /* ----------------------- Stable prices (merged) ------------------------ */
  const [mergedPrices, setMergedPrices] = useState<PriceMap>({});

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

  /* --------------------------- State management --------------------------- */
  const state = useMovePositionState(isOpen);

  const {
    debtAmount,
    setDebtAmount,
    setIsDebtMaxClicked,
    debtConfirmed,
    setDebtConfirmed,
    activeTab,
    setActiveTab,
    selectedProtocol,
    setSelectedProtocol,
    selectedProvider: _stateSelectedProvider,
    setSelectedProvider: _stateSetSelectedProvider,
    selectedVersion,
    setSelectedVersion,
    expandedCollateral,
    setExpandedCollateral,
    tempAmount,
    setTempAmount,
    tempIsMax,
    setTempIsMax,
    addedCollaterals,
    collateralIsMaxMap,
    isSubmitting,
    setIsSubmitting,
    preferBatching,
    setPreferBatching,
    autoSelectedDest,
    setAutoSelectedDest,
    resetState,
    onCollateralTileClick,
    onAddCollateral,
    // Morpho-specific state
    selectedMorphoMarket,
    morphoContext,
    onMorphoMarketSelect,
  } = state;

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const modalOpenProps: Record<string, string | number | boolean> = {
        network: "evm",
        fromProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
      };

      if (chainId !== undefined) {
        modalOpenProps.chainId = chainId;
      }

      track("refinance_modal_open", modalOpenProps);
    }
    wasOpenRef.current = isOpen;
  }, [chainId, fromProtocol, isOpen, position.name, position.tokenAddress, position.type]);

  const [selectedPool, setSelectedPool] = useState<string>("");

  // Flash Loan Selection Hook
  const debtAmountBigInt = useMemo(() => {
    try {
      return debtAmount ? parseUnits(debtAmount, position.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [debtAmount, position.decimals]);

  const { selectedProvider: hookSelectedProvider, setSelectedProvider: setHookSelectedProvider } = useFlashLoanSelection({
    flashLoanProviders,
    defaultProvider: defaultFlashLoanProvider,
    tokenAddress: position.tokenAddress,
    amount: debtAmountBigInt,
    chainId: chainId || 1,
  });

  const selectedProvider = hookSelectedProvider?.name;
  const setSelectedProvider = (name: string) => {
    const p = flashLoanProviders.find(p => p.name === name);
    if (p) {
      setHookSelectedProvider(p);
    }
  };

  /* ---------------------- Support map for selection --------------------- */
  const collateralAddresses = useMemo(() => collaterals.map(c => c.address), [collaterals]);

  const { supportedCollaterals: effectiveSupportedMap, isLoading: isSupportLoading } = useCollateralSupport(
    selectedProtocol || filteredDestinationProtocols[0]?.name || "",
    position.tokenAddress,
    collateralAddresses.map(a => a.toLowerCase()),
    isOpen && collateralAddresses.length > 0 && Boolean(selectedProtocol || filteredDestinationProtocols[0]?.name),
    chainId,
  );

  /* ---------------------- Morpho market support ---------------------- */
  const isMorphoSelected = selectedProtocol === "Morpho Blue";
  
  const {
    supportedCollaterals: morphoSupportedCollaterals,
    marketsByCollateral: morphoMarketsByCollateral,
    isLoading: isLoadingMorphoMarkets,
  } = useMorphoMarketSupport({
    chainId: chainId || 8453, // Default to Base
    loanTokenAddress: position.tokenAddress,
    collateralAddresses: collateralAddresses.map(a => a.toLowerCase()),
    enabled: isOpen && isMorphoSelected && collateralAddresses.length > 0,
  });

  // Get markets for the currently selected collateral (for Morpho)
  const morphoMarketsForSelectedCollateral = useMemo(() => {
    if (!isMorphoSelected) return [];
    const selectedCollateralAddr = Object.keys(addedCollaterals)[0]?.toLowerCase();
    if (!selectedCollateralAddr) return [];
    return morphoMarketsByCollateral[selectedCollateralAddr] || [];
  }, [isMorphoSelected, addedCollaterals, morphoMarketsByCollateral]);

  // Auto pick a destination once, based on support + balances
  useEffect(() => {
    if (!isOpen || autoSelectedDest) return;
    if (!destinationProtocols.length) return;

    const supportedMap = effectiveSupportedMap;
    const hasSupportedNonZero = collaterals.some(c => {
      const supported = supportedMap?.[addrKey(c.address)];
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
    autoSelectedDest,
    destinationProtocols,
    selectedProtocol,
    collaterals,
    effectiveSupportedMap,
    setSelectedProtocol,
    setAutoSelectedDest,
  ]);

  /* --------------------------- EVM Router helpers --------------------------- */
  const { createMoveBuilder, executeFlowBatchedIfPossible, canDoAtomicBatch } = useKapanRouterV2();

  useEffect(() => {
    if (!isOpen) return;
    const next = Boolean(canDoAtomicBatch);
    setPreferBatching(prev => (prev === next ? prev : next));
  }, [isOpen, canDoAtomicBatch, setPreferBatching]);

  const [revokePermissions, setRevokePermissions] = useState(false);

  // Auto-enable revoke permissions when batching is enabled
  useEffect(() => {
    if (preferBatching) {
      setRevokePermissions(true);
    }
  }, [preferBatching]);

  const debtInputRef = useRef<HTMLInputElement>(null);

  // Initialize preselected collaterals
  useEffect(() => {
    if (isOpen && preSelectedCollaterals && preSelectedCollaterals.length > 0 && collaterals.length > 0) {
      const firstPreselected = preSelectedCollaterals[0];
      const firstPreselectedKey = addrKey(firstPreselected.token);
      const meta = collaterals.find(col => addrKey(col.address) === firstPreselectedKey);

      if (meta && !expandedCollateral) {
        setExpandedCollateral(firstPreselectedKey);

        if (firstPreselected.amount) {
          const amount = formatUnits(firstPreselected.amount, firstPreselected.decimals);
          setTempAmount(amount);
        } else if (firstPreselected.inputValue) {
          setTempAmount(firstPreselected.inputValue);
        } else {
          setTempAmount(String(meta.balance));
        }
      }
    }
  }, [isOpen, preSelectedCollaterals, collaterals, expandedCollateral, setExpandedCollateral, setTempAmount]);

  /* -------------------------- Stable selections ------------------------- */
  useEffect(() => {
    if (!isOpen) return;
    if (!selectedProtocol && filteredDestinationProtocols.length > 0) {
      setSelectedProtocol(filteredDestinationProtocols[0].name);
    } else if (
      selectedProtocol &&
      filteredDestinationProtocols.length > 0 &&
      !filteredDestinationProtocols.some(p => p.name === selectedProtocol)
    ) {
      setSelectedProtocol(filteredDestinationProtocols[0].name);
    }
  }, [isOpen, filteredDestinationProtocols, selectedProtocol, setSelectedProtocol]);



  useEffect(() => {
    if (!isOpen) return;
    const isVesu = selectedProtocol === "Vesu" || selectedProtocol === "VesuV2";
    if (!isVesu || !evmVesuPools) return;

    if (selectedVersion === "v1") {
      const first = evmVesuPools.v1Pools[0]?.name || "";
      if (first && selectedPool !== first) setSelectedPool(first);
    } else {
      const first = evmVesuPools.v2Pools[0]?.name || "";
      if (first && selectedPool !== first) setSelectedPool(first);
    }
  }, [isOpen, selectedProtocol, selectedVersion, evmVesuPools, selectedPool]);

  useEffect(() => {
    if (!(isOpen && !debtConfirmed)) return;
    const t = setTimeout(() => debtInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isOpen, debtConfirmed]);

  useEffect(() => {
    resetState();
  }, [isOpen, resetState]);

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
      const p8 = price8(address, mergedPrices);
      if (!p8 || p8 === 0n) return 0;
      const amt = parseFloat(humanAmount || "0");
      if (Number.isNaN(amt) || amt <= 0) return 0;
      return toUsdFromP8(amt, p8);
    },
    [mergedPrices]
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

  const refiHF = useMemo(() => {
    return computeHF(collaterals, movedList, mergedPrices, debtUsd);
  }, [collaterals, movedList, mergedPrices, debtUsd, computeHF]);

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
    !!position?.name &&
    !!position?.tokenAddress &&
    !mergedPrices[addrKey(position.tokenAddress)];

  const apiProbes = useMemo(() => {
    if (!isOpen) return null;

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
  }, [isOpen, needDebtProbe, position.tokenAddress, position.name, collaterals, mergedPrices, reportPrice]);

  /* --------------------------- Action Handlers --------------------------- */
  const isActionDisabled = useMemo(() => {
    if (!debtConfirmed || !selectedProtocol) return true;
    if (Object.keys(addedCollaterals).length === 0) return true;
    
    // For Morpho, must have a market selected
    if (isMorphoSelected && !selectedMorphoMarket) return true;
    
    // Check collateral support based on protocol
    const supportMap = isMorphoSelected ? morphoSupportedCollaterals : effectiveSupportedMap;
    if (Object.keys(addedCollaterals).some(addr => supportMap?.[addrKey(addr)] === false)) return true;
    
    return false;
  }, [debtConfirmed, selectedProtocol, addedCollaterals, isMorphoSelected, selectedMorphoMarket, morphoSupportedCollaterals, effectiveSupportedMap]);

  const handleExecuteMove = async () => {
    if (!debtConfirmed || !selectedProtocol) return;

    let batchingUsed = false;

    try {
      setIsSubmitting(true);

      const txBeginProps: Record<string, string | number | boolean> = {
        network: "evm",
        fromProtocol,
        toProtocol: selectedProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
        preferBatching: Boolean(preferBatching),
      };

      if (chainId !== undefined) {
        txBeginProps.chainId = chainId;
      }

      track("refinance_tx_begin", txBeginProps);

      const builder = createMoveBuilder();
      const pv = (selectedProvider || "").toLowerCase();
      const providerVersion =
        pv.includes("aave") ? "aave" : pv.includes("v3") ? "v3" : "v2";

      const normalizeProtocol = (protocol?: string) =>
        (protocol || "")
          .toLowerCase()
          .replace(/\s+v\d+$/i, "")
          .replace(/\s+/g, "");

      const normalizedSelectedProtocol = normalizeProtocol(selectedProtocol);
      const normalizedFromProtocol = normalizeProtocol(fromProtocol);

      if (normalizedSelectedProtocol === "compound" || normalizedFromProtocol === "compound") {
        builder.setCompoundMarket(position.tokenAddress as Address);
      }

      // Check if source is Morpho Blue (need to pass fromContext)
      const isFromMorpho = normalizedFromProtocol === "morphoblue" || fromProtocol.toLowerCase().includes("morpho");
      const sourceContext: `0x${string}` = (isFromMorpho && fromContext) 
        ? fromContext as `0x${string}` 
        : "0x";

      builder.buildUnlockDebt({
        fromProtocol,
        debtToken: position.tokenAddress as Address,
        expectedDebt: debtAmount,
        debtDecimals: position.decimals,
        fromContext: sourceContext,
        flash: {
          version: providerVersion as any,
          premiumBps: 9,
          bufferBps: 10,
        },
      });

      // Prepare Morpho context if destination is Morpho Blue
      const morphoEncodedContext: `0x${string}` | undefined = isMorphoSelected && morphoContext 
        ? encodeMorphoContext(morphoContext as MorphoMarketContextForEncoding) as `0x${string}`
        : undefined;

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
          // Pass source context when moving FROM Morpho Blue
          fromContext: sourceContext,
          // Pass Morpho context when destination is Morpho Blue
          // Note: For Morpho, we use DepositCollateral (not Deposit) which is handled by the gateway
          toContext: morphoEncodedContext || "0x",
        });
      });

      builder.buildBorrow({
        mode: "coverFlash",
        toProtocol: selectedProtocol,
        token: position.tokenAddress as Address,
        decimals: position.decimals,
        extraBps: 5,
        approveToRouter: true,
        // Pass Morpho context for borrow when destination is Morpho Blue
        toContext: morphoEncodedContext || "0x",
      });

      const flow = builder.build();
      const res = await executeFlowBatchedIfPossible(flow, preferBatching, { revokePermissions });
      batchingUsed = res?.kind === "batch";
      if (!res) {
        const fallbackResult = await executeFlowBatchedIfPossible(flow, false, { revokePermissions });
        batchingUsed = batchingUsed || fallbackResult?.kind === "batch";
      }

      const txCompleteProps: Record<string, string | number | boolean> = {
        network: "evm",
        fromProtocol,
        toProtocol: selectedProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
        preferBatching: Boolean(preferBatching),
        batchingUsed,
        status: "success",
      };

      if (chainId !== undefined) txCompleteProps.chainId = chainId;
      if (selectedProvider) txCompleteProps.selectedProvider = selectedProvider;
      if (selectedPool) txCompleteProps.selectedPool = selectedPool;

      track("refinance_tx_complete", txCompleteProps);
    } catch (e: any) {
      console.error("Refinance flow error:", e);
      const txCompleteProps: Record<string, string | number | boolean> = {
        network: "evm",
        fromProtocol,
        toProtocol: selectedProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
        preferBatching: Boolean(preferBatching),
        batchingUsed,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };

      if (chainId !== undefined) txCompleteProps.chainId = chainId;
      if (selectedProvider) txCompleteProps.selectedProvider = selectedProvider;
      if (selectedPool) txCompleteProps.selectedPool = selectedPool;

      track("refinance_tx_complete", txCompleteProps);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine source pool name
  const sourcePoolName = useMemo(() => {
    // For EVM, we don't need to exclude source pool by name
    return null;
  }, []);

  return (
    <RefinanceModalContent
      isOpen={isOpen}
      onClose={onClose}
      debtSymbol={debtSymbol}
      debtIcon={debtIcon}
      debtAmount={debtAmount}
      setDebtAmount={(value) => {
        setDebtAmount(value);
        setIsDebtMaxClicked(false);
      }}
      debtMaxLabel={debtMaxLabel}
      debtMaxRaw={debtMaxRaw}
      debtConfirmed={debtConfirmed}
      setDebtConfirmed={setDebtConfirmed}
      debtInputRef={debtInputRef}
      sourceProtocol={sourceProtocol}
      setIsDebtMaxClicked={setIsDebtMaxClicked}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      showFlashLoanTab={true}
      filteredDestinationProtocols={filteredDestinationProtocols}
      selectedProtocol={selectedProtocol}
      setSelectedProtocol={setSelectedProtocol}
      selectedVersion={selectedVersion}
      setSelectedVersion={setSelectedVersion}
      vesuPools={evmVesuPools}
      sourcePoolName={sourcePoolName}
      selectedPool={selectedPool}
      setSelectedPool={setSelectedPool}
      flashLoanProviders={flashLoanProviders}
      selectedProvider={selectedProvider ?? ""}
      setSelectedProvider={setSelectedProvider}
      collaterals={collaterals}
      isLoadingCollaterals={isLoadingCollaterals || isSupportLoading}
      effectiveSupportedMap={effectiveSupportedMap}
      addedCollaterals={addedCollaterals}
      expandedCollateral={expandedCollateral}
      tempAmount={tempAmount}
      setTempAmount={setTempAmount}
      setTempIsMax={setTempIsMax}
      onCollateralTileClick={onCollateralTileClick}
      onAddCollateral={onAddCollateral}
      disableCollateralSelection={disableCollateralSelection}
      preSelectedCollaterals={preSelectedCollaterals}
      getUsdValue={getUsdValue}
      refiHF={refiHF}
      hfColor={hfColor}
      totalCollateralUsd={totalCollateralUsd}
      ltv={ltv}
      debtUsd={debtUsd}
      isActionDisabled={isActionDisabled}
      isSubmitting={isSubmitting}
      handleExecuteMove={handleExecuteMove}
      showBatchingOption={true}
      preferBatching={preferBatching}
      setPreferBatching={setPreferBatching}
      revokePermissions={revokePermissions}
      setRevokePermissions={setRevokePermissions}
      apiProbes={apiProbes}
      // Morpho-specific props
      isMorphoSelected={isMorphoSelected}
      morphoMarkets={morphoMarketsForSelectedCollateral}
      selectedMorphoMarket={selectedMorphoMarket}
      onMorphoMarketSelect={onMorphoMarketSelect}
      morphoSupportedCollaterals={morphoSupportedCollaterals}
      isLoadingMorphoMarkets={isLoadingMorphoMarkets}
      chainId={chainId}
    />
  );
};

