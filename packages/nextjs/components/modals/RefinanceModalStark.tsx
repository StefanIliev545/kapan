import { track } from "@vercel/analytics";
import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
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
import {
  useMergedCollaterals,
  usePreselectedCollateralsEffect,
  useStableProtocolSelection,
  useDebtInputFocus,
  type CollateralFromHook,
  type RefinanceModalStarkProps,
} from "./common";

/* ---- Vesu Pool Helpers ---- */

function resolveSourceV1PoolId(proto: string, poolId?: bigint | string): bigint | undefined {
  if (proto !== "Vesu" || !poolId) return undefined;
  return typeof poolId === "string" ? BigInt(poolId) : poolId;
}

function resolveSourceV2Normalized(proto: string, poolId?: bigint | string): string | undefined {
  if (proto !== "VesuV2" || !poolId) return undefined;
  return String(poolId).toLowerCase();
}

function selectBestV1Pool(pools: Array<{ id: bigint }>, current: bigint, srcId: bigint | undefined): bigint | null {
  if (pools.some(p => p.id === current) && (!srcId || current !== srcId)) return null;
  const found = pools.find(p => srcId === undefined || p.id !== srcId);
  return found?.id ?? pools[0]?.id ?? null;
}

function selectBestV2Pool(pools: Array<{ address: string }>, current: string | undefined, srcNorm: string | undefined): string | null {
  if (!!current && pools.some(p => p.address.toLowerCase() === current.toLowerCase()) && (!srcNorm || current.toLowerCase() !== srcNorm)) return null;
  const found = pools.find(p => !srcNorm || p.address.toLowerCase() !== srcNorm);
  return found?.address ?? pools[0]?.address ?? null;
}

/* ---------------------------- Component ------------------------------ */
export { type RefinanceModalStarkProps };

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
    if (!position.poolId || (fromProtocol !== "Vesu" && fromProtocol !== "VesuV2")) {
      return null;
    }

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
  const effectiveCollateralsFromHook: CollateralFromHook[] = starkSourceCollaterals.map(c => ({
    address: c.address,
    symbol: c.symbol,
    icon: tokenNameToLogo(c.symbol.toLowerCase()),
    decimals: c.decimals,
    rawBalance: c.rawBalance,
    balance: c.balance,
  }));

  // Merge preselected collaterals with collaterals from hook using shared utility
  const collaterals = useMergedCollaterals({
    collateralsFromHook: effectiveCollateralsFromHook,
    preSelectedCollaterals,
    disableCollateralSelection,
    sortByAddress: true, // Starknet sorts by address for consistency
  });

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

  const effectiveSupportedMapMemo = useMemo(() => starknetSupportedMap ?? {}, [starknetSupportedMap]);

  const debtInputRef = useRef<HTMLInputElement>(null);

  // Initialize preselected collaterals using shared hook
  usePreselectedCollateralsEffect({
    isOpen,
    preSelectedCollaterals,
    collaterals,
    expandedCollateral,
    setExpandedCollateral,
    setTempAmount,
    setTempIsMax, // Starknet uses setTempIsMax for MAX tracking
  });

  // Maintain stable protocol selection using shared hook
  useStableProtocolSelection({
    isOpen,
    filteredDestinationProtocols,
    selectedProtocol,
    setSelectedProtocol,
  });

  // Auto-select best Vesu pool, avoiding the source pool
  useEffect(() => {
    if (!isOpen) return;
    const isVesu = selectedProtocol === "Vesu" || selectedProtocol === "VesuV2";
    if (!isVesu || !starkVesuPools) return;

    if (selectedVersion === "v1") {
      const sourceV1Id = resolveSourceV1PoolId(fromProtocol, position.poolId);
      const next = selectBestV1Pool(starkVesuPools.v1Pools, selectedPoolId, sourceV1Id);
      if (next !== null) setSelectedPoolId(next);
    } else {
      const srcNorm = resolveSourceV2Normalized(fromProtocol, position.poolId);
      const next = selectBestV2Pool(starkVesuPools.v2Pools, selectedV2PoolAddress, srcNorm);
      if (next !== null) setSelectedV2PoolAddress(next);
    }
  }, [isOpen, selectedProtocol, selectedVersion, starkVesuPools, setSelectedPoolId, setSelectedV2PoolAddress, fromProtocol, position.poolId, selectedPoolId, selectedV2PoolAddress]);

  // Auto-focus debt input using shared hook
  useDebtInputFocus({ isOpen, debtConfirmed, debtInputRef });

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
  const hfColor = useMemo(() => ({ tone: "text-success", badge: "badge-success" }), []);

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

  const handleExecuteMove = useCallback(async () => {
    if (!debtConfirmed || !selectedProtocol) {
      return;
    }

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
    } catch (error) {
      console.error("Refinance flow error:", error);
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
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [debtConfirmed, selectedProtocol, fromProtocol, position.name, position.tokenAddress, position.type, sendStarkAsync, setIsSubmitting, onClose]);

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
      effectiveSupportedMap={effectiveSupportedMapMemo}
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

