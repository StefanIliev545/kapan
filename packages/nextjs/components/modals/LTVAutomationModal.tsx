/**
 * LTVAutomationModal - Unified LTV automation for both deleverage and leverage
 */

import { FC, useState, useMemo, useCallback, useEffect } from "react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import {
  ShieldCheckIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import { BaseModal } from "./BaseModal";
import { SwapAsset } from "./SwapModalShell";
import { ButtonLoading } from "../common/Loading";
import { useADLOrder, useADLContracts } from "~~/hooks/useADLOrder";
import { useAutoLeverageOrder, useAutoLeverageContracts } from "~~/hooks/useAutoLeverageOrder";
import {
  validateADLParams,
  validateAutoLeverageParams,
  formatLtvPercent,
  encodeProtocolContext,
  calculateADLFlashLoanAmount,
  calculateAutoLeverageFlashLoanAmount,
  usdToTokenAmount,
  MorphoMarketContextForEncoding,
} from "./adlAutomationHelpers";

// ============ Types ============

export interface LTVAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  currentLtvBps: number;
  liquidationLtvBps: number;
  collateralTokens: SwapAsset[];
  debtToken: {
    address: string;
    symbol: string;
    decimals: number;
    /** Raw balance in token units (for price calculation) */
    balance?: bigint;
  };
  totalCollateralUsd?: bigint;
  totalDebtUsd?: bigint;
  morphoContext?: MorphoMarketContextForEncoding;
  eulerBorrowVault?: string;
  eulerCollateralVaults?: string[];
  eulerSubAccountIndex?: number;
  compoundMarket?: string;
}

// ============ LTV Input ============

interface LtvInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  colorClass?: string; // border color class like "border-warning"
}

const LtvInput: FC<LtvInputProps> = ({ label, value, min, max, onChange, colorClass }) => {
  const effectiveMin = Math.min(min, max);
  const effectiveMax = Math.max(min, max);

  const [inputValue, setInputValue] = useState((value / 100).toFixed(1));

  useEffect(() => {
    setInputValue((value / 100).toFixed(1));
  }, [value]);

  const handleBlur = () => {
    const v = parseFloat(inputValue);
    if (!isNaN(v)) {
      const bps = Math.max(effectiveMin, Math.min(effectiveMax, Math.round(v * 100)));
      onChange(bps);
      setInputValue((bps / 100).toFixed(1));
    } else {
      setInputValue((value / 100).toFixed(1));
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span className={`text-base-content/60 text-sm ${colorClass ? `border-l-2 pl-1.5 ${colorClass}` : ""}`}>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="input input-sm input-bordered w-20 text-right font-medium"
        />
        <span className="text-base-content/50 text-sm">%</span>
      </div>
    </div>
  );
};

// ============ Main Component ============

export const LTVAutomationModal: FC<LTVAutomationModalProps> = ({
  isOpen,
  onClose,
  protocolName,
  chainId,
  currentLtvBps,
  liquidationLtvBps,
  collateralTokens,
  debtToken,
  totalCollateralUsd,
  totalDebtUsd,
  morphoContext,
  eulerBorrowVault,
  eulerCollateralVaults,
  eulerSubAccountIndex,
  compoundMarket,
}) => {
  const { address: userAddress } = useAccount();
  const { isSupported: isADLSupported, isLoading: isLoadingADL } = useADLContracts(chainId);
  const { isSupported: isAutoLevSupported, isLoading: isLoadingAutoLev } = useAutoLeverageContracts(chainId);

  const [enableADL, setEnableADL] = useState(true);
  const [enableAutoLeverage, setEnableAutoLeverage] = useState(false);

  const [adlTriggerLtvBps, setAdlTriggerLtvBps] = useState(() => {
    const suggested = Math.min(currentLtvBps + 500, liquidationLtvBps - 500);
    return Math.max(suggested, currentLtvBps + 100);
  });
  const [adlTargetLtvBps, setAdlTargetLtvBps] = useState(() => Math.max(adlTriggerLtvBps - 1000, 1000));

  const [autoLevTriggerLtvBps, setAutoLevTriggerLtvBps] = useState(() => Math.max(currentLtvBps - 1000, 500));
  const [autoLevTargetLtvBps, setAutoLevTargetLtvBps] = useState(() => Math.min(currentLtvBps, liquidationLtvBps - 300));

  const [selectedCollateralAddress, setSelectedCollateralAddress] = useState<string>(() =>
    collateralTokens.length > 0 ? collateralTokens[0].address : "",
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxSlippageBps, setMaxSlippageBps] = useState(100);
  const [numChunks, setNumChunks] = useState(1);
  const [maxIterations, setMaxIterations] = useState(10);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Only reset values when modal first opens, not on every LTV update
  useEffect(() => {
    if (isOpen && !hasInitialized) {
      const suggestedADLTrigger = Math.min(currentLtvBps + 500, liquidationLtvBps - 500);
      setAdlTriggerLtvBps(Math.max(suggestedADLTrigger, currentLtvBps + 100));
      setAdlTargetLtvBps(Math.max(suggestedADLTrigger - 1000, 1000));
      setAutoLevTriggerLtvBps(Math.max(currentLtvBps - 1000, 500));
      setAutoLevTargetLtvBps(Math.min(currentLtvBps, liquidationLtvBps - 300));
      if (collateralTokens.length > 0) {
        setSelectedCollateralAddress(collateralTokens[0].address);
      }
      setHasInitialized(true);
    } else if (!isOpen && hasInitialized) {
      setHasInitialized(false);
    }
  }, [isOpen, hasInitialized, currentLtvBps, liquidationLtvBps, collateralTokens]);

  const selectedCollateral = useMemo(
    () => collateralTokens.find(c => c.address.toLowerCase() === selectedCollateralAddress.toLowerCase()),
    [collateralTokens, selectedCollateralAddress],
  );

  const protocolContext = useMemo(() => {
    try {
      return encodeProtocolContext(protocolName, {
        morphoContext,
        eulerContext: eulerBorrowVault
          ? { borrowVault: eulerBorrowVault, collateralVault: eulerCollateralVaults || [], subAccountIndex: eulerSubAccountIndex }
          : undefined,
        compoundMarket,
      });
    } catch {
      return "0x";
    }
  }, [protocolName, morphoContext, eulerBorrowVault, eulerCollateralVaults, eulerSubAccountIndex, compoundMarket]);

  const adlValidation = useMemo(
    () => validateADLParams({
      currentLtvBps, liquidationLtvBps, triggerLtvBps: adlTriggerLtvBps, targetLtvBps: adlTargetLtvBps,
      maxSlippageBps, numChunks, maxIterations, collateralToken: selectedCollateralAddress,
    }),
    [currentLtvBps, liquidationLtvBps, adlTriggerLtvBps, adlTargetLtvBps, maxSlippageBps, numChunks, maxIterations, selectedCollateralAddress],
  );

  const autoLevValidation = useMemo(
    () => validateAutoLeverageParams({
      currentLtvBps, liquidationLtvBps, triggerLtvBps: autoLevTriggerLtvBps, targetLtvBps: autoLevTargetLtvBps,
      maxSlippageBps, numChunks, maxIterations, collateralToken: selectedCollateralAddress,
    }),
    [currentLtvBps, liquidationLtvBps, autoLevTriggerLtvBps, autoLevTargetLtvBps, maxSlippageBps, numChunks, maxIterations, selectedCollateralAddress],
  );

  const adlFlashLoanConfig = useMemo(() => {
    if (!selectedCollateral || !totalCollateralUsd || !totalDebtUsd) return null;
    const perChunkFlashLoanUsd = calculateADLFlashLoanAmount(totalCollateralUsd, totalDebtUsd, adlTriggerLtvBps, adlTargetLtvBps, numChunks);
    if (perChunkFlashLoanUsd === 0n) return null;
    const collateralPrice = selectedCollateral.usdValue && selectedCollateral.balance > 0
      ? BigInt(Math.round((selectedCollateral.usdValue / selectedCollateral.balance) * 1e8)) : 0n;
    if (collateralPrice === 0n) return null;
    const perChunkFlashLoanAmount = usdToTokenAmount(perChunkFlashLoanUsd, collateralPrice, selectedCollateral.decimals);
    const debtPrice = totalDebtUsd > 0n && totalCollateralUsd > 0n ? (totalDebtUsd * BigInt(1e8)) / totalCollateralUsd : BigInt(1e8);
    const perChunkBuyAmount = usdToTokenAmount(perChunkFlashLoanUsd, debtPrice, debtToken.decimals);
    return { amount: perChunkFlashLoanAmount, perChunkBuyAmount, userCollateralBalance: selectedCollateral.rawBalance };
  }, [selectedCollateral, totalCollateralUsd, totalDebtUsd, adlTriggerLtvBps, adlTargetLtvBps, numChunks, debtToken.decimals]);

  const autoLevFlashLoanConfig = useMemo(() => {
    // For auto-leverage, we only need collateral (user might have 0 debt, wanting to leverage up)
    if (!selectedCollateral || !totalCollateralUsd) return null;
    // Pass 0n for debt if undefined - auto-leverage can start from 0% LTV
    const effectiveDebtUsd = totalDebtUsd ?? 0n;
    const perChunkFlashLoanUsd = calculateAutoLeverageFlashLoanAmount(totalCollateralUsd, effectiveDebtUsd, autoLevTriggerLtvBps, autoLevTargetLtvBps, numChunks, 2000);
    if (perChunkFlashLoanUsd === 0n) return null;

    // For auto-leverage, we flash loan DEBT tokens (not collateral!)
    // Calculate debt token price from totalDebtUsd and balance if available
    let debtTokenPrice: bigint;
    if (debtToken.balance && debtToken.balance > 0n && totalDebtUsd && totalDebtUsd > 0n) {
      // Price = totalDebtUsd / balance, scaled to 8 decimals
      // totalDebtUsd is in 8 decimals, balance is in token decimals
      // price = (totalDebtUsd * 10^tokenDecimals) / balance gives price in 8 decimals
      debtTokenPrice = (totalDebtUsd * BigInt(10 ** debtToken.decimals)) / debtToken.balance;
    } else {
      // Fallback for stablecoins or when balance not available
      const STABLECOIN_PRICE = BigInt(1e8); // $1.00 in 8 decimals
      debtTokenPrice = STABLECOIN_PRICE;
      console.warn("[AutoLeverage] Using stablecoin fallback price - pass debtToken.balance for accurate pricing");
    }

    // Flash loan amount in DEBT token units (not collateral!)
    const perChunkFlashLoanAmount = usdToTokenAmount(perChunkFlashLoanUsd, debtTokenPrice, debtToken.decimals);

    // Sell amount should match flash loan (we sell what we flash loaned)
    // perChunkSellAmount is used as a reference but the trigger calculates actual sell amount
    const perChunkSellAmount = perChunkFlashLoanAmount;

    console.log("[AutoLeverage] Flash loan config:", {
      perChunkFlashLoanUsd: perChunkFlashLoanUsd.toString(),
      debtTokenPrice: debtTokenPrice.toString(),
      perChunkFlashLoanAmount: perChunkFlashLoanAmount.toString(),
      debtTokenBalance: debtToken.balance?.toString(),
    });

    return { amount: perChunkFlashLoanAmount, perChunkSellAmount };
  }, [selectedCollateral, totalCollateralUsd, totalDebtUsd, autoLevTriggerLtvBps, autoLevTargetLtvBps, numChunks, debtToken.decimals, debtToken.balance]);

  const { createOrder: createADLOrder, isLoading: isCreatingADL } = useADLOrder({
    protocolName, chainId,
    triggerParams: {
      protocolName, protocolContext, triggerLtvBps: adlTriggerLtvBps, targetLtvBps: adlTargetLtvBps,
      collateralToken: selectedCollateralAddress, debtToken: debtToken.address,
      collateralDecimals: selectedCollateral?.decimals || 18, debtDecimals: debtToken.decimals,
      maxSlippageBps, numChunks,
    },
    maxIterations, userAddress: userAddress as Address,
    flashLoanConfig: adlFlashLoanConfig || { amount: 0n, perChunkBuyAmount: 0n, userCollateralBalance: 0n },
  });

  const { createOrder: createAutoLeverageOrder, isLoading: isCreatingAutoLev } = useAutoLeverageOrder({
    protocolName, chainId,
    triggerParams: {
      protocolName, protocolContext, triggerLtvBps: autoLevTriggerLtvBps, targetLtvBps: autoLevTargetLtvBps,
      collateralToken: selectedCollateralAddress, debtToken: debtToken.address,
      collateralDecimals: selectedCollateral?.decimals || 18, debtDecimals: debtToken.decimals,
      maxSlippageBps, numChunks,
    },
    maxIterations, userAddress: userAddress as Address,
    flashLoanConfig: autoLevFlashLoanConfig || { amount: 0n, perChunkSellAmount: 0n },
  });

  const handleCreate = useCallback(async () => {
    let adlSuccess = true, autoLevSuccess = true;
    if (enableADL) adlSuccess = (await createADLOrder()) !== null;
    if (enableAutoLeverage && adlSuccess) autoLevSuccess = (await createAutoLeverageOrder()) !== null;
    if (adlSuccess && autoLevSuccess) onClose();
  }, [enableADL, enableAutoLeverage, createADLOrder, createAutoLeverageOrder, onClose]);

  // LTV bar percentages
  const ltvBarWidth = useMemo(() => {
    const maxLtv = liquidationLtvBps + 500;
    return {
      current: (currentLtvBps / maxLtv) * 100,
      adlTrigger: (adlTriggerLtvBps / maxLtv) * 100,
      adlTarget: (adlTargetLtvBps / maxLtv) * 100,
      autoLevTrigger: (autoLevTriggerLtvBps / maxLtv) * 100,
      autoLevTarget: (autoLevTargetLtvBps / maxLtv) * 100,
      liquidation: (liquidationLtvBps / maxLtv) * 100,
    };
  }, [currentLtvBps, adlTriggerLtvBps, adlTargetLtvBps, autoLevTriggerLtvBps, autoLevTargetLtvBps, liquidationLtvBps]);

  const hasValidADLFlashLoan = adlFlashLoanConfig !== null && adlFlashLoanConfig.amount > 0n;
  const hasValidAutoLevFlashLoan = autoLevFlashLoanConfig !== null && autoLevFlashLoanConfig.amount > 0n;
  const canSubmitADL = enableADL && adlValidation.isValid && isADLSupported && hasValidADLFlashLoan;
  const canSubmitAutoLev = enableAutoLeverage && autoLevValidation.isValid && isAutoLevSupported && hasValidAutoLevFlashLoan;
  const canSubmit = !!userAddress && !isCreatingADL && !isCreatingAutoLev &&
    (enableADL || enableAutoLeverage) && (!enableADL || canSubmitADL) && (!enableAutoLeverage || canSubmitAutoLev);
  const isCreating = isCreatingADL || isCreatingAutoLev;
  const isLoading = isLoadingADL || isLoadingAutoLev;

  const allErrors = useMemo(() => {
    const errors: string[] = [];
    if (enableADL && !adlValidation.isValid) errors.push(...adlValidation.errors);
    if (enableAutoLeverage && !autoLevValidation.isValid) errors.push(...autoLevValidation.errors);
    return errors;
  }, [enableADL, enableAutoLeverage, adlValidation, autoLevValidation]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="LTV Automation" maxWidthClass="max-w-md">
      <div className="space-y-4">
        {/* Info text */}
        <p className="text-base-content/60 text-sm">
          Automatically adjust leverage when LTV moves outside your target range.
        </p>

        {/* Current stats inline */}
        <div className="flex items-center justify-between text-sm">
          <span>Current: <strong>{formatLtvPercent(currentLtvBps)}</strong></span>
          <span>Liquidation: <strong className="text-error">{formatLtvPercent(liquidationLtvBps)}</strong></span>
        </div>

        {/* Visual LTV bar */}
        <div className="bg-base-200 relative h-3 rounded overflow-hidden">
          {enableAutoLeverage && (
            <div className="bg-info/30 absolute left-0 top-0 h-full" style={{ width: `${ltvBarWidth.autoLevTrigger}%` }} />
          )}
          <div
            className="bg-success/30 absolute top-0 h-full"
            style={{
              left: `${enableAutoLeverage ? ltvBarWidth.autoLevTarget : 0}%`,
              width: `${(enableADL ? ltvBarWidth.adlTarget : ltvBarWidth.liquidation) - (enableAutoLeverage ? ltvBarWidth.autoLevTarget : 0)}%`
            }}
          />
          {enableADL && (
            <>
              <div className="bg-warning/30 absolute top-0 h-full" style={{ left: `${ltvBarWidth.adlTarget}%`, width: `${ltvBarWidth.adlTrigger - ltvBarWidth.adlTarget}%` }} />
              <div className="bg-error/30 absolute top-0 h-full" style={{ left: `${ltvBarWidth.adlTrigger}%`, width: `${ltvBarWidth.liquidation - ltvBarWidth.adlTrigger}%` }} />
            </>
          )}
          {/* Current marker */}
          <div className="bg-base-content absolute top-0 h-full w-1 z-10" style={{ left: `${ltvBarWidth.current}%` }} />
          {/* ADL markers */}
          {enableADL && (
            <>
              <div className="bg-warning absolute top-0 h-full w-0.5" style={{ left: `${ltvBarWidth.adlTrigger}%` }} />
              <div className="bg-success absolute top-0 h-full w-0.5" style={{ left: `${ltvBarWidth.adlTarget}%` }} />
            </>
          )}
          {/* Auto-leverage markers */}
          {enableAutoLeverage && (
            <>
              <div className="bg-info absolute top-0 h-full w-0.5" style={{ left: `${ltvBarWidth.autoLevTrigger}%` }} />
              <div className="bg-primary absolute top-0 h-full w-0.5" style={{ left: `${ltvBarWidth.autoLevTarget}%` }} />
            </>
          )}
        </div>

        {/* Legend row */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="bg-base-content inline-block h-2 w-1 rounded-sm" />
            <span className="text-base-content/70">current</span>
          </span>
          {enableAutoLeverage && (
            <>
              <span className="flex items-center gap-1">
                <span className="bg-info inline-block h-2 w-1 rounded-sm" />
                <span className="text-info">leverage trigger</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-primary inline-block h-2 w-1 rounded-sm" />
                <span className="text-primary">leverage target</span>
              </span>
            </>
          )}
          {enableADL && (
            <>
              <span className="flex items-center gap-1">
                <span className="bg-success inline-block h-2 w-1 rounded-sm" />
                <span className="text-success">deleverage target</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-warning inline-block h-2 w-1 rounded-sm" />
                <span className="text-warning">deleverage trigger</span>
              </span>
            </>
          )}
        </div>

        {/* Side-by-side checkboxes */}
        <div className="grid grid-cols-2 gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={enableADL} onChange={e => setEnableADL(e.target.checked)} />
            <span className={`flex items-center gap-1 text-sm font-medium ${enableADL ? "border-b-2 border-warning" : "text-base-content/50"}`}>
              <ArrowTrendingDownIcon className="size-4" />
              Deleverage
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={enableAutoLeverage} onChange={e => setEnableAutoLeverage(e.target.checked)} />
            <span className={`flex items-center gap-1 text-sm font-medium ${enableAutoLeverage ? "border-b-2 border-info" : "text-base-content/50"}`}>
              <ArrowTrendingUpIcon className="size-4" />
              Leverage
            </span>
          </label>
        </div>

        {/* Input fields in two columns - Deleverage left, Leverage right */}
        {(enableADL || enableAutoLeverage) && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {/* Row 1: Trigger inputs */}
            {enableADL ? (
              <LtvInput label="Trigger" value={adlTriggerLtvBps} min={500} max={liquidationLtvBps - 100}
                colorClass="border-warning"
                onChange={v => { setAdlTriggerLtvBps(v); if (adlTargetLtvBps >= v) setAdlTargetLtvBps(Math.max(v - 500, 100)); }} />
            ) : <div />}
            {enableAutoLeverage ? (
              <LtvInput label="Trigger" value={autoLevTriggerLtvBps} min={100} max={autoLevTargetLtvBps - 100}
                colorClass="border-info"
                onChange={v => { setAutoLevTriggerLtvBps(v); if (autoLevTargetLtvBps <= v) setAutoLevTargetLtvBps(Math.min(v + 500, liquidationLtvBps - 300)); }} />
            ) : <div />}
            {/* Row 2: Target inputs - push triggers if needed */}
            {enableADL ? (
              <LtvInput label="Target" value={adlTargetLtvBps} min={100} max={liquidationLtvBps - 200}
                colorClass="border-success"
                onChange={v => { setAdlTargetLtvBps(v); if (adlTriggerLtvBps <= v) setAdlTriggerLtvBps(Math.min(v + 500, liquidationLtvBps - 100)); }} />
            ) : <div />}
            {enableAutoLeverage ? (
              <LtvInput label="Target" value={autoLevTargetLtvBps} min={100} max={liquidationLtvBps - 300}
                colorClass="border-primary"
                onChange={v => { setAutoLevTargetLtvBps(v); if (autoLevTriggerLtvBps >= v) setAutoLevTriggerLtvBps(Math.max(v - 500, 500)); }} />
            ) : <div />}
          </div>
        )}

        {/* Collateral + Advanced */}
        <div className="flex items-center justify-between">
          {collateralTokens.length > 1 ? (
            <select className="select select-bordered select-sm" value={selectedCollateralAddress} onChange={e => setSelectedCollateralAddress(e.target.value)}>
              {collateralTokens.map(c => (
                <option key={c.address} value={c.address}>{c.symbol} ({c.balance.toFixed(2)})</option>
              ))}
            </select>
          ) : <div />}
          <button type="button" className="text-base-content/50 hover:text-base-content flex items-center gap-1 text-xs" onClick={() => setShowAdvanced(!showAdvanced)}>
            Advanced <ChevronDownIcon className={`size-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-base-content/50 mb-1">Slippage</div>
              <select className="select select-bordered select-xs w-full" value={maxSlippageBps} onChange={e => setMaxSlippageBps(Number(e.target.value))}>
                <option value={50}>0.5%</option>
                <option value={100}>1%</option>
                <option value={200}>2%</option>
                <option value={500}>5%</option>
                <option value={750}>7.5%</option>
                <option value={1000}>10%</option>
              </select>
            </div>
            <div>
              <div className="text-base-content/50 mb-1">Chunks</div>
              <select className="select select-bordered select-xs w-full" value={numChunks} onChange={e => setNumChunks(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </div>
            <div>
              <div className="text-base-content/50 mb-1">Iterations</div>
              <select className="select select-bordered select-xs w-full" value={maxIterations} onChange={e => setMaxIterations(Number(e.target.value))}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
            </div>
          </div>
        )}

        {/* Errors */}
        {allErrors.length > 0 && (
          <div className="text-error flex items-start gap-1.5 text-xs">
            <ExclamationTriangleIcon className="size-4 flex-shrink-0 mt-0.5" />
            <span>{allErrors[0]}</span>
          </div>
        )}

        {/* Not supported */}
        {!isLoading && ((enableADL && !isADLSupported) || (enableAutoLeverage && !isAutoLevSupported)) && (
          <div className="text-warning flex items-center gap-1.5 text-xs">
            <InformationCircleIcon className="size-4" />
            <span>Not available on this network yet.</span>
          </div>
        )}

        {/* Submit */}
        <button type="button" className="btn btn-primary w-full" disabled={!canSubmit} onClick={handleCreate}>
          {isCreating ? <ButtonLoading /> : (
            <>
              <ShieldCheckIcon className="size-4" />
              {enableADL && enableAutoLeverage ? "Enable Both" : enableADL ? "Enable Protection" : enableAutoLeverage ? "Enable Leverage" : "Select an option"}
            </>
          )}
        </button>
      </div>
    </BaseModal>
  );
};

export default LTVAutomationModal;
