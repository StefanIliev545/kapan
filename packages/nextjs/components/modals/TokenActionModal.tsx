import { track } from "@vercel/analytics";
import { FC, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Fuel } from "lucide-react";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { TokenPill } from "../common/TokenDisplay";
import type { Call } from "starknet";
import { formatUnits } from "viem";
import { useAccount as useEvmAccount } from "wagmi";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import type { Network } from "~~/hooks/useTokenBalance";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import formatPercentage from "~~/utils/formatPercentage";
import { formatRate } from "~~/utils/protocols";
import { PositionManager } from "~~/utils/position";
import {
  parseAmount,
  shouldShowInsufficientFunds,
  canSubmitForm,
} from "~~/utils/validation";

// --- Shared types for position calculations ---
type TokenAction = "Borrow" | "Deposit" | "Withdraw" | "Repay";

interface PositionCalculationsInput {
  action: TokenAction;
  amount: string;
  price: number;
  position?: PositionManager;
  hf?: number;
  utilization?: number;
  ltv?: number;
}

interface PositionCalculationsResult {
  beforeHf: number;
  beforeUtil: number;
  beforeLtv: number;
  afterHf: number;
  afterLtv: number;
}

/**
 * Hook to calculate position metrics (health factor, utilization, LTV) before and after an action.
 * Extracts common logic used by both TokenActionModal and TokenActionCard.
 */
function usePositionCalculations({
  action,
  amount,
  price,
  position,
  hf = 1.9,
  utilization = 65,
  ltv = 75,
}: PositionCalculationsInput): PositionCalculationsResult {
  const parsed = parseFloat(amount || "0");

  const beforePosition = useMemo(() => position ?? new PositionManager(0, 0), [position]);
  const afterPosition = useMemo(
    () => beforePosition.apply(action, parsed * price),
    [beforePosition, action, parsed, price],
  );

  const beforeHf = position ? beforePosition.healthFactor() : hf;
  const beforeUtil = position ? beforePosition.utilization() : utilization;
  const beforeLtv = position ? beforePosition.loanToValue() : ltv;
  const afterHf = position ? afterPosition.healthFactor() : hf;
  const afterLtv = position ? afterPosition.loanToValue() : ltv;

  // Override defaults for Deposit with no debt: HF = Infinity, LTV = 0%
  const isDepositNoDebtFallback = action === "Deposit" && !position;

  return {
    beforeHf: isDepositNoDebtFallback ? Infinity : beforeHf,
    beforeUtil,
    beforeLtv: isDepositNoDebtFallback ? 0 : beforeLtv,
    afterHf: isDepositNoDebtFallback ? Infinity : afterHf,
    afterLtv: isDepositNoDebtFallback ? 0 : afterLtv,
  };
}

/**
 * Calculates the after value based on the action type.
 * For Borrow/Deposit: adds to before value.
 * For Withdraw/Repay: subtracts from before value (minimum 0).
 */
function calculateAfterValue(action: TokenAction, before: number, parsedAmount: number): number {
  switch (action) {
    case "Borrow":
    case "Deposit":
      return before + parsedAmount;
    case "Withdraw":
    case "Repay":
      return Math.max(0, before - parsedAmount);
    default:
      return before;
  }
}

/**
 * Calculates the effective max borrowable amount based on position's free borrow capacity.
 */
function calculateEffectiveMax(
  action: TokenAction,
  position: PositionManager | undefined,
  tokenUsdPrice: number | undefined,
  decimals: number,
  fallbackMax: bigint | undefined,
): bigint | undefined {
  if (action !== "Borrow" || !position || !tokenUsdPrice) return fallbackMax;
  const freeUsd = position.freeBorrowUsd();
  if (freeUsd <= 0 || tokenUsdPrice === 0) return 0n;
  const amount = Math.floor((freeUsd / tokenUsdPrice) * 10 ** decimals);
  return BigInt(amount);
}

// --- Shared hook for TokenActionModal and TokenActionCard state ---
interface UseTokenActionStateInput {
  action: TokenAction;
  token: TokenInfo;
  before: number;
  position?: PositionManager;
  hf?: number;
  utilization?: number;
  ltv?: number;
  max?: bigint;
}

interface UseTokenActionStateResult {
  amount: string;
  setAmount: (value: string) => void;
  parsed: number;
  price: number;
  decimals: number;
  effectiveMax: bigint | undefined;
  afterValue: number;
  beforeHfEffective: number;
  beforeUtil: number;
  beforeLtvEffective: number;
  afterHfEffective: number;
  afterLtvEffective: number;
}

/**
 * Shared hook that encapsulates common state and calculations for TokenActionModal and TokenActionCard.
 * Eliminates duplication of amount state, position calculations, effectiveMax, and afterValue logic.
 */
function useTokenActionState({
  action,
  token,
  before,
  position,
  hf = 1.9,
  utilization = 65,
  ltv = 75,
  max,
}: UseTokenActionStateInput): UseTokenActionStateResult {
  const [amount, setAmount] = useState("");
  const parsed = parseFloat(amount || "0");
  const price = token.usdPrice || 0;
  const decimals = token.decimals || 18;

  const {
    beforeHf: beforeHfEffective,
    beforeUtil,
    beforeLtv: beforeLtvEffective,
    afterHf: afterHfEffective,
    afterLtv: afterLtvEffective,
  } = usePositionCalculations({
    action,
    amount,
    price,
    position,
    hf,
    utilization,
    ltv,
  });

  const effectiveMax = useMemo(
    () => calculateEffectiveMax(action, position, token.usdPrice, decimals, max),
    [action, position, token.usdPrice, decimals, max],
  );

  const afterValue = useMemo(
    () => calculateAfterValue(action, before, parsed),
    [action, before, parsed],
  );

  return {
    amount,
    setAmount,
    parsed,
    price,
    decimals,
    effectiveMax,
    afterValue,
    beforeHfEffective,
    beforeUtil,
    beforeLtvEffective,
    afterHfEffective,
    afterLtvEffective,
  };
}

// --- Shared component for After metrics grid ---
interface AfterMetricsGridProps {
  action: TokenAction;
  afterHf: number;
  afterLtv: number;
  afterValue: number;
  tokenIcon: string;
  tokenName: string;
}

/**
 * Renders the "After" metrics grid showing Health Factor, Loan To Value, and Debt/Balance.
 * Used by both TokenActionModal and TokenActionCard.
 */
const AfterMetricsGrid: FC<AfterMetricsGridProps> = ({
  action,
  afterHf,
  afterLtv,
  afterValue,
  tokenIcon,
  tokenName,
}) => {
  const hfTextColor = !Number.isFinite(afterHf)
    ? "text-success"
    : afterHf >= 4
      ? "text-success"
      : afterHf > 2
        ? "text-warning"
        : "text-error";
  const thirdLabel = action === "Borrow" || action === "Repay" ? "Debt" : "Balance";

  return (
    <div className="pt-2 text-xs">
      <div className="grid grid-cols-3">
        <div className="text-center opacity-70">Health Factor</div>
        <div className="border-base-300 border-l text-center opacity-70">Loan To Value</div>
        <div className="border-base-300 border-l text-center opacity-70">{thirdLabel}</div>
      </div>
      <div className="mt-1 grid grid-cols-3 items-center">
        <div className={`text-center ${hfTextColor}`}>
          {Number.isFinite(afterHf) ? afterHf.toFixed(2) : "\u221e"}
        </div>
        <div className="border-base-300 border-l text-center">{formatPercentage(afterLtv)}%</div>
        <div className="border-base-300 flex items-center justify-center gap-2 border-l">
          <TokenPill value={afterValue} icon={tokenIcon} name={tokenName} />
        </div>
      </div>
    </div>
  );
};

export interface TokenInfo {
  name: string;
  icon: string;
  address: string;
  currentRate: number;
  usdPrice?: number;
  decimals?: number;
}

export interface TokenActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: "Borrow" | "Deposit" | "Withdraw" | "Repay";
  apyLabel: string;
  apy: number;
  token: TokenInfo;
  protocolName?: string;
  metricLabel: string;
  before: number;
  balance: bigint;
  percentBase?: bigint;
  max?: bigint;
  network: Network;
  chainId?: number;
  buildTx?: (amount: string, isMax: boolean) => any;
  buildCalls?: (
    amount: string,
    isMax: boolean,
  ) => Promise<Call | Call[] | null | undefined> | Call | Call[] | null | undefined;
  hf?: number;
  utilization?: number;
  ltv?: number;
  position?: PositionManager;
  onConfirm?: (amount: string, isMax?: boolean) => Promise<unknown> | void;
  renderExtraContent?: () => ReactNode; // Optional content to render before action button
}

const format = (num: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);

// Display APY/APR consistently as percentages

const HealthFactor = ({ value }: { value: number }) => {
  const isFiniteValue = Number.isFinite(value);
  const percent = isFiniteValue ? Math.min(100, Math.max(0, ((value - 1) / 3) * 100)) : 100;
  const barStyle = useMemo(() => ({ width: `${percent}%` }), [percent]);
  return (
    <div className="flex flex-col text-xs">
      <span className="text-base-content/50 mb-1">Health Factor</span>
      <div className="flex items-center gap-2">
        <div className="bg-base-300 h-1.5 w-20 overflow-hidden rounded-full">
          <div className="bg-base-content/60 h-full rounded-full" style={barStyle} />
        </div>
        <span className="text-base-content font-medium">{isFiniteValue ? value.toFixed(2) : "∞"}</span>
      </div>
    </div>
  );
};

// Render a labeled bar with percentage for Loan To Value
const LoanToValueBar = ({ value }: { value: number }) => {
  const barStyle = useMemo(() => ({ width: `${value}%` }), [value]);
  return (
    <div className="flex flex-col text-xs">
      <span className="text-base-content/50 mb-1">Loan To Value</span>
      <div className="flex items-center gap-2">
        <div className="bg-base-300 h-1.5 w-20 overflow-hidden rounded-full">
          <div className="bg-base-content/60 h-full rounded-full" style={barStyle} />
        </div>
        <span className="text-base-content font-medium">{formatPercentage(value)}%</span>
      </div>
    </div>
  );
};

// TokenPill imported from common/TokenDisplay.tsx for standardized token display

type PercentOnChange = (amount: string, isMax: boolean) => void;

export const PercentInput: FC<{
  balance: bigint;
  decimals: number;
  price?: number;
  onChange: PercentOnChange;
  percentBase?: bigint;
  max?: bigint;
  resetTrigger?: boolean;
  insufficientFunds?: boolean;
}> = ({ balance, decimals, price = 0, onChange, percentBase, max, resetTrigger, insufficientFunds }) => {
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<number | null>(null);

  // Reset amount when resetTrigger changes (modal reopens)
  useEffect(() => {
    setAmount("");
    setActive(null);
  }, [resetTrigger]);
  const setPercent = useCallback((p: number) => {
    const base = percentBase ?? balance;
    const val = (base * BigInt(p)) / 100n;
    const formatted = formatUnits(val, decimals);
    setAmount(formatted);
    setActive(p);
    onChange(formatted, p === 100);
  }, [percentBase, balance, decimals, onChange]);
  const handleChange = useCallback((val: string) => {
    const result = parseAmount(val || "0", decimals);
    let parsed = result.value ?? 0n;
    const base = percentBase ?? balance;
    const limit = max ?? base;
    const isMaxFlag = false;
    if (limit > 0n && parsed >= limit) {
      parsed = limit;
      val = formatUnits(limit, decimals);
    }
    setAmount(val);
    setActive(null);
    onChange(val, isMaxFlag);
  }, [decimals, percentBase, balance, max, onChange]);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.value);
  }, [handleChange]);
  const handleSetPercent25 = useCallback(() => setPercent(25), [setPercent]);
  const handleSetPercent50 = useCallback(() => setPercent(50), [setPercent]);
  const handleSetPercent100 = useCallback(() => setPercent(100), [setPercent]);
  const percentHandlers = useMemo(() => ({
    25: handleSetPercent25,
    50: handleSetPercent50,
    100: handleSetPercent100,
  }), [handleSetPercent25, handleSetPercent50, handleSetPercent100]);
  const usd = (parseFloat(amount || "0") * price).toFixed(2);
  return (
    <>
      <div className="relative">
        <input
          type="number"
          value={amount}
          onChange={handleInputChange}
          placeholder="0.0"
          className="bg-base-200/50 border-base-300/50 text-base-content placeholder:text-base-content/30 focus:border-base-content/30 w-full rounded-lg border px-4 py-3 pr-24 focus:outline-none"
        />
        {insufficientFunds && (
          <div className="absolute -top-4 right-1 z-10">
            <span className="badge badge-error badge-sm whitespace-nowrap">Insufficient funds</span>
          </div>
        )}
        <div className="divide-base-300 absolute inset-y-0 right-3 flex items-center divide-x text-xs">
          {([25, 50, 100] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={percentHandlers[p]}
              className={`px-1 ${active === p ? "underline" : ""}`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 text-center text-xs opacity-70">≈ ${usd}</div>
    </>
  );
};

export const LeftMetrics: FC<{
  hf: number;
  utilization: number;
  ltv: number;
  metricLabel: string;
  metricValue: number;
  token: TokenInfo;
}> = ({ hf, ltv, metricLabel, metricValue, token }) => (
  <div className="bg-base-200/50 border-base-300/50 w-full space-y-4 border-b p-5 text-sm md:w-52 md:border-b-0 md:border-r">
    <div className="text-base-content/40 text-xs font-medium uppercase tracking-wider">Before</div>
    <div className="space-y-4">
      <HealthFactor value={hf} />
      <LoanToValueBar value={ltv} />
      <div className="flex items-center justify-between text-xs">
        <span className="text-base-content/50">{metricLabel}</span>
        <TokenPill value={metricValue} icon={token.icon} name={token.name} />
      </div>
    </div>
  </div>
);

export const TokenActionModal: FC<TokenActionModalProps> = ({
  isOpen,
  onClose,
  action,
  apyLabel,
  apy,
  token,
  protocolName,
  metricLabel,
  before,
  balance,
  percentBase,
  max,
  network,
  chainId,
  hf = 1.9,
  utilization = 65,
  ltv = 75,
  position,
  buildCalls,
  onConfirm,
  renderExtraContent,
}) => {
  const { address: evmAddress, chain } = useEvmAccount();
  const { address: starkAddress } = useStarkAccount();

  // Use shared hook for common state and calculations
  const {
    amount,
    setAmount,
    decimals,
    effectiveMax,
    afterValue,
    beforeHfEffective,
    beforeUtil,
    beforeLtvEffective,
    afterHfEffective,
    afterLtvEffective,
  } = useTokenActionState({
    action,
    token,
    before,
    position,
    hf,
    utilization,
    ltv,
    max,
  });

  const [isMax, setIsMax] = useState(false);
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const wasOpenRef = useRef(false);

  // Use shared validation utility for amount parsing
  const parsedAmountResult = useMemo(() => parseAmount(amount, decimals), [amount, decimals]);
  const parsedAmount = parsedAmountResult.value;
  const isAmountPositive = parsedAmountResult.isPositive;

  // Use shared validation utility for insufficient funds check
  const insufficientFunds = useMemo(
    () => shouldShowInsufficientFunds(action, parsedAmount, balance),
    [action, parsedAmount, balance]
  );

  const isCorrectChain = network !== "evm" || !chainId || chain?.id === chainId;
  const isWalletConnected = network === "evm" ? Boolean(evmAddress) : Boolean(starkAddress);

  // Use shared validation utility for form submission check
  const canSubmit = canSubmitForm({
    isAmountPositive,
    hasSufficientFunds: !insufficientFunds,
    isWalletConnected,
    isCorrectChain,
  });
  const isActionComplete = txState === "success";
  const isConfirmDisabled = txState === "pending" || (!isActionComplete && !canSubmit);

  const buildCallsForEstimate = useCallback(() => {
    if (!buildCalls) return null;
    return buildCalls(amount, isMax);
  }, [buildCalls, amount, isMax]);

  // Keep gas estimation ready for future multi-action bars; not displayed in compact UI
  useGasEstimate({
    enabled: false && isOpen && network === "stark",
    buildCalls: buildCallsForEstimate,
    currency: "STRK",
  });

  // Reset transaction state when modal opens
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setTxState("idle");
      track("token_action_modal_open", {
        action,
        tokenName: token.name,
        tokenAddress: token.address,
        network,
        protocol: protocolName ?? "unknown",
      });
    }
    wasOpenRef.current = isOpen;
  }, [action, isOpen, network, protocolName, token.address, token.name]);

  const handleClose = useCallback(() => {
    setAmount("");
    setIsMax(false);
    setTxState("idle");
    onClose();
  }, [onClose, setAmount]);

  const handlePercentInputChange = useCallback((val: string, maxed: boolean) => {
    setAmount(val);
    setIsMax(maxed);
  }, [setAmount]);

  const handleConfirm = useCallback(async () => {
    if (txState === "success") {
      handleClose();
      return;
    }
    try {
      setTxState("pending");
      track("token_action_tx_begin", {
        action,
        tokenName: token.name,
        tokenAddress: token.address,
        network,
        protocol: protocolName ?? "unknown",
        amount,
        isMax,
      });
      await onConfirm?.(amount, isMax);
      setTxState("success");
      track("token_action_tx_complete", {
        action,
        tokenName: token.name,
        tokenAddress: token.address,
        network,
        protocol: protocolName ?? "unknown",
        amount,
        isMax,
        status: "success",
      });
    } catch (e) {
      console.error(e);
      setTxState("error");
      track("token_action_tx_complete", {
        action,
        tokenName: token.name,
        tokenAddress: token.address,
        network,
        protocol: protocolName ?? "unknown",
        amount,
        isMax,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [txState, handleClose, action, token.name, token.address, network, protocolName, amount, isMax, onConfirm]);

  // Memoize the actions array for SegmentedActionBar
  const actionBarActions = useMemo(() => {
    const pendingIcon = <span className="loading loading-spinner loading-xs" />;
    const starkIcon = <Fuel className="size-4 text-gray-400" />;
    return [
      {
        key: txState === "success" ? "close" : "confirm",
        label: txState === "pending" ? "Submitting..." : txState === "success" ? "Close" : txState === "error" ? "Retry" : action,
        icon: txState === "pending" ? pendingIcon : network === "stark" ? starkIcon : undefined,
        onClick: handleConfirm,
        disabled: isConfirmDisabled,
        variant: "ghost" as const,
      },
    ];
  }, [txState, action, network, handleConfirm, isConfirmDisabled]);

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="modal-box bg-base-100 border-base-300/50 relative max-w-2xl overflow-hidden rounded-xl border p-0">
        <div className="flex flex-col md:flex-row">
          <LeftMetrics
            hf={beforeHfEffective}
            utilization={beforeUtil}
            ltv={beforeLtvEffective}
            metricLabel={metricLabel}
            metricValue={before}
            token={token}
          />
          <div className="flex-1 space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Image src={token.icon} alt={token.name} width={28} height={28} className="rounded-full" />
                <h3 className="text-base-content text-lg font-semibold">
                  {action} {token.name}
                </h3>
              </div>
              {protocolName && <div className="text-base-content/40 text-xs uppercase tracking-wider">{protocolName}</div>}
            </div>
            <div className="text-base-content/70 flex items-center justify-between text-xs">
              <span>
                {apyLabel} {formatRate(apy)}%
              </span>
              <span>Balance: {format(Number(formatUnits(balance, decimals)))}</span>
            </div>
            <PercentInput
              balance={balance}
              decimals={decimals}
              price={token.usdPrice}
              onChange={handlePercentInputChange}
              percentBase={percentBase ?? (action === "Borrow" ? effectiveMax : undefined)}
              max={effectiveMax}
              resetTrigger={isOpen}
              insufficientFunds={insufficientFunds}
            />
            <AfterMetricsGrid
              action={action}
              afterHf={afterHfEffective}
              afterLtv={afterLtvEffective}
              afterValue={afterValue}
              tokenIcon={token.icon}
              tokenName={token.name}
            />
            {renderExtraContent && renderExtraContent()}
            <div className="modal-action pt-2">
              <SegmentedActionBar
                className="w-full"
                autoCompact
                actions={actionBarActions}
              />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};

// Card version for demos: non-interactive confirm
export const TokenActionCard: FC<Omit<TokenActionModalProps, "isOpen" | "onClose"> & { disabledConfirm?: boolean }> = ({
  action,
  apyLabel,
  apy,
  token,
  protocolName,
  metricLabel,
  before,
  balance,
  percentBase,
  max,
  hf = 1.9,
  utilization = 65,
  ltv = 75,
  position,
}) => {
  // Use shared hook for common state and calculations
  const {
    setAmount,
    decimals,
    effectiveMax,
    afterValue,
    beforeHfEffective,
    beforeUtil,
    beforeLtvEffective,
    afterHfEffective,
    afterLtvEffective,
  } = useTokenActionState({
    action,
    token,
    before,
    position,
    hf,
    utilization,
    ltv,
    max,
  });

  const handleCardChange = useCallback((val: string) => {
    setAmount(val);
  }, [setAmount]);

  const handleDemoClick = useCallback(() => {
    console.debug("Demo confirm disabled");
  }, []);

  const cardActions = useMemo(() => [
    { key: "confirm", label: action, onClick: handleDemoClick, disabled: true, variant: "ghost" as const }
  ], [action, handleDemoClick]);

  return (
    <div className="card bg-base-100 border-base-300 overflow-hidden rounded-none border">
      <div className="flex flex-col md:flex-row">
        <LeftMetrics
          hf={beforeHfEffective}
          utilization={beforeUtil}
          ltv={beforeLtvEffective}
          metricLabel={metricLabel}
          metricValue={before}
          token={token}
        />
        <div className="flex-1 space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">{action} {token.name}</h3>
              <Image src={token.icon} alt={token.name} width={32} height={32} />
            </div>
            {protocolName && <div className="text-base-content/70 text-sm">{protocolName}</div>}
          </div>
          <div className="text-base-content/70 flex items-center justify-between text-xs">
            <span>{apyLabel} {formatRate(apy)}</span>
            <span>Balance: {format(Number(formatUnits(balance, decimals)))}</span>
          </div>
          <PercentInput
            balance={balance}
            decimals={decimals}
            price={token.usdPrice}
            onChange={handleCardChange}
            percentBase={percentBase ?? (action === "Borrow" ? effectiveMax : undefined)}
            max={effectiveMax}
            resetTrigger={true}
          />
          <AfterMetricsGrid
            action={action}
            afterHf={afterHfEffective}
            afterLtv={afterLtvEffective}
            afterValue={afterValue}
            tokenIcon={token.icon}
            tokenName={token.name}
          />
          <div className="pt-2">
            <SegmentedActionBar
              className="w-full"
              autoCompact
              actions={cardActions}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
