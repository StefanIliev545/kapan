import { FC, useState, useMemo, useCallback, useEffect } from "react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import {
  ShieldCheckIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { BaseModal } from "./BaseModal";
import { SwapAsset } from "./SwapModalShell";
import { ButtonLoading } from "../common/Loading";
import { useADLOrder, useADLContracts } from "~~/hooks/useADLOrder";
import {
  validateADLParams,
  formatLtvPercent,
  encodeProtocolContext,
  calculateADLFlashLoanAmount,
  usdToTokenAmount,
  MorphoMarketContextForEncoding,
} from "./adlAutomationHelpers";

// ============ Types ============

export interface ADLAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  // LTV info
  currentLtvBps: number;
  liquidationLtvBps: number;
  // Position tokens
  collateralTokens: SwapAsset[];
  debtToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  // Position values in USD (8 decimals, like Chainlink oracles)
  totalCollateralUsd?: bigint;
  totalDebtUsd?: bigint;
  // Protocol-specific context
  morphoContext?: MorphoMarketContextForEncoding;
  eulerBorrowVault?: string;
  eulerCollateralVaults?: string[];
  eulerSubAccountIndex?: number;
  compoundMarket?: string;
}

// ============ Sub-components ============

interface LtvDisplayProps {
  label: string;
  valueBps: number;
  color?: string;
}

const LtvDisplay: FC<LtvDisplayProps> = ({ label, valueBps, color = "text-base-content" }) => (
  <div className="flex flex-col items-center">
    <span className="text-base-content/60 text-xs">{label}</span>
    <span className={`text-lg font-semibold ${color}`}>{formatLtvPercent(valueBps)}</span>
  </div>
);

interface LtvSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  helpText?: string;
  color?: string;
}

const LtvSlider: FC<LtvSliderProps> = ({ label, value, min, max, onChange, helpText, color = "accent" }) => {
  // Ensure min <= max for valid slider range
  const effectiveMin = Math.min(min, max);
  const effectiveMax = Math.max(min, max);
  const hasValidRange = effectiveMax > effectiveMin;

  // Handle direct number input (as percentage)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percentValue = parseFloat(e.target.value);
    if (!isNaN(percentValue)) {
      // Convert percentage to basis points
      const bps = Math.round(percentValue * 100);
      // Clamp to valid range
      const clampedBps = Math.max(effectiveMin, Math.min(effectiveMax, bps));
      onChange(clampedBps);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-base-content text-sm font-medium">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.1"
            min={effectiveMin / 100}
            max={effectiveMax / 100}
            value={(value / 100).toFixed(1)}
            onChange={handleInputChange}
            className={`input input-xs input-bordered text- w-16 text-right font-semibold${color}`}
          />
          <span className="text-base-content/60 text-sm">%</span>
        </div>
      </div>
      {hasValidRange ? (
        <input
          type="range"
          min={effectiveMin}
          max={effectiveMax}
          step={100}
          value={Math.max(effectiveMin, Math.min(effectiveMax, value))}
          onChange={e => onChange(Number(e.target.value))}
          className={`range range-${color} range-sm w-full`}
        />
      ) : (
        <div className="text-warning text-xs">Range too narrow - use input above</div>
      )}
      {helpText && <p className="text-base-content/50 text-xs">{helpText}</p>}
    </div>
  );
};

// ============ Main Component ============

export const ADLAutomationModal: FC<ADLAutomationModalProps> = ({
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
  const { isSupported, isLoading: isLoadingContracts } = useADLContracts(chainId);

  // Form state
  const [triggerLtvBps, setTriggerLtvBps] = useState(() => {
    // Default: 5% above current LTV, but below liquidation
    const suggested = Math.min(currentLtvBps + 500, liquidationLtvBps - 500);
    return Math.max(suggested, currentLtvBps + 100);
  });

  const [targetLtvBps, setTargetLtvBps] = useState(() => {
    // Default: 10% below trigger
    return Math.max(triggerLtvBps - 1000, 1000);
  });

  const [selectedCollateralAddress, setSelectedCollateralAddress] = useState<string>(() =>
    collateralTokens.length > 0 ? collateralTokens[0].address : "",
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxSlippageBps, setMaxSlippageBps] = useState(100); // 1%
  const [numChunks, setNumChunks] = useState(1);
  const [maxIterations, setMaxIterations] = useState(10);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      const suggestedTrigger = Math.min(currentLtvBps + 500, liquidationLtvBps - 500);
      setTriggerLtvBps(Math.max(suggestedTrigger, currentLtvBps + 100));
      setTargetLtvBps(Math.max(suggestedTrigger - 1000, 1000));
      if (collateralTokens.length > 0) {
        setSelectedCollateralAddress(collateralTokens[0].address);
      }
    }
  }, [isOpen, currentLtvBps, liquidationLtvBps, collateralTokens]);

  // Get selected collateral
  const selectedCollateral = useMemo(
    () => collateralTokens.find(c => c.address.toLowerCase() === selectedCollateralAddress.toLowerCase()),
    [collateralTokens, selectedCollateralAddress],
  );

  // Encode protocol context
  const protocolContext = useMemo(() => {
    try {
      return encodeProtocolContext(protocolName, {
        morphoContext,
        eulerContext: eulerBorrowVault
          ? {
              borrowVault: eulerBorrowVault,
              collateralVault: eulerCollateralVaults || [],
              subAccountIndex: eulerSubAccountIndex,
            }
          : undefined,
        compoundMarket,
      });
    } catch {
      return "0x";
    }
  }, [protocolName, morphoContext, eulerBorrowVault, eulerCollateralVaults, eulerSubAccountIndex, compoundMarket]);

  // Validation
  const validation = useMemo(
    () =>
      validateADLParams({
        currentLtvBps,
        liquidationLtvBps,
        triggerLtvBps,
        targetLtvBps,
        maxSlippageBps,
        numChunks,
        maxIterations,
        collateralToken: selectedCollateralAddress,
      }),
    [currentLtvBps, liquidationLtvBps, triggerLtvBps, targetLtvBps, maxSlippageBps, numChunks, maxIterations, selectedCollateralAddress],
  );

  // Calculate flash loan config for ADL order
  // Flash loans are REQUIRED - without them, order manager has no collateral to swap
  const flashLoanConfig = useMemo(() => {
    if (!selectedCollateral || !totalCollateralUsd || !totalDebtUsd) {
      return null;
    }

    // Calculate per-chunk flash loan amount in USD (with 20% buffer)
    const perChunkFlashLoanUsd = calculateADLFlashLoanAmount(
      totalCollateralUsd,
      totalDebtUsd,
      targetLtvBps,
      numChunks,
      2000, // 20% buffer for price movements
    );

    if (perChunkFlashLoanUsd === 0n) {
      return null;
    }

    // Convert USD to collateral token amount
    // Estimate collateral price from usdValue / balance
    const collateralPrice = selectedCollateral.usdValue && selectedCollateral.balance > 0
      ? BigInt(Math.round((selectedCollateral.usdValue / selectedCollateral.balance) * 1e8))
      : 0n;

    if (collateralPrice === 0n) {
      return null;
    }

    const perChunkFlashLoanAmount = usdToTokenAmount(
      perChunkFlashLoanUsd,
      collateralPrice,
      selectedCollateral.decimals,
    );

    // Estimate per-chunk buy amount (debt to receive)
    // This is approximately the same as flash loan amount in USD terms
    const debtPrice = totalDebtUsd > 0n && totalCollateralUsd > 0n
      ? (totalDebtUsd * BigInt(1e8)) / totalCollateralUsd
      : BigInt(1e8); // Default to 1:1 if unknown

    const perChunkBuyAmount = usdToTokenAmount(
      perChunkFlashLoanUsd,
      debtPrice,
      debtToken.decimals,
    );

    return {
      amount: perChunkFlashLoanAmount,
      perChunkBuyAmount,
      userCollateralBalance: selectedCollateral.rawBalance,
    };
  }, [selectedCollateral, totalCollateralUsd, totalDebtUsd, targetLtvBps, numChunks, debtToken.decimals]);

  // ADL Order hook
  const { createOrder, isLoading: isCreating } = useADLOrder({
    protocolName,
    chainId,
    triggerParams: {
      protocolName,
      protocolContext,
      triggerLtvBps,
      targetLtvBps,
      collateralToken: selectedCollateralAddress,
      debtToken: debtToken.address,
      collateralDecimals: selectedCollateral?.decimals || 18,
      debtDecimals: debtToken.decimals,
      maxSlippageBps,
      numChunks,
    },
    maxIterations,
    userAddress: userAddress as Address,
    flashLoanConfig: flashLoanConfig || {
      amount: 0n,
      perChunkBuyAmount: 0n,
      userCollateralBalance: 0n,
    },
  });

  const handleCreate = useCallback(async () => {
    const result = await createOrder();
    if (result) {
      onClose();
    }
  }, [createOrder, onClose]);

  // Calculate LTV bar percentages
  const ltvBarWidth = useMemo(() => {
    const maxLtv = liquidationLtvBps + 500; // Add some padding
    return {
      current: (currentLtvBps / maxLtv) * 100,
      trigger: (triggerLtvBps / maxLtv) * 100,
      target: (targetLtvBps / maxLtv) * 100,
      liquidation: (liquidationLtvBps / maxLtv) * 100,
    };
  }, [currentLtvBps, triggerLtvBps, targetLtvBps, liquidationLtvBps]);

  // Flash loan config must be valid (non-zero amounts) for order to work
  const hasValidFlashLoan = flashLoanConfig !== null && flashLoanConfig.amount > 0n;
  const canSubmit = validation.isValid && isSupported && !!userAddress && !isCreating && hasValidFlashLoan;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Auto-Deleverage Protection" maxWidthClass="max-w-lg">
      <div className="space-y-5">
        {/* Info banner */}
        <div className="bg-info/10 flex items-start gap-3 rounded-lg p-3">
          <ShieldCheckIcon className="text-info size-5 flex-shrink-0" />
          <p className="text-base-content/70 text-xs">
            Automatically sell collateral to repay debt when your LTV exceeds the trigger threshold, protecting your
            position from liquidation.
          </p>
        </div>

        {/* Current LTV display */}
        <div className="bg-base-200/50 flex items-center justify-around rounded-lg p-4">
          <LtvDisplay label="Current LTV" valueBps={currentLtvBps} color="text-base-content" />
          <div className="bg-base-300 h-8 w-px" />
          <LtvDisplay label="Liquidation" valueBps={liquidationLtvBps} color="text-error" />
        </div>

        {/* Visual LTV bar */}
        <div className="bg-base-200 relative h-8 rounded-full">
          {/* Target zone (green) */}
          <div
            className="bg-success/20 absolute left-0 top-0 h-full rounded-l-full"
            style={{ width: `${ltvBarWidth.target}%` }}
          />
          {/* Warning zone (yellow) */}
          <div
            className="bg-warning/20 absolute top-0 h-full"
            style={{ left: `${ltvBarWidth.target}%`, width: `${ltvBarWidth.trigger - ltvBarWidth.target}%` }}
          />
          {/* Danger zone (red) */}
          <div
            className="bg-error/20 absolute top-0 h-full rounded-r-full"
            style={{ left: `${ltvBarWidth.trigger}%`, width: `${ltvBarWidth.liquidation - ltvBarWidth.trigger}%` }}
          />
          {/* Current LTV marker */}
          <div
            className="bg-base-content absolute top-0 h-full w-1"
            style={{ left: `${ltvBarWidth.current}%` }}
            title={`Current: ${formatLtvPercent(currentLtvBps)}`}
          />
          {/* Trigger marker */}
          <div
            className="bg-warning absolute top-0 h-full w-0.5"
            style={{ left: `${ltvBarWidth.trigger}%` }}
            title={`Trigger: ${formatLtvPercent(triggerLtvBps)}`}
          />
          {/* Target marker */}
          <div
            className="bg-success absolute top-0 h-full w-0.5"
            style={{ left: `${ltvBarWidth.target}%` }}
            title={`Target: ${formatLtvPercent(targetLtvBps)}`}
          />
        </div>

        {/* Sliders */}
        <div className="space-y-4">
          <LtvSlider
            label="Trigger LTV"
            value={triggerLtvBps}
            min={100}
            max={liquidationLtvBps - 100}
            onChange={v => {
              setTriggerLtvBps(v);
              if (targetLtvBps >= v) {
                setTargetLtvBps(Math.max(v - 500, 100));
              }
            }}
            helpText="Start deleveraging when LTV exceeds this threshold"
            color="warning"
          />

          <LtvSlider
            label="Target LTV"
            value={targetLtvBps}
            min={100}
            max={triggerLtvBps - 100}
            onChange={setTargetLtvBps}
            helpText="Deleverage until LTV drops to this level"
            color="success"
          />
        </div>

        {/* Collateral selector */}
        <div className="space-y-2">
          <label className="text-base-content text-sm font-medium">Collateral to Sell</label>
          <select
            className="select select-bordered w-full"
            value={selectedCollateralAddress}
            onChange={e => setSelectedCollateralAddress(e.target.value)}
          >
            {collateralTokens.map(c => (
              <option key={c.address} value={c.address}>
                {c.symbol} - {c.balance.toFixed(4)} (${c.usdValue?.toFixed(2) || "0.00"})
              </option>
            ))}
          </select>
        </div>

        {/* Advanced settings */}
        <div className="border-base-300 border-t pt-4">
          <button
            type="button"
            className="text-base-content/70 hover:text-base-content flex w-full items-center justify-between text-sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>Advanced Settings</span>
            <ChevronDownIcon className={`size-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>

          {showAdvanced && (
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <label className="text-base-content/60 mb-1 block text-xs">Max Slippage</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={maxSlippageBps}
                  onChange={e => setMaxSlippageBps(Number(e.target.value))}
                >
                  <option value={50}>0.5%</option>
                  <option value={100}>1%</option>
                  <option value={200}>2%</option>
                  <option value={500}>5%</option>
                  <option value={750}>7.5%</option>
                  <option value={1000}>10%</option>
                </select>
              </div>

              <div>
                <label className="text-base-content/60 mb-1 block text-xs">Chunks</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={numChunks}
                  onChange={e => setNumChunks(Number(e.target.value))}
                >
                  <option value={1}>1 (Full)</option>
                  <option value={2}>2 (Half)</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>

              <div>
                <label className="text-base-content/60 mb-1 block text-xs">Max Iterations</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={maxIterations}
                  onChange={e => setMaxIterations(Number(e.target.value))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Validation errors */}
        {!validation.isValid && (
          <div className="space-y-1">
            {validation.errors.map((err, i) => (
              <div key={i} className="text-error flex items-center gap-2 text-xs">
                <ExclamationTriangleIcon className="size-4" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}

        {/* Contract not supported warning */}
        {!isLoadingContracts && !isSupported && (
          <div className="bg-warning/10 text-warning flex items-center gap-2 rounded-lg p-3 text-xs">
            <InformationCircleIcon className="size-5 flex-shrink-0" />
            <span>ADL automation is not available on this network yet.</span>
          </div>
        )}

        {/* Submit button */}
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!canSubmit}
          onClick={handleCreate}
        >
          {isCreating ? (
            <ButtonLoading />
          ) : (
            <>
              <ShieldCheckIcon className="size-5" />
              Enable Protection
            </>
          )}
        </button>
      </div>
    </BaseModal>
  );
};
