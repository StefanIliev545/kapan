import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "~~/hooks/useAccount";
import { useCollateral as useStarkCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import { useVesuPools } from "~~/hooks/useStarknetMovePosition";
import { useStarknetMovePositionLegacy } from "~~/hooks/useStarknetMovePositionLegacy";
import { getProtocolLogo } from "~~/utils/protocol";
import { getV1PoolNameFromId, getV2PoolNameFromAddress } from "~~/components/specific/vesu/pools";
import { normalizeStarknetAddress } from "~~/utils/vesu";
import { useStarknetCollateralSupport } from "~~/hooks/useStarknetCollateralSupport";
import { useMovePositionState } from "~~/hooks/useMovePositionState";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { RefinanceModalContent } from "./RefinanceModalContent";
import { usePriceMap } from "~~/hooks/kapan/usePrices";

/* ------------------------------ Helpers ------------------------------ */
const addrKey = (a?: string) => (a ?? "").toLowerCase();

/* ---------------------------- Component ------------------------------ */
type RefinanceModalStarkProps = {
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
  preSelectedCollaterals?: Array<{
    token: string;
    symbol: string;
    decimals: number;
    amount?: bigint;
    maxAmount?: bigint;
    inputValue?: string;
  }>;
  disableCollateralSelection?: boolean;
};

export const RefinanceModalStark: FC<RefinanceModalStarkProps> = ({
  isOpen,
  onClose,
  fromProtocol,
  position,
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
    isLoadingCollaterals,
    destinationProtocols,
    flashLoanProviders,
  } = useMovePositionData({
    isOpen,
    networkType: "starknet",
    fromProtocol,
    position,
  });

  const { address: starkUserAddress } = useAccount();

  // Filter destination protocols for Starknet: combine Vesu and VesuV2 into single "Vesu" option
  const filteredDestinationProtocols = useMemo(() => {
    const baseProtocols = destinationProtocols.filter(p => p.name !== "VesuV2");
    return baseProtocols.length > 0 ? baseProtocols : [{ name: "Nostra", logo: getProtocolLogo("Nostra") }];
  }, [destinationProtocols]);

  // Use Vesu pools hook (for Starknet)
  const {
    selectedPoolId,
    setSelectedPoolId,
    selectedV2PoolAddress,
    setSelectedV2PoolAddress,
    vesuPools: starkVesuPools,
  } = useVesuPools("starknet", fromProtocol, position.poolId);

  // Determine source pool name to exclude from destination dropdown
  const sourcePoolName = useMemo(() => {
    if (!position.poolId || (fromProtocol !== "Vesu" && fromProtocol !== "VesuV2")) return null;

    if (fromProtocol === "Vesu") {
      const poolId = typeof position.poolId === "string" ? BigInt(position.poolId) : position.poolId;
      const poolName = getV1PoolNameFromId(poolId);
      return poolName !== "Unknown" ? poolName : null;
    } else {
      try {
        const poolAddress = typeof position.poolId === "string"
          ? normalizeStarknetAddress(position.poolId)
          : normalizeStarknetAddress(String(position.poolId));
        const poolName = getV2PoolNameFromAddress(poolAddress);
        return poolName !== "Unknown" ? poolName : null;
      } catch {
        return null;
      }
    }
  }, [fromProtocol, position.poolId]);

  // For Starknet, fetch source collaterals directly
  const { collaterals: starkSourceCollaterals } = useStarkCollateral({
    protocolName: fromProtocol as "Vesu" | "VesuV2" | "Nostra",
    userAddress: starkUserAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen,
  });

  // Use source collaterals for Starknet
  const effectiveCollateralsFromHook = starkSourceCollaterals.map(c => ({
    address: c.address,
    symbol: c.symbol,
    icon: tokenNameToLogo(c.symbol.toLowerCase()),
    decimals: c.decimals,
    rawBalance: c.rawBalance,
    balance: c.balance,
  }));

  // Merge preselected collaterals with collaterals from hook
  const collaterals = useMemo(() => {
    const sortByAddress = (list: typeof effectiveCollateralsFromHook) =>
      [...list].sort((a, b) => addrKey(a.address).localeCompare(addrKey(b.address)));

    if (!preSelectedCollaterals || preSelectedCollaterals.length === 0) {
      return sortByAddress(effectiveCollateralsFromHook);
    }

    const existingMap = new Map(effectiveCollateralsFromHook.map(c => [addrKey(c.address), c]));
    const merged = [...effectiveCollateralsFromHook];

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

    return sortByAddress(merged);
  }, [effectiveCollateralsFromHook, preSelectedCollaterals]);

  /* --------------------------- State management --------------------------- */
  const state = useMovePositionState(isOpen);

  const {
    debtAmount,
    setDebtAmount,
    setIsDebtMaxClicked,
    isDebtMaxClicked,
    debtConfirmed,
    setDebtConfirmed,
    activeTab,
    setActiveTab,
    selectedProtocol,
    setSelectedProtocol,
    selectedProvider,
    setSelectedProvider,
    selectedVersion,
    setSelectedVersion,
    expandedCollateral,
    setExpandedCollateral,
    tempAmount,
    setTempAmount,
    setTempIsMax,
    addedCollaterals,
    collateralIsMaxMap,
    isSubmitting,
    setIsSubmitting,
    resetState,
    onCollateralTileClick,
    onAddCollateral,
  } = state;

  /* ---------------------- Support map for selection --------------------- */
  const { supportedCollateralMap: starknetSupportedMap } = useStarknetCollateralSupport(
    fromProtocol,
    selectedProtocol,
    selectedVersion,
    collaterals,
    isOpen
  );

  const effectiveSupportedMap = starknetSupportedMap;

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
          try {
            // If the provided amount equals full raw balance, mark as MAX by default
            const providedRaw = firstPreselected.amount;
            if (providedRaw === meta.rawBalance) {
              setTempIsMax(true);
            }
          } catch {}
        } else if (firstPreselected.inputValue) {
          setTempAmount(firstPreselected.inputValue);
        } else {
          // Default to full balance and mark as MAX until edited
          setTempAmount(formatUnits(meta.rawBalance, meta.decimals));
          setTempIsMax(true);
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
    if (!isVesu || !starkVesuPools) return;

    if (selectedVersion === "v1") {
      const sourceV1Id = fromProtocol === "Vesu" && position.poolId
        ? (typeof position.poolId === "string" ? BigInt(position.poolId) : position.poolId)
        : undefined;
      const filtered = starkVesuPools.v1Pools.filter(p => sourceV1Id === undefined || p.id !== sourceV1Id);
      const currentValid = starkVesuPools.v1Pools.some(p => p.id === selectedPoolId) && (!sourceV1Id || selectedPoolId !== sourceV1Id);
      if (!currentValid) {
        const next = (filtered[0]?.id) ?? starkVesuPools.v1Pools[0]?.id;
        if (next) setSelectedPoolId(next);
      }
    } else {
      const sourceV2Addr = fromProtocol === "VesuV2" && position.poolId ? String(position.poolId) : undefined;
      const sourceV2Normalized = sourceV2Addr ? sourceV2Addr.toLowerCase() : undefined;
      const currentValid = !!selectedV2PoolAddress
        && starkVesuPools.v2Pools.some(p => p.address.toLowerCase() === selectedV2PoolAddress.toLowerCase())
        && (!sourceV2Normalized || selectedV2PoolAddress.toLowerCase() !== sourceV2Normalized);
      if (!currentValid) {
        const filtered = starkVesuPools.v2Pools.filter(p => !sourceV2Normalized || p.address.toLowerCase() !== sourceV2Normalized);
        const next = (filtered[0]?.address) ?? starkVesuPools.v2Pools[0]?.address;
        if (next) setSelectedV2PoolAddress(next);
      }
    }
  }, [isOpen, selectedProtocol, selectedVersion, starkVesuPools, setSelectedPoolId, setSelectedV2PoolAddress]);

  useEffect(() => {
    if (!(isOpen && !debtConfirmed)) return;
    const t = setTimeout(() => debtInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isOpen, debtConfirmed]);

  // Run reset only on closed -> open transition to avoid identity churn loops
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      resetState();
    }
    wasOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* ------------------------ Price‑based calculations -------------------- */
  // Collect addresses for price fetching: collaterals + debt token
  const priceAddresses = useMemo(() => {
    const collateralAddrs = collaterals.map(c => c.address);
    return [...collateralAddrs, position.tokenAddress];
  }, [collaterals, position.tokenAddress]);

  const { priceByAddress } = usePriceMap(priceAddresses, isOpen, 30000);

  // Calculate USD value for a given address and amount
  const getUsdValue = useCallback((address: string, humanAmount: string): number => {
    if (!humanAmount || humanAmount === "0") return 0;
    
    const collateral = collaterals.find(c => addrKey(c.address) === addrKey(address));
    if (!collateral) return 0;

    try {
      const amount = Number(formatUnits(parseUnits(humanAmount, collateral.decimals), collateral.decimals));
      const priceRaw = priceByAddress[addrKey(address)];
      if (!priceRaw) return 0;
      
      // Price is in 1e18 format, format with 18 decimals
      const price = Number(formatUnits(priceRaw, 18));
      return amount * price;
    } catch {
      return 0;
    }
  }, [collaterals, priceByAddress]);

  // Calculate total collateral USD
  const totalCollateralUsd = useMemo(() => {
    return Object.entries(addedCollaterals).reduce((sum, [addr, amt]) => {
      return sum + getUsdValue(addr, amt || "0");
    }, 0);
  }, [addedCollaterals, getUsdValue]);

  // Calculate debt USD
  const debtUsd = useMemo(() => {
    if (!debtAmount || debtAmount === "0") return 0;
    try {
      const amount = Number(formatUnits(parseUnits(debtAmount, position.decimals), position.decimals));
      const priceRaw = priceByAddress[addrKey(position.tokenAddress)];
      if (!priceRaw) return 0;
      
      const price = Number(formatUnits(priceRaw, 18));
      return amount * price;
    } catch {
      return 0;
    }
  }, [debtAmount, position.decimals, position.tokenAddress, priceByAddress]);

  // Calculate LTV
  const ltv = useMemo(() => {
    if (totalCollateralUsd === 0) return "0.0";
    return ((debtUsd / totalCollateralUsd) * 100).toFixed(1);
  }, [debtUsd, totalCollateralUsd]);

  // Health factor calculation (simplified - adjust based on your protocol requirements)
  const refiHF = useMemo(() => {
    if (totalCollateralUsd === 0) return 999;
    // Simple calculation: HF = collateral / debt (higher is better)
    const ratio = totalCollateralUsd / debtUsd;
    return ratio > 0 ? ratio : 0;
  }, [totalCollateralUsd, debtUsd]);

  const hfColor = useMemo(() => {
    if (refiHF >= 2.0) return { tone: "text-success", badge: "badge-success" };
    if (refiHF >= 1.5) return { tone: "text-warning", badge: "badge-warning" };
    return { tone: "text-error", badge: "badge-error" };
  }, [refiHF]);

  /* --------------------------- Starknet execution --------------------------- */
  const legacy = useStarknetMovePositionLegacy({
    isOpen: isOpen,
    fromProtocol,
    toProtocol: selectedProtocol || "Nostra",
    selectedVersion,
    debtAmount,
    isDebtMaxClicked,
    position,
    addedCollaterals,
    collateralIsMaxMap,
    collaterals,
    selectedPoolId,
    selectedV2PoolAddress,
  });

  const sendStarkAsync = legacy.sendAsync;
  const starknetError = legacy.error;

  /* --------------------------- Action Handlers --------------------------- */
  const isActionDisabled = !debtConfirmed || !selectedProtocol || Object.keys(addedCollaterals).length === 0;

  const handleExecuteMove = async () => {
    if (!debtConfirmed || !selectedProtocol) return;

    try {
      setIsSubmitting(true);

      if (!sendStarkAsync) {
        throw new Error("Starknet transaction not ready");
      }

      await sendStarkAsync();
      setTimeout(() => onClose(), 2000);
    } catch (e: any) {
      console.error("Refinance flow error:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Starknet errors
  useEffect(() => {
    if (starknetError) {
      console.error("Starknet authorization error:", starknetError);
    }
  }, [starknetError]);

  return (
    <RefinanceModalContent
      isOpen={isOpen}
      onClose={onClose}
      debtSymbol={debtSymbol}
      debtIcon={debtIcon}
      debtAmount={debtAmount}
      setDebtAmount={setDebtAmount}
      debtMaxLabel={debtMaxLabel}
      debtMaxRaw={debtMaxRaw}
      debtConfirmed={debtConfirmed}
      setDebtConfirmed={setDebtConfirmed}
      debtInputRef={debtInputRef}
      sourceProtocol={sourceProtocol}
      setIsDebtMaxClicked={setIsDebtMaxClicked}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      showFlashLoanTab={false}
      filteredDestinationProtocols={filteredDestinationProtocols}
      selectedProtocol={selectedProtocol}
      setSelectedProtocol={setSelectedProtocol}
      selectedVersion={selectedVersion}
      setSelectedVersion={setSelectedVersion}
      vesuPools={starkVesuPools}
      sourcePoolName={sourcePoolName}
      selectedPoolId={selectedPoolId}
      setSelectedPoolId={setSelectedPoolId}
      selectedV2PoolAddress={selectedV2PoolAddress}
      setSelectedV2PoolAddress={setSelectedV2PoolAddress}
      flashLoanProviders={flashLoanProviders}
      selectedProvider={selectedProvider ?? ""}
      setSelectedProvider={setSelectedProvider}
      collaterals={collaterals}
      isLoadingCollaterals={isLoadingCollaterals}
      effectiveSupportedMap={effectiveSupportedMap ?? {}}
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
      showBatchingOption={false}
      preferBatching={false}
      errorMessage={starknetError ? `Starknet error: ${starknetError}` : undefined}
    />
  );
};

