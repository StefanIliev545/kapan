import { useState, useCallback, useEffect } from "react";
import type { MorphoMarket, MorphoMarketContext } from "./useMorphoLendingPositions";

const addrKey = (a?: string) => (a ?? "").toLowerCase();

export const useMovePositionState = (isOpen: boolean) => {
  const [debtAmount, setDebtAmount] = useState<string>("");
  const [isDebtMaxClicked, setIsDebtMaxClicked] = useState<boolean>(false);
  const [debtConfirmed, setDebtConfirmed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"protocol" | "flashloan">("protocol");
  const [selectedProtocol, setSelectedProtocol] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(undefined);
  const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2">("v1");
  const [expandedCollateral, setExpandedCollateral] = useState<string | null>(null);
  const [tempAmount, setTempAmount] = useState<string>("");
  const [tempIsMax, setTempIsMaxState] = useState<boolean>(false);
  const [addedCollaterals, setAddedCollaterals] = useState<Record<string, string>>({});
  const [collateralIsMaxMap, setCollateralIsMaxMap] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [preferBatching, setPreferBatching] = useState<boolean>(false);
  const [autoSelectedDest, setAutoSelectedDest] = useState<boolean>(false);

  // Morpho-specific state
  const [selectedMorphoMarket, setSelectedMorphoMarket] = useState<MorphoMarket | null>(null);
  const [morphoContext, setMorphoContext] = useState<MorphoMarketContext | null>(null);

  // Reset Morpho selection when protocol changes away from Morpho
  useEffect(() => {
    if (selectedProtocol !== "Morpho Blue") {
      setSelectedMorphoMarket(null);
      setMorphoContext(null);
    }
  }, [selectedProtocol]);

  // Reset Morpho selection when collaterals change (user deselected/changed collateral)
  useEffect(() => {
    if (selectedProtocol === "Morpho Blue" && selectedMorphoMarket) {
      // Check if the selected market's collateral is still in addedCollaterals
      const marketCollateral = selectedMorphoMarket.collateralAsset?.address?.toLowerCase();
      const addedKeys = Object.keys(addedCollaterals).map(k => k.toLowerCase());
      if (marketCollateral && !addedKeys.includes(marketCollateral)) {
        setSelectedMorphoMarket(null);
        setMorphoContext(null);
      }
    }
  }, [selectedProtocol, selectedMorphoMarket, addedCollaterals]);

  // Reset all state when modal closes
  const resetState = useCallback(() => {
    if (isOpen) return;
    setDebtAmount("");
    setIsDebtMaxClicked(false);
    setDebtConfirmed(false);
    setActiveTab("protocol");
    setExpandedCollateral(null);
    setTempAmount("");
    setTempIsMaxState(false);
    setAddedCollaterals({});
    setCollateralIsMaxMap({});
    setAutoSelectedDest(false);
    setIsSubmitting(false);
    // Reset Morpho state
    setSelectedMorphoMarket(null);
    setMorphoContext(null);
  }, [isOpen]);

  // Handler for Morpho market selection
  const onMorphoMarketSelect = useCallback((market: MorphoMarket, context: MorphoMarketContext) => {
    setSelectedMorphoMarket(market);
    setMorphoContext(context);
  }, []);

  return {
    // State
    debtAmount,
    setDebtAmount,
    isDebtMaxClicked,
    setIsDebtMaxClicked,
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
    tempIsMax,
    setTempIsMax: useCallback((value: boolean) => {
      setTempIsMaxState(value);
      if (expandedCollateral) {
        setCollateralIsMaxMap(prev =>
          prev[expandedCollateral] === value ? prev : { ...prev, [expandedCollateral]: value },
        );
      }
    }, [expandedCollateral]),
    addedCollaterals,
    setAddedCollaterals,
    collateralIsMaxMap,
    setCollateralIsMaxMap,
    isSubmitting,
    setIsSubmitting,
    preferBatching,
    setPreferBatching,
    autoSelectedDest,
    setAutoSelectedDest,

    // Morpho-specific state
    selectedMorphoMarket,
    setSelectedMorphoMarket,
    morphoContext,
    setMorphoContext,
    onMorphoMarketSelect,

    // Actions
    resetState,

    // Helper functions
    onCollateralTileClick: useCallback((address: string) => {
      const key = addrKey(address);
      setExpandedCollateral(prev => (prev === key ? null : key));
      setTempAmount("");
      setTempIsMaxState(false);
    }, []),

    onAddCollateral: useCallback((address: string, balance: number) => {
      const key = addrKey(address);
      const trimmed = (tempAmount || "").trim();
      const numeric = Number(trimmed);
      if (!trimmed || !Number.isFinite(numeric) || numeric <= 0) return;

      const epsilon = Math.max(1e-12, Math.abs(balance) * 1e-9);
      const autoMax = Math.abs(numeric - balance) <= epsilon;

      setAddedCollaterals(prev => (prev[key] === trimmed ? prev : { ...prev, [key]: trimmed }));
      const nextIsMax = tempIsMax || autoMax;
      setCollateralIsMaxMap(prev => (prev[key] === nextIsMax ? prev : { ...prev, [key]: nextIsMax }));
      setExpandedCollateral(null);
      setTempAmount("");
      setTempIsMaxState(false);
    }, [tempAmount, tempIsMax]),

    onRemoveCollateral: useCallback((address: string) => {
      const key = addrKey(address);
      setAddedCollaterals(prev => {
        const newCollaterals = { ...prev };
        delete newCollaterals[key];
        return newCollaterals;
      });
      setCollateralIsMaxMap(prev => {
        const newMap = { ...prev };
        delete newMap[key];
        return newMap;
      });
    }, []),
  };
};

