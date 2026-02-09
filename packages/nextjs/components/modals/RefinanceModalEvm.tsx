import { track } from "@vercel/analytics";
import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { formatUnits, parseUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { useTokenPricesByAddress, priceToRaw } from "~~/hooks/useTokenPrice";
import { useMovePositionState } from "~~/hooks/useMovePositionState";
import { RefinanceModalContent } from "./RefinanceModalContent";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMorphoMarketSupport } from "~~/hooks/useMorphoMarketSupport";
import { useEulerMarketSupport } from "~~/hooks/useEulerMarketSupport";
import { useEulerRefinanceSubAccount } from "~~/hooks/useEulerRefinanceSubAccount";
import { encodeMorphoContext, encodeEulerContext, type MorphoMarketContextForEncoding, type EulerVaultContextForEncoding } from "~~/utils/v2/instructionHelpers";
import {
  useMergedCollaterals,
  usePreselectedCollateralsEffect,
  useStableProtocolSelection,
  useDebtInputFocus,
  type CollateralFromHook,
  type RefinanceModalEvmProps,
} from "./common";
import { useHasActiveConditionalOrders } from "~~/hooks/useConditionalOrders";

/* ------------------------------ Helpers ------------------------------ */
import { addrKey } from "~~/utils/address";
type PriceMap = Record<string, bigint>;

const price8 = (addr: string, tokenToPrices: PriceMap) =>
  tokenToPrices[addrKey(addr)] ?? 0n;

const toUsdFromP8 = (humanAmount: number, p8: bigint): number => {
  if (!p8 || p8 === 0n || !Number.isFinite(humanAmount) || humanAmount <= 0) {
    return 0;
  }
  return humanAmount * Number(formatUnits(p8, 8));
};

const toUsdRaw = (amountRaw: bigint, decimals: number, p8: bigint): number => {
  if (!amountRaw || !p8) {
    return 0;
  }
  return Number(formatUnits(amountRaw, decimals)) * Number(formatUnits(p8, 8));
};

interface CollateralWithLt {
  liquidationThresholdBps?: number | bigint;
  collateralFactorBps?: number | bigint;
  ltBps?: number | bigint;
  ltvBps?: number | bigint;
}

const getLtBps = (c: CollateralWithLt | null | undefined): number => {
  const v = Number(
    c?.liquidationThresholdBps ??
    c?.collateralFactorBps ??
    c?.ltBps ??
    c?.ltvBps ??
    8273
  );
  return Math.max(0, Math.min(10_000, v));
};

/* -------------------- handleExecuteMove helpers -------------------- */
// Extracted from handleExecuteMove to reduce cognitive complexity.
// Each helper handles one concern: protocol detection, analytics tracking,
// context resolution, simulation, or execution fallback.

/** Normalize a protocol name by removing version suffixes and whitespace */
const normalizeProtocolName = (protocol?: string) =>
  (protocol || "").toLowerCase().replace(/\s+v\d+$/i, "").replace(/\s+/g, "");

/** Determine flash loan provider version from its name */
const resolveProviderVersion = (providerName: string): "aave" | "v2" | "v3" => {
  const pv = providerName.toLowerCase();
  if (pv.includes("aave")) return "aave";
  if (pv.includes("v3")) return "v3";
  return "v2";
};

/** Check if a protocol name matches a normalized key or contains a substring */
const matchesProtocol = (normalizedName: string, rawName: string, key: string): boolean =>
  normalizedName === key || rawName.toLowerCase().includes(key);

type TrackingProps = Record<string, string | number | boolean>;

/** Build base tracking props shared by begin/success/error events */
const buildBaseTrackingProps = (params: {
  fromProtocol: string;
  toProtocol: string;
  position: { name: string; tokenAddress: string; type: string };
  preferBatching: boolean;
  chainId?: number;
}): TrackingProps => {
  const props: TrackingProps = {
    network: "evm",
    fromProtocol: params.fromProtocol,
    toProtocol: params.toProtocol,
    debtTokenName: params.position.name,
    debtTokenAddress: params.position.tokenAddress,
    positionType: params.position.type,
    preferBatching: params.preferBatching,
  };
  if (params.chainId !== undefined) {
    props.chainId = params.chainId;
  }
  return props;
};

/** Append optional fields (selectedProvider, selectedPool) to tracking props */
const appendOptionalTrackingFields = (
  props: TrackingProps,
  fields: { selectedProvider?: string; selectedPool?: string },
): void => {
  if (fields.selectedProvider) {
    props.selectedProvider = fields.selectedProvider;
  }
  if (fields.selectedPool) {
    props.selectedPool = fields.selectedPool;
  }
};

/** Build per-collateral Euler source contexts from preSelectedCollaterals */
const buildEulerSourceContexts = (
  preSelectedCollaterals: Array<{ token: string; symbol?: string; eulerCollateralVault?: string; eulerSubAccountIndex?: number }> | undefined,
  fromContext: string | undefined,
): Record<string, `0x${string}`> => {
  const contexts: Record<string, `0x${string}`> = {};
  if (!preSelectedCollaterals) return contexts;

  for (const preCol of preSelectedCollaterals) {
    if (!preCol.eulerCollateralVault) continue;
    // Re-encode with the correct collateral vault and sub-account index for each collateral
    // fromContext encodes: (borrowVault, collateralVault, subAccountIndex)
    const ctx = encodeEulerContext({
      borrowVault: fromContext ? `0x${fromContext.slice(26, 66)}` : "0x0000000000000000000000000000000000000000",
      collateralVault: preCol.eulerCollateralVault,
      subAccountIndex: preCol.eulerSubAccountIndex ?? 0,
    }) as `0x${string}`;
    contexts[addrKey(preCol.token)] = ctx;
    console.log("[Euler Source Context] Built context for", preCol.symbol, "collateralVault:", preCol.eulerCollateralVault, "subAccountIndex:", preCol.eulerSubAccountIndex ?? 0);
  }
  return contexts;
};

/** Resolve the destination context for a single collateral entry */
const resolveDestContext = (
  addr: string,
  isEulerDest: boolean,
  eulerContexts: Record<string, EulerVaultContextForEncoding>,
  morphoEncodedContext: `0x${string}` | undefined,
  symbolForLog?: string,
): `0x${string}` => {
  if (!isEulerDest) return morphoEncodedContext || "0x";

  const colCtx = eulerContexts[addrKey(addr)];
  if (colCtx) {
    console.log("[Euler Debug] Using per-collateral destination context for", symbolForLog, ":", colCtx);
    return encodeEulerContext(colCtx) as `0x${string}`;
  }
  console.warn("[Euler Debug] No destination context found for collateral:", addr, symbolForLog);
  return morphoEncodedContext || "0x";
};

/** Resolve the source context for a single collateral entry */
const resolveSourceCtx = (
  addr: string,
  isFromEuler: boolean,
  eulerSourceContexts: Record<string, `0x${string}`>,
  defaultSourceContext: `0x${string}`,
  symbolForLog?: string,
): `0x${string}` => {
  if (!isFromEuler) return defaultSourceContext;

  const ctx = eulerSourceContexts[addrKey(addr)];
  if (ctx) {
    console.log("[Euler Debug] Using per-collateral source context for", symbolForLog);
    return ctx;
  }
  console.warn("[Euler Debug] No source context found for collateral:", addr, symbolForLog);
  return defaultSourceContext;
};

/** Pre-simulate flow instructions; re-throws on failure with detailed logging */
const preSimulateFlow = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flow: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simulateFn: (f: any[], o: { skipWhenAuthCallsExist: boolean }) => Promise<void>,
): Promise<void> => {
  try {
    await simulateFn(flow, { skipWhenAuthCallsExist: false });
    console.log("[Refinance] Pre-simulation passed");
  } catch (simError: unknown) {
    console.error("[Refinance] Pre-simulation FAILED:", simError);
    const e = simError as { message?: string; cause?: unknown; data?: unknown } | null;
    console.error("[Refinance] Simulation error details:", { message: e?.message, cause: e?.cause, data: e?.data });
    throw simError;
  }
};

/** Execute flow with batching preference, falling back to unbatched if needed */
const executeFlowWithFallback = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flow: any[],
  batchPref: boolean,
  revokePerms: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeFn: (f: any[], b: boolean, o: { revokePermissions: boolean }) => Promise<{ kind: string } | null>,
): Promise<boolean> => {
  const res = await executeFn(flow, batchPref, { revokePermissions: revokePerms });
  let batchingUsed = res?.kind === "batch";
  if (!res) {
    const fallbackResult = await executeFn(flow, false, { revokePermissions: revokePerms });
    batchingUsed = batchingUsed || fallbackResult?.kind === "batch";
  }
  return batchingUsed;
};

/** Resolve the borrow context based on destination protocol */
const resolveBorrowContext = (
  isEulerDest: boolean,
  eulerCtx: EulerVaultContextForEncoding | undefined,
  morphoEncodedContext: `0x${string}` | undefined,
): `0x${string}` => {
  if (isEulerDest && eulerCtx) {
    return encodeEulerContext(eulerCtx) as `0x${string}`;
  }
  return morphoEncodedContext || "0x";
};

/** Compute default source context for protocols that require it (Morpho Blue, Euler) */
const computeDefaultSourceContext = (
  isFromMorpho: boolean,
  isFromEuler: boolean,
  fromCtx?: string,
): `0x${string}` => {
  if ((isFromMorpho || isFromEuler) && fromCtx) {
    return fromCtx as `0x${string}`;
  }
  return "0x";
};

/* CollatPriceProbe removed — prices now fetched via useTokenPricesByAddress in the parent */

/* ---------------------------- Component ------------------------------ */
export { type RefinanceModalEvmProps };

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
  /* ------------------------- User address ------------------------- */
  const { address: userAddress } = useAccount();

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

  // Merge preselected collaterals with collaterals from hook using shared utility
  const collaterals = useMergedCollaterals({
    collateralsFromHook: collateralsFromHook as CollateralFromHook[],
    preSelectedCollaterals,
    disableCollateralSelection,
    sortByAddress: false,
  });

  /* ----------------------- Stable prices (merged) ------------------------ */
  const [mergedPrices, setMergedPrices] = useState<PriceMap>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setMergedPrices(prev => {
      let changed = false;
      let next = prev;
      for (const [k, v] of Object.entries(seedPrices || {})) {
        if (!v || v <= 0n) {
          continue;
        }
        const key = addrKey(k);
        if (prev[key] !== v) {
          if (next === prev) {
            next = { ...prev };
          }
          next[key] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isOpen, seedPrices]);

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
  const setSelectedProvider = useCallback((name: string) => {
    const p = flashLoanProviders.find(p => p.name === name);
    if (p) {
      setHookSelectedProvider(p);
    }
  }, [flashLoanProviders, setHookSelectedProvider]);

  /* ---------------------- Support map for selection --------------------- */
  const collateralAddresses = useMemo(() => collaterals.map(c => c.address), [collaterals]);

  // Check if protocol uses custom support hooks (Morpho, Euler)
  // These protocols have their own market support hooks, so skip the generic one
  const isMorphoSelected = selectedProtocol === "Morpho Blue";
  const isEulerSelected = selectedProtocol === "Euler V2";
  const usesCustomSupportHook = isMorphoSelected || isEulerSelected;

  const { supportedCollaterals: effectiveSupportedMap, isLoading: isSupportLoading } = useCollateralSupport(
    selectedProtocol || filteredDestinationProtocols[0]?.name || "",
    position.tokenAddress,
    collateralAddresses.map(a => a.toLowerCase()),
    isOpen && collateralAddresses.length > 0 && Boolean(selectedProtocol || filteredDestinationProtocols[0]?.name) && !usesCustomSupportHook,
    chainId,
  );

  /* ---------------------- Morpho market support ---------------------- */

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
    if (!isMorphoSelected) {
      return [];
    }
    const selectedCollateralAddr = Object.keys(addedCollaterals)[0]?.toLowerCase();
    if (!selectedCollateralAddr) {
      return [];
    }
    return morphoMarketsByCollateral[selectedCollateralAddr] || [];
  }, [isMorphoSelected, addedCollaterals, morphoMarketsByCollateral]);

  /* ---------------------- Euler vault support ---------------------- */
  // Get collateral symbols for Euler market matching
  const collateralSymbols = useMemo(() =>
    collateralAddresses.map(addr => {
      const c = collaterals.find(col => addrKey(col.address) === addrKey(addr));
      return c?.symbol || "";
    }),
    [collateralAddresses, collaterals]
  );

  const {
    supportedCollaterals: eulerSupportedCollaterals,
    vaultsByCollateral: eulerVaultsByCollateral,
    isLoading: isLoadingEulerVaults,
  } = useEulerMarketSupport({
    chainId: chainId || 42161, // Default to Arbitrum
    loanTokenAddress: position.tokenAddress,
    collateralAddresses: collateralAddresses.map(a => a.toLowerCase()),
    collateralSymbols,
    enabled: isOpen && isEulerSelected && collateralAddresses.length > 0,
  });

  // Get vaults for the currently selected collateral (for Euler)
  const eulerVaultsForSelectedCollateral = useMemo(() => {
    if (!isEulerSelected) {
      return [];
    }
    const selectedCollateralAddr = Object.keys(addedCollaterals)[0]?.toLowerCase();
    if (!selectedCollateralAddr) {
      return [];
    }
    return eulerVaultsByCollateral[selectedCollateralAddr] || [];
  }, [isEulerSelected, addedCollaterals, eulerVaultsByCollateral]);

  // State for selected Euler vault
  const [selectedEulerVault, setSelectedEulerVault] = useState<string | null>(null);

  // Auto-select first Euler vault when available
  useEffect(() => {
    if (!isEulerSelected || eulerVaultsForSelectedCollateral.length === 0) {
      setSelectedEulerVault(null);
      return;
    }
    // Auto-select best vault (lowest borrow APY - already sorted)
    if (!selectedEulerVault || !eulerVaultsForSelectedCollateral.find(v => v.address === selectedEulerVault)) {
      setSelectedEulerVault(eulerVaultsForSelectedCollateral[0]?.address || null);
    }
  }, [isEulerSelected, eulerVaultsForSelectedCollateral, selectedEulerVault]);

  // Find the appropriate sub-account for Euler refinance
  // This checks if user has an existing position with the same borrow vault
  const { refinanceSubAccount: eulerRefinanceSubAccount, isLoading: isLoadingEulerSubAccount } = useEulerRefinanceSubAccount({
    chainId: chainId || 42161,
    userAddress,
    targetBorrowVault: selectedEulerVault || undefined,
    enabled: isOpen && isEulerSelected && !!selectedEulerVault,
  });

  // Build Euler context map for ALL selected collaterals (each needs its own collateralVault)
  const eulerContextsByCollateral = useMemo((): Record<string, EulerVaultContextForEncoding> => {
    if (!isEulerSelected || !selectedEulerVault) {
      console.log("[Euler Context] Early return - isEulerSelected:", isEulerSelected, "selectedEulerVault:", selectedEulerVault);
      return {};
    }

    // Wait for sub-account query to complete before building contexts
    if (isLoadingEulerSubAccount) {
      console.log("[Euler Context] Waiting for sub-account query to complete...");
      return {};
    }

    // Find the selected borrow vault from any collateral's vault list
    // (all collaterals that support this borrow vault will have it in their list)
    let borrowVault: { address: string; collaterals: Array<{ tokenSymbol: string; vaultAddress: string; tokenAddress: string }> } | undefined;
    for (const vaults of Object.values(eulerVaultsByCollateral)) {
      const found = vaults.find(v => v.address === selectedEulerVault);
      if (found) {
        borrowVault = found;
        break;
      }
    }

    if (!borrowVault) {
      console.log("[Euler Context] Borrow vault not found for address:", selectedEulerVault);
      return {};
    }

    const subAccountIndex = eulerRefinanceSubAccount?.subAccountIndex ?? 0;
    const isExistingPosition = eulerRefinanceSubAccount?.isExistingPosition ?? false;
    const contexts: Record<string, EulerVaultContextForEncoding> = {};

    console.log("[Euler Context] Using subAccountIndex:", subAccountIndex, "isExistingPosition:", isExistingPosition, "refinanceSubAccount:", eulerRefinanceSubAccount);

    // Build context for EACH added collateral
    for (const collateralAddr of Object.keys(addedCollaterals)) {
      const addr = collateralAddr.toLowerCase();
      const userCollateral = collaterals.find(c => addrKey(c.address) === addr);
      if (!userCollateral) {
        console.log("[Euler Context] No collateral found for address:", addr);
        continue;
      }

      // Find the matching collateral vault by underlying token address
      const collateralVault = borrowVault.collaterals.find(c =>
        c.tokenAddress?.toLowerCase() === addr
      );

      if (!collateralVault) {
        console.log("[Euler Context] No matching collateral vault for:", userCollateral.symbol, "addr:", addr);
        continue;
      }

      console.log("[Euler Context] Found match for", userCollateral.symbol, "- collateralVault:", collateralVault.vaultAddress, "tokenAddr:", collateralVault.tokenAddress, "subAccountIndex:", subAccountIndex);
      contexts[addr] = {
        borrowVault: borrowVault.address,
        collateralVault: collateralVault.vaultAddress,
        subAccountIndex,
      };
    }

    console.log("[Euler Context] Built contexts for", Object.keys(contexts).length, "collaterals with subAccountIndex:", subAccountIndex);
    return contexts;
  }, [isEulerSelected, selectedEulerVault, eulerVaultsByCollateral, addedCollaterals, collaterals, eulerRefinanceSubAccount, isLoadingEulerSubAccount]);

  // Single Euler context for validation and borrow (uses first collateral's context)
  const eulerContext = useMemo((): EulerVaultContextForEncoding | undefined => {
    const contexts = Object.values(eulerContextsByCollateral);
    return contexts.length > 0 ? contexts[0] : undefined;
  }, [eulerContextsByCollateral]);

  // Auto pick a destination once, based on support + balances
  useEffect(() => {
    if (!isOpen || autoSelectedDest) {
      return;
    }
    if (!destinationProtocols.length) {
      return;
    }

    const supportedMap = effectiveSupportedMap;
    const hasSupportedNonZero = collaterals.some(c => {
      const supported = supportedMap?.[addrKey(c.address)];
      return supported && c.balance > 0;
    });

    if (hasSupportedNonZero) {
      setAutoSelectedDest(true);
      return;
    }
    const alt = destinationProtocols.find(protocol => protocol.name !== selectedProtocol);
    if (alt && alt.name !== selectedProtocol) {
      setSelectedProtocol(alt.name);
    }
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
  const { createMoveBuilder, executeFlowBatchedIfPossible, canDoAtomicBatch, simulateInstructions } = useKapanRouterV2();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const next = Boolean(canDoAtomicBatch);
    setPreferBatching(prev => (prev === next ? prev : next));
  }, [isOpen, canDoAtomicBatch, setPreferBatching]);

  const [revokePermissions, setRevokePermissions] = useState(false);

  // Check for active conditional orders (ADL) - don't revoke permissions if active
  const { hasActiveOrders: hasActiveADLOrders } = useHasActiveConditionalOrders();

  // Auto-enable revoke permissions when batching is enabled (unless ADL is active)
  useEffect(() => {
    if (preferBatching && !hasActiveADLOrders) {
      setRevokePermissions(true);
    } else if (hasActiveADLOrders) {
      setRevokePermissions(false); // Force disable if ADL is active
    }
  }, [preferBatching, hasActiveADLOrders]);

  // Compute effective revoke permissions (disabled if ADL orders exist)
  const effectiveRevokePermissions = revokePermissions && !hasActiveADLOrders;

  const debtInputRef = useRef<HTMLInputElement>(null);

  // Initialize preselected collaterals using shared hook
  usePreselectedCollateralsEffect({
    isOpen,
    preSelectedCollaterals,
    collaterals,
    expandedCollateral,
    setExpandedCollateral,
    setTempAmount,
  });

  // Maintain stable protocol selection using shared hook
  useStableProtocolSelection({
    isOpen,
    filteredDestinationProtocols,
    selectedProtocol,
    setSelectedProtocol,
  });



  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const isVesu = selectedProtocol === "Vesu" || selectedProtocol === "VesuV2";
    if (!isVesu || !evmVesuPools) {
      return;
    }

    if (selectedVersion === "v1") {
      const first = evmVesuPools.v1Pools[0]?.name || "";
      if (first && selectedPool !== first) {
        setSelectedPool(first);
      }
    } else {
      const first = evmVesuPools.v2Pools[0]?.name || "";
      if (first && selectedPool !== first) {
        setSelectedPool(first);
      }
    }
  }, [isOpen, selectedProtocol, selectedVersion, evmVesuPools, selectedPool]);

  // Auto-focus debt input using shared hook
  useDebtInputFocus({ isOpen, debtConfirmed, debtInputRef });

  useEffect(() => {
    resetState();
  }, [isOpen, resetState]);

  /* ------------------------ Price-based calculations -------------------- */
  const debtPrice8 = mergedPrices[addrKey(position.tokenAddress)] ?? 0n;

  const debtUsd = useMemo(() => {
    if (!debtConfirmed) {
      return 0;
    }
    const parsed = Number.parseFloat(debtAmount || "0");
    if (Number.isNaN(parsed) || parsed <= 0) {
      return 0;
    }
    return toUsdFromP8(parsed, debtPrice8);
  }, [debtAmount, debtConfirmed, debtPrice8]);

  const getUsdValue = useCallback(
    (address: string, humanAmount: string): number => {
      const p8 = price8(address, mergedPrices);
      if (!p8 || p8 === 0n) {
        return 0;
      }
      const amt = Number.parseFloat(humanAmount || "0");
      if (Number.isNaN(amt) || amt <= 0) {
        return 0;
      }
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
    if (!totalCollateralUsd) {
      return "0.0";
    }
    return ((debtUsd / totalCollateralUsd) * 100).toFixed(1);
  }, [debtUsd, totalCollateralUsd]);

  const HF_SAFE = 2;
  const HF_RISK = 1.5;
  const HF_DANGER = 1.1;

  interface CollateralForHF extends CollateralWithLt {
    address?: string;
    token?: string;
    rawBalance?: bigint;
    decimals?: number;
  }

  const computeHF = useCallback(
    (
      all: CollateralForHF[],
      moved: { address?: string; amount: bigint; decimals: number }[],
      tokenPrices: PriceMap,
      totalDebtUsd: number
    ): number => {
      const movedByAddr = new Map<string, bigint>();
      for (const m of moved) {
        const key = addrKey(m.address || "");
        if (!key) {
          continue;
        }
        movedByAddr.set(key, (movedByAddr.get(key) ?? 0n) + (m.amount ?? 0n));
      }

      let weightedCollUsd = 0;

      for (const c of all) {
        const key = addrKey(c.address || c.token || "");
        if (!key) {
          continue;
        }

        const rawBal: bigint = c.rawBalance ?? 0n;
        const decs: number = c.decimals ?? 18;
        const lt = getLtBps(c) / 1e4;
        if (lt <= 0) {
          continue;
        }

        const movedAmt = movedByAddr.get(key) ?? 0n;
        const remaining = rawBal - movedAmt;
        if (remaining <= 0n) {
          continue;
        }

        const p8 = price8(key, tokenPrices);
        if (p8 === 0n) {
          continue;
        }

        const usd = toUsdRaw(remaining, decs, p8);
        weightedCollUsd += usd * lt;
      }

      if (!Number.isFinite(totalDebtUsd) || totalDebtUsd <= 0) {
        return 999;
      }
      return weightedCollUsd / totalDebtUsd;
    },
    []
  );

  const movedList = useMemo(() => {
    const out: { address: string; amount: bigint; decimals: number }[] = [];
    for (const [addr, amt] of Object.entries(addedCollaterals)) {
      const col = collaterals.find(c => addrKey(c.address) === addrKey(addr));
      if (!col) {
        continue;
      }
      out.push({
        address: addrKey(addr),
        amount: parseUnits(amt || "0", col.decimals),
        decimals: col.decimals,
      });
    }
    return out;
  }, [addedCollaterals, collaterals]);

  const refiHF = useMemo(
    () => computeHF(collaterals as CollateralForHF[], movedList, mergedPrices, debtUsd),
    [collaterals, movedList, mergedPrices, debtUsd, computeHF]
  );

  const hfTone = (hf: number) => {
    if (hf >= HF_SAFE) {
      return { tone: "text-success", badge: "badge-success" };
    }
    if (hf >= HF_RISK) {
      return { tone: "text-warning", badge: "badge-warning" };
    }
    if (hf >= HF_DANGER) {
      return { tone: "text-error", badge: "badge-error" };
    }
    return { tone: "text-error", badge: "badge-error" };
  };
  const hfColor = hfTone(refiHF);

  /* ------------------------------ Address-based price fetching ------------------------------- */
  // Collect all token addresses (debt + collaterals) for batch price fetching
  const allPriceAddresses = useMemo(() => {
    if (!isOpen) return [];
    const addrs = new Set<string>();
    const debtAddr = addrKey(position.tokenAddress);
    if (debtAddr) addrs.add(debtAddr);
    for (const c of collaterals) {
      const a = addrKey(c.address);
      if (a) addrs.add(a);
    }
    return Array.from(addrs);
  }, [isOpen, position.tokenAddress, collaterals]);

  const { prices: cgPrices } = useTokenPricesByAddress(
    chainId || 1,
    allPriceAddresses,
    { enabled: allPriceAddresses.length > 0 },
  );

  // Merge CoinGecko address-based prices into mergedPrices (fills gaps not covered by seedPrices)
  useEffect(() => {
    if (!isOpen || !cgPrices || Object.keys(cgPrices).length === 0) return;
    setMergedPrices(prev => {
      let changed = false;
      let next = prev;
      for (const [addr, usdPrice] of Object.entries(cgPrices)) {
        const key = addr.toLowerCase();
        const p8 = priceToRaw(usdPrice);
        if (p8 > 0n && prev[key] !== p8) {
          if (!changed) { next = { ...prev }; changed = true; }
          next[key] = p8;
        }
      }
      return changed ? next : prev;
    });
  }, [isOpen, cgPrices]);

  /* --------------------------- Action Handlers --------------------------- */
  const isActionDisabled = useMemo(() => {
    if (!debtConfirmed || !selectedProtocol) {
      console.log("[isActionDisabled] debtConfirmed:", debtConfirmed, "selectedProtocol:", selectedProtocol);
      return true;
    }
    if (Object.keys(addedCollaterals).length === 0) {
      console.log("[isActionDisabled] No collaterals added");
      return true;
    }

    // For Morpho, must have a market selected
    if (isMorphoSelected && !selectedMorphoMarket) {
      console.log("[isActionDisabled] Morpho selected but no market");
      return true;
    }

    // For Euler, must have a vault selected with valid context
    if (isEulerSelected && !eulerContext) {
      console.log("[isActionDisabled] Euler selected but no context. selectedEulerVault:", selectedEulerVault, "eulerContextsByCollateral:", eulerContextsByCollateral);
      return true;
    }

    // Check collateral support based on protocol
    const supportMap = isMorphoSelected
      ? morphoSupportedCollaterals
      : isEulerSelected
        ? eulerSupportedCollaterals
        : effectiveSupportedMap;
    if (Object.keys(addedCollaterals).some(addr => supportMap?.[addrKey(addr)] === false)) {
      console.log("[isActionDisabled] Unsupported collateral found. addedCollaterals:", Object.keys(addedCollaterals), "supportMap:", supportMap);
      return true;
    }

    return false;
  }, [debtConfirmed, selectedProtocol, addedCollaterals, isMorphoSelected, selectedMorphoMarket, morphoSupportedCollaterals, isEulerSelected, eulerContext, eulerSupportedCollaterals, effectiveSupportedMap, selectedEulerVault, eulerContextsByCollateral]);

  const handleExecuteMove = useCallback(async () => {
    if (!debtConfirmed || !selectedProtocol) {
      return;
    }

    let batchingUsed = false;
    const baseProps = buildBaseTrackingProps({
      fromProtocol, toProtocol: selectedProtocol, position,
      preferBatching: Boolean(preferBatching), chainId,
    });
    const optionalFields = { selectedProvider, selectedPool };

    try {
      setIsSubmitting(true);
      track("refinance_tx_begin", { ...baseProps });

      const builder = createMoveBuilder();
      const providerVersion = resolveProviderVersion(selectedProvider || "");
      const normalizedTo = normalizeProtocolName(selectedProtocol);
      const normalizedFrom = normalizeProtocolName(fromProtocol);

      if (normalizedTo === "compound" || normalizedFrom === "compound") {
        builder.setCompoundMarket(position.tokenAddress as Address);
      }

      // Detect source protocol type for context handling
      const isFromMorpho = matchesProtocol(normalizedFrom, fromProtocol, "morphoblue") || matchesProtocol(normalizedFrom, fromProtocol, "morpho");
      const isFromEuler = matchesProtocol(normalizedFrom, fromProtocol, "euler");
      const defaultSourceContext = computeDefaultSourceContext(isFromMorpho, isFromEuler, fromContext);

      // Build per-collateral source contexts for Euler (each collateral has its own vault)
      const eulerSourceContextsMap = isFromEuler
        ? buildEulerSourceContexts(preSelectedCollaterals, fromContext)
        : {};

      builder.buildUnlockDebt({
        fromProtocol,
        debtToken: position.tokenAddress as Address,
        expectedDebt: debtAmount,
        debtDecimals: position.decimals,
        fromContext: defaultSourceContext,
        flash: { version: providerVersion, premiumBps: 9, bufferBps: 10 },
      });

      // Prepare Morpho context if destination is Morpho Blue
      const morphoEncodedContext: `0x${string}` | undefined = isMorphoSelected && morphoContext
        ? encodeMorphoContext(morphoContext as MorphoMarketContextForEncoding) as `0x${string}`
        : undefined;

      // Debug logging for Euler context
      if (isEulerSelected) {
        console.log("[Euler Debug] isEulerSelected:", isEulerSelected);
        console.log("[Euler Debug] eulerContextsByCollateral:", eulerContextsByCollateral);
        console.log("[Euler Debug] selectedEulerVault:", selectedEulerVault);
      }

      // Build collateral move instructions using extracted context helpers
      Object.entries(addedCollaterals).forEach(([addr, amt]) => {
        const meta = collaterals.find(c => addrKey(c.address) === addrKey(addr));
        if (!meta) return;
        const isMax = collateralIsMaxMap[addr] === true;
        const toContext = resolveDestContext(addr, isEulerSelected, eulerContextsByCollateral, morphoEncodedContext, meta.symbol);
        const fromCtx = resolveSourceCtx(addr, isFromEuler, eulerSourceContextsMap, defaultSourceContext, meta.symbol);

        builder.buildMoveCollateral({
          fromProtocol,
          toProtocol: selectedProtocol,
          collateralToken: addr as Address,
          withdraw: isMax ? { max: true } : { amount: amt },
          collateralDecimals: meta.decimals,
          fromContext: fromCtx,
          toContext,
        });
      });

      const borrowContext = resolveBorrowContext(isEulerSelected, eulerContext, morphoEncodedContext);
      builder.buildBorrow({
        mode: "coverFlash",
        toProtocol: selectedProtocol,
        token: position.tokenAddress as Address,
        decimals: position.decimals,
        extraBps: 5,
        approveToRouter: true,
        toContext: borrowContext,
      });

      const flow = builder.build();

      // Debug: log the built instructions
      console.log("[Euler Debug] Built flow instructions:", flow.length);
      flow.forEach((inst, i) => {
        console.log(`[Euler Debug] Instruction ${i}:`, inst.protocolName, inst.data?.slice(0, 66) + "...");
      });

      await preSimulateFlow(flow, simulateInstructions);
      batchingUsed = await executeFlowWithFallback(flow, preferBatching, effectiveRevokePermissions, executeFlowBatchedIfPossible as any);

      const successProps = { ...baseProps, batchingUsed, status: "success" };
      appendOptionalTrackingFields(successProps, optionalFields);
      track("refinance_tx_complete", successProps);
    } catch (error) {
      console.error("Refinance flow error:", error);
      const errorProps = {
        ...baseProps, batchingUsed, status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      appendOptionalTrackingFields(errorProps, optionalFields);
      track("refinance_tx_complete", errorProps);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    debtConfirmed,
    selectedProtocol,
    fromProtocol,
    position,
    preferBatching,
    chainId,
    isMorphoSelected,
    selectedMorphoMarket,
    isEulerSelected,
    eulerContext,
    eulerContextsByCollateral,
    debtAmountBigInt,
    addedCollaterals,
    collaterals,
    selectedProvider,
    selectedPool,
    onClose,
    createMoveBuilder,
    hookSelectedProvider,
    simulateInstructions,
    executeFlowBatchedIfPossible,
  ]);

  // Determine source pool name
  // For EVM, we don't need to exclude source pool by name
  const sourcePoolName = useMemo(() => null, []);

  const handleDebtAmountChange = useCallback((value: string) => {
    setDebtAmount(value);
    setIsDebtMaxClicked(false);
  }, []);

  return (
    <RefinanceModalContent
      isOpen={isOpen}
      onClose={onClose}
      debtSymbol={debtSymbol}
      debtIcon={debtIcon}
      debtAmount={debtAmount}
      setDebtAmount={handleDebtAmountChange}
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
      isLoadingCollaterals={isLoadingCollaterals || (isMorphoSelected ? isLoadingMorphoMarkets : isEulerSelected ? isLoadingEulerVaults : isSupportLoading)}
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
      hasActiveADLOrders={hasActiveADLOrders}
      apiProbes={null}
      // Morpho-specific props
      isMorphoSelected={isMorphoSelected}
      morphoMarkets={morphoMarketsForSelectedCollateral}
      selectedMorphoMarket={selectedMorphoMarket}
      onMorphoMarketSelect={onMorphoMarketSelect}
      morphoSupportedCollaterals={morphoSupportedCollaterals}
      isLoadingMorphoMarkets={isLoadingMorphoMarkets || isLoadingEulerVaults}
      chainId={chainId}
      // Euler-specific props
      isEulerSelected={isEulerSelected}
      eulerSupportedCollaterals={eulerSupportedCollaterals}
      eulerSubAccountIndex={eulerRefinanceSubAccount?.subAccountIndex}
      isNewEulerSubAccount={eulerRefinanceSubAccount?.isExistingPosition === false}
    />
  );
};
