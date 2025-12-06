import { track } from "@vercel/analytics";
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

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      track("refinance_modal_open", {
        network: "starknet",
        fromProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
      });
    }
    wasOpenRef.current = isOpen;
  }, [fromProtocol, isOpen, position.name, position.tokenAddress, position.type]);

  /* ---------------------- Support map for selection --------------------- */
  const { supportedCollateralMap: starknetSupportedMap } = useStarknetCollateralSupport(
    fromProtocol,
    selectedProtocol,
    selectedVersion,
    collaterals,
    isOpen,
    {
      vesuV1PoolId: selectedPoolId,
      vesuV2PoolAddress: selectedV2PoolAddress,
    }
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

  useEffect(() => {
    resetState();
  }, [isOpen, resetState]);

  /* ------------------------ Price‑based calculations -------------------- */
  // For Starknet, we don't calculate USD values (return 0)
  const getUsdValue = useCallback((address: string, humanAmount: string): number => {
    void address;
    void humanAmount;
    return 0;
  }, []);

  const totalCollateralUsd = 0;
  const debtUsd = 0;
  const ltv = "0.0";
  const refiHF = 999; // Safe default for Starknet
  const hfColor = { tone: "text-success", badge: "badge-success" };

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

      track("refinance_tx_begin", {
        network: "starknet",
        fromProtocol,
        toProtocol: selectedProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
        preferBatching: false,
        batchingUsed: false,
      });

      if (!sendStarkAsync) {
        throw new Error("Starknet transaction not ready");
      }

      await sendStarkAsync();
      track("refinance_tx_complete", {
        network: "starknet",
        fromProtocol,
        toProtocol: selectedProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
        preferBatching: false,
        batchingUsed: false,
        status: "success",
      });
      setTimeout(() => onClose(), 2000);
    } catch (e: any) {
      console.error("Refinance flow error:", e);
      track("refinance_tx_complete", {
        network: "starknet",
        fromProtocol,
        toProtocol: selectedProtocol,
        debtTokenName: position.name,
        debtTokenAddress: position.tokenAddress,
        positionType: position.type,
        preferBatching: false,
        batchingUsed: false,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
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

