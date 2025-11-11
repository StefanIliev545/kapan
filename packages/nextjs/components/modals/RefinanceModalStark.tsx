import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { formatUnits } from "viem";
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
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark/useScaffoldReadContract";
import { RefinanceModalContent } from "./RefinanceModalContent";

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

  const starkCollateralAddresses = useMemo(
    () => collaterals.map(c => c.address),
    [collaterals],
  );

  const starkPriceArgs = useMemo(() => {
    const addresses = [...starkCollateralAddresses];
    if (position.tokenAddress) {
      addresses.push(position.tokenAddress);
    }
    return addresses;
  }, [starkCollateralAddresses, position.tokenAddress]);

  const starkPriceArgsTuple = useMemo<readonly [string[] | undefined]>(
    () => [starkPriceArgs.length ? starkPriceArgs : undefined] as const,
    [starkPriceArgs],
  );

  const { data: starkTokenPrices } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: starkPriceArgsTuple,
    refetchInterval: 30000,
    enabled: isOpen && Boolean(starkPriceArgs.length),
  });

  const starkTokenToPrices = useMemo(() => {
    if (!starkTokenPrices || !starkPriceArgs.length) return {} as Record<string, bigint>;
    const prices = starkTokenPrices as unknown as bigint[];
    return starkPriceArgs.reduce((acc, address, index) => {
      const price = prices[index] ?? 0n;
      acc[addrKey(address)] = price / 10n ** 10n;
      return acc;
    }, {} as Record<string, bigint>);
  }, [starkTokenPrices, starkPriceArgs]);

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
  }, [
    isOpen,
    preSelectedCollaterals,
    collaterals,
    expandedCollateral,
    setExpandedCollateral,
    setTempAmount,
    setTempIsMax,
  ]);

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
  }, [
    isOpen,
    selectedProtocol,
    selectedVersion,
    starkVesuPools,
    fromProtocol,
    position.poolId,
    selectedPoolId,
    selectedV2PoolAddress,
    setSelectedPoolId,
    setSelectedV2PoolAddress,
  ]);

  useEffect(() => {
    if (!(isOpen && !debtConfirmed)) return;
    const t = setTimeout(() => debtInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isOpen, debtConfirmed]);

  useEffect(() => {
    resetState();
  }, [isOpen, resetState]);

  /* ------------------------ Price‑based calculations -------------------- */
  const debtPrice8 = starkTokenToPrices[addrKey(position.tokenAddress)] ?? 0n;

  const debtUsd = useMemo(() => {
    if (!debtConfirmed) return 0;
    const parsed = parseFloat((debtAmount || "").trim() || "0");
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    if (!debtPrice8) return 0;
    return parsed * Number(formatUnits(debtPrice8, 8));
  }, [debtAmount, debtConfirmed, debtPrice8]);

  const getUsdValue = useCallback(
    (address: string, humanAmount: string): number => {
      const amt = parseFloat((humanAmount || "").trim() || "0");
      if (Number.isNaN(amt) || amt <= 0) return 0;
      const price8 = starkTokenToPrices[addrKey(address)] ?? 0n;
      if (!price8) return 0;
      return amt * Number(formatUnits(price8, 8));
    },
    [starkTokenToPrices],
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
    if (!debtUsd) return "0.0";
    return ((debtUsd / totalCollateralUsd) * 100).toFixed(1);
  }, [debtUsd, totalCollateralUsd]);

  const refiHF = useMemo(() => {
    if (!debtUsd) return 999;
    if (!totalCollateralUsd) return 0;
    return totalCollateralUsd / debtUsd;
  }, [debtUsd, totalCollateralUsd]);

  const hfColor = useMemo(() => {
    if (refiHF >= 2 || refiHF === 999) return { tone: "text-success", badge: "badge-success" };
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
    tokenToPrices: starkTokenToPrices,
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

