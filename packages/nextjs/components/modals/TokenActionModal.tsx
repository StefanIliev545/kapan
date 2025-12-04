import { track } from "@vercel/analytics";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { FaGasPump } from "react-icons/fa";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import type { Call } from "starknet";
import { formatUnits, parseUnits } from "viem";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import type { Network } from "~~/hooks/useTokenBalance";
import formatPercentage from "~~/utils/formatPercentage";
import { formatRate } from "~~/utils/protocols";
import { PositionManager } from "~~/utils/position";

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
  return (
    <div className="flex flex-col text-xs">
      <span className="mb-1 text-base-content/50">Health Factor</span>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-base-300 rounded-full overflow-hidden">
          <div className="h-full bg-base-content/60 rounded-full" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-base-content font-medium">{isFiniteValue ? value.toFixed(2) : "∞"}</span>
      </div>
    </div>
  );
};

// Render a labeled bar with percentage for Loan To Value
const LoanToValueBar = ({ value }: { value: number }) => (
  <div className="flex flex-col text-xs">
    <span className="mb-1 text-base-content/50">Loan To Value</span>
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-base-300 rounded-full overflow-hidden">
        <div className="h-full bg-base-content/60 rounded-full" style={{ width: `${value}%` }} />
      </div>
      <span className="text-base-content font-medium">{formatPercentage(value)}%</span>
    </div>
  </div>
);

const TokenPill = ({ value, icon, name }: { value: number; icon: string; name: string }) => (
  <div className="flex items-center gap-1 text-xs text-base-content/80">
    <Image src={icon} alt={name} width={12} height={12} />
    <span>{format(value)}</span>
  </div>
);

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
  const setPercent = (p: number) => {
    const base = percentBase ?? balance;
    const val = (base * BigInt(p)) / 100n;
    const formatted = formatUnits(val, decimals);
    setAmount(formatted);
    setActive(p);
    onChange(formatted, p === 100);
  };
  const handleChange = (val: string) => {
    let parsed: bigint;
    try {
      parsed = parseUnits(val || "0", decimals);
    } catch {
      parsed = 0n;
    }
    const base = percentBase ?? balance;
    const limit = max ?? base;
    const isMax = false;
    if (limit > 0n && parsed >= limit) {
      parsed = limit;
      val = formatUnits(limit, decimals);
    }
    setAmount(val);
    setActive(null);
    onChange(val, isMax);
  };
  const usd = (parseFloat(amount || "0") * price).toFixed(2);
  return (
    <>
      <div className="relative">
        <input
          type="number"
          value={amount}
          onChange={e => handleChange(e.target.value)}
          placeholder="0.0"
          className="w-full px-4 py-3 bg-base-200/50 border border-base-300/50 rounded-lg text-base-content placeholder:text-base-content/30 focus:outline-none focus:border-base-content/30 pr-24"
        />
        {insufficientFunds && (
          <div className="absolute -top-4 right-1 z-10">
            <span className="badge badge-error badge-sm whitespace-nowrap">Insufficient funds</span>
          </div>
        )}
        <div className="absolute inset-y-0 right-3 flex items-center divide-x divide-base-300 text-xs">
          {[25, 50, 100].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPercent(p)}
              className={`px-1 ${active === p ? "underline" : ""}`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs opacity-70 mt-1 text-center">≈ ${usd}</div>
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
  <div className="w-full md:w-52 p-5 space-y-4 text-sm bg-base-200/50 border-b md:border-b-0 md:border-r border-base-300/50">
    <div className="text-xs uppercase tracking-wider text-base-content/40 font-medium">Before</div>
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
  hf = 1.9,
  utilization = 65,
  ltv = 75,
  position,
  buildCalls,
  onConfirm,
  renderExtraContent,
}) => {
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const wasOpenRef = useRef(false);
  const parsed = parseFloat(amount || "0");

  const price = token.usdPrice || 0;
  const beforePosition = useMemo(() => position ?? new PositionManager(0, 0), [position]);
  const afterPosition = useMemo(
    () => beforePosition.apply(action, parsed * price),
    [beforePosition, action, parsed, price],
  );

  const beforeHf = position ? beforePosition.healthFactor() : hf;
  const beforeUtil = position ? beforePosition.utilization() : utilization;
  const beforeLtv = position ? beforePosition.loanToValue() : ltv;
  const afterHf = position ? afterPosition.healthFactor() : hf;
  // const afterUtil = position ? afterPosition.utilization() : utilization; // not shown
  const afterLtv = position ? afterPosition.loanToValue() : ltv;

  // Override defaults for Deposit with no debt: HF = ∞, LTV = 0%
  const isDepositNoDebtFallback = action === "Deposit" && !position;
  const beforeHfEffective = isDepositNoDebtFallback ? Infinity : beforeHf;
  const beforeLtvEffective = isDepositNoDebtFallback ? 0 : beforeLtv;
  const afterHfEffective = isDepositNoDebtFallback ? Infinity : afterHf;
  const afterLtvEffective = isDepositNoDebtFallback ? 0 : afterLtv;

  const effectiveMax = useMemo(() => {
    if (action !== "Borrow" || !position || !token.usdPrice) return max;
    const decimals = token.decimals || 18;
    const freeUsd = position.freeBorrowUsd();
    if (freeUsd <= 0 || token.usdPrice === 0) return 0n;
    const amount = Math.floor((freeUsd / token.usdPrice) * 10 ** decimals);
    return BigInt(amount);
  }, [action, position, token.usdPrice, token.decimals, max]);

  // Check if user has insufficient funds for Repay action
  // Re-checks whenever amount, balance, or token decimals change
  const insufficientFunds = useMemo(() => {
    if (action !== "Repay" || !amount || amount.trim() === "") return false;
    const decimals = token.decimals || 18;
    try {
      const parsedAmount = parseUnits(amount, decimals);
      return parsedAmount > balance;
    } catch {
      // If parsing fails (invalid input), don't show insufficient funds
      return false;
    }
  }, [action, amount, balance, token.decimals]);

  const afterValue = useMemo(() => {
    switch (action) {
      case "Borrow":
      case "Deposit":
        return before + parsed;
      case "Withdraw":
      case "Repay":
        return Math.max(0, before - parsed);
      default:
        return before;
    }
  }, [action, before, parsed]);

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

  const handleClose = () => {
    setAmount("");
    setIsMax(false);
    setTxState("idle");
    onClose();
  };

  const handleConfirm = async () => {
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
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="modal-box relative max-w-2xl p-0 rounded-xl overflow-hidden bg-base-100 border border-base-300/50">
        <div className="flex flex-col md:flex-row">
          <LeftMetrics
            hf={beforeHfEffective}
            utilization={beforeUtil}
            ltv={beforeLtvEffective}
            metricLabel={metricLabel}
            metricValue={before}
            token={token}
          />
          <div className="flex-1 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Image src={token.icon} alt={token.name} width={28} height={28} className="rounded-full" />
                <h3 className="font-semibold text-lg text-base-content">
                  {action} {token.name}
                </h3>
              </div>
              {protocolName && <div className="text-xs text-base-content/40 uppercase tracking-wider">{protocolName}</div>}
            </div>
            <div className="flex items-center justify-between text-xs text-base-content/70">
              <span>
                {apyLabel} {formatRate(apy)}%
              </span>
              <span>Balance: {format(Number(formatUnits(balance, token.decimals || 18)))}</span>
            </div>
            <PercentInput
              balance={balance}
              decimals={token.decimals || 18}
              price={token.usdPrice}
              onChange={(val, maxed) => {
                setAmount(val);
                setIsMax(maxed);
              }}
              percentBase={percentBase ?? (action === "Borrow" ? effectiveMax : undefined)}
              max={effectiveMax}
              resetTrigger={isOpen}
              insufficientFunds={insufficientFunds}
            />
            {(() => {
              const hfTextColor = !Number.isFinite(afterHfEffective)
                ? "text-success"
                : afterHfEffective >= 4
                  ? "text-success"
                  : afterHfEffective > 2
                    ? "text-warning"
                    : "text-error";
              const thirdLabel = action === "Borrow" || action === "Repay" ? "Debt" : "Balance";
              return (
                <div className="text-xs pt-2">
                  <div className="grid grid-cols-3">
                    <div className="text-center opacity-70">Health Factor</div>
                    <div className="text-center opacity-70 border-l border-base-300">Loan To Value</div>
                    <div className="text-center opacity-70 border-l border-base-300">{thirdLabel}</div>
                  </div>
                  <div className="grid grid-cols-3 items-center mt-1">
                    <div className={`text-center ${hfTextColor}`}>{Number.isFinite(afterHfEffective) ? afterHfEffective.toFixed(2) : "∞"}</div>
                    <div className="text-center border-l border-base-300">{formatPercentage(afterLtvEffective)}%</div>
                    <div className="flex items-center justify-center gap-2 border-l border-base-300">
                      <TokenPill value={afterValue} icon={token.icon} name={token.name} />
                    </div>
                  </div>
                </div>
              );
            })()}
            {renderExtraContent && renderExtraContent()}
            <div className="modal-action pt-2">
              <SegmentedActionBar
                className="w-full"
                autoCompact
                actions={[
                  {
                    key: txState === "success" ? "close" : "confirm",
                    label: txState === "pending" ? "Submitting..." : txState === "success" ? "Close" : txState === "error" ? "Retry" : action,
                    icon:
                      txState === "pending" ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : network === "stark" ? (
                        <FaGasPump className="text-gray-400" />
                      ) : undefined,
                    onClick: handleConfirm,
                    disabled: txState === "pending" || insufficientFunds,
                    variant: "ghost",
                  },
                ]}
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
  const [amount, setAmount] = useState("");
  const parsed = parseFloat(amount || "0");

  const price = token.usdPrice || 0;
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

  const isDepositNoDebtFallback = action === "Deposit" && !position;
  const beforeHfEffective = isDepositNoDebtFallback ? Infinity : beforeHf;
  const beforeLtvEffective = isDepositNoDebtFallback ? 0 : beforeLtv;
  const afterHfEffective = isDepositNoDebtFallback ? Infinity : afterHf;
  const afterLtvEffective = isDepositNoDebtFallback ? 0 : afterLtv;

  const effectiveMax = useMemo(() => {
    if (action !== "Borrow" || !position || !token.usdPrice) return max;
    const decimals = token.decimals || 18;
    const freeUsd = position.freeBorrowUsd();
    if (freeUsd <= 0 || token.usdPrice === 0) return 0n;
    const amount = Math.floor((freeUsd / token.usdPrice) * 10 ** decimals);
    return BigInt(amount);
  }, [action, position, token.usdPrice, token.decimals, max]);

  const afterValue = useMemo(() => {
    switch (action) {
      case "Borrow":
      case "Deposit":
        return before + parsed;
      case "Withdraw":
      case "Repay":
        return Math.max(0, before - parsed);
      default:
        return before;
    }
  }, [action, before, parsed]);

  return (
    <div className="card bg-base-100 border border-base-300 rounded-none overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <LeftMetrics
          hf={beforeHfEffective}
          utilization={beforeUtil}
          ltv={beforeLtvEffective}
          metricLabel={metricLabel}
          metricValue={before}
          token={token}
        />
        <div className="flex-1 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xl">{action} {token.name}</h3>
              <Image src={token.icon} alt={token.name} width={32} height={32} />
            </div>
            {protocolName && <div className="text-sm text-base-content/70">{protocolName}</div>}
          </div>
          <div className="flex items-center justify-between text-xs text-base-content/70">
            <span>{apyLabel} {formatRate(apy)}</span>
            <span>Balance: {format(Number(formatUnits(balance, token.decimals || 18)))}</span>
          </div>
          <PercentInput
            balance={balance}
            decimals={token.decimals || 18}
            price={token.usdPrice}
            onChange={(val) => { setAmount(val); }}
            percentBase={percentBase ?? (action === "Borrow" ? effectiveMax : undefined)}
            max={effectiveMax}
            resetTrigger={true}
          />
          {(() => {
            const hfTextColor = !Number.isFinite(afterHfEffective)
              ? "text-success"
              : afterHfEffective >= 4
                ? "text-success"
                : afterHfEffective > 2
                  ? "text-warning"
                  : "text-error";
            const thirdLabel = action === "Borrow" || action === "Repay" ? "Debt" : "Balance";
            return (
              <div className="text-xs pt-2">
                <div className="grid grid-cols-3">
                  <div className="text-center opacity-70">Health Factor</div>
                  <div className="text-center opacity-70 border-l border-base-300">Loan To Value</div>
                  <div className="text-center opacity-70 border-l border-base-300">{thirdLabel}</div>
                </div>
                <div className="grid grid-cols-3 items-center mt-1">
                  <div className={`text-center ${hfTextColor}`}>{Number.isFinite(afterHfEffective) ? afterHfEffective.toFixed(2) : "∞"}</div>
                  <div className="text-center border-l border-base-300">{formatPercentage(afterLtvEffective)}%</div>
                  <div className="flex items-center justify-center gap-2 border-l border-base-300">
                    <TokenPill value={afterValue} icon={token.icon} name={token.name} />
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="pt-2">
            <SegmentedActionBar
              className="w-full"
              autoCompact
              actions={[{ key: "confirm", label: action, onClick: () => { console.debug("Demo confirm disabled"); }, disabled: true, variant: "ghost" as const }]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
