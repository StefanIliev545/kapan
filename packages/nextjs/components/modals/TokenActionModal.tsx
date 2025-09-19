import { FC, useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { FaGasPump } from "react-icons/fa";
import type { Call } from "starknet";
import { formatUnits, parseUnits } from "viem";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import type { Network } from "~~/hooks/useTokenBalance";
import formatPercentage from "~~/utils/formatPercentage";
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
}

const format = (num: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);

const formatApy = (apy: number) => (apy < 1 ? apy.toFixed(4) : apy.toFixed(2));

const HealthFactor = ({ value }: { value: number }) => {
  const percent = Math.min(100, Math.max(0, ((value - 1) / 3) * 100));
  const barColor = value >= 4 ? "progress-success" : value > 2 ? "progress-warning" : "progress-error";
  const textColor = value >= 4 ? "text-success" : value > 2 ? "text-warning" : "text-error";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span>Health Factor</span>
      <progress className={`progress w-20 ${barColor}`} value={percent} max="100"></progress>
      <span className={textColor}>{value.toFixed(2)}</span>
    </div>
  );
};

const Utilization = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2 text-xs">
    <span>Utilization</span>
    <progress className="progress progress-primary w-20" value={value} max="100"></progress>
    <span>{formatPercentage(value)}%</span>
  </div>
);

const LoanToValue = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2 text-xs">
    <span>Loan to Value</span>
    <span>{formatPercentage(value)}%</span>
  </div>
);

const TokenPill = ({ value, icon, name }: { value: number; icon: string; name: string }) => (
  <div className="badge badge-outline gap-1">
    <Image src={icon} alt={name} width={12} height={12} />
    {format(value)}
  </div>
);

const PercentInput: FC<{
  balance: bigint;
  decimals: number;
  price?: number;
  onChange: (v: string, isMax: boolean) => void;
  percentBase?: bigint;
  max?: bigint;
}> = ({ balance, decimals, price = 0, onChange, percentBase, max }) => {
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<number | null>(null);
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
    let isMax = false;
    if (limit > 0n && parsed >= limit) {
      parsed = limit;
      val = formatUnits(limit, decimals);
      isMax = true;
    } else if (base > 0n && parsed >= base) {
      isMax = true;
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
          className="input input-bordered w-full pr-24"
        />
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

const LeftMetrics: FC<{
  hf: number;
  utilization: number;
  ltv: number;
  metricLabel: string;
  metricValue: number;
  token: TokenInfo;
}> = ({ hf, utilization, ltv, metricLabel, metricValue, token }) => (
  <div className="w-full md:w-56 p-6 space-y-3 text-sm bg-base-200 border-b md:border-b-0 md:border-r border-base-300">
    <div className="font-semibold mb-2">Before</div>
    <div className="space-y-2 text-xs">
      <HealthFactor value={hf} />
      <Utilization value={utilization} />
      <LoanToValue value={ltv} />
      <div className="flex items-center gap-2">
        <span>{metricLabel}</span>
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
}) => {
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [txState, setTxState] = useState<"idle" | "pending" | "success">("idle");
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
  const afterUtil = position ? afterPosition.utilization() : utilization;
  const afterLtv = position ? afterPosition.loanToValue() : ltv;

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

  const buildCallsForEstimate = useCallback(() => {
    if (!buildCalls) return null;
    return buildCalls(amount, isMax);
  }, [buildCalls, amount, isMax]);

  const {
    loading: feeLoading,
    error: feeError,
    effectiveNative,
    effectiveCurrency,
  } = useGasEstimate({
    enabled: isOpen && network === "stark",
    buildCalls: buildCallsForEstimate,
    currency: "STRK",
  });

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
      await onConfirm?.(amount, isMax);
      setTxState("success");
    } catch (e) {
      console.error(e);
      setTxState("idle");
    }
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <LeftMetrics
            hf={beforeHf}
            utilization={beforeUtil}
            ltv={beforeLtv}
            metricLabel={metricLabel}
            metricValue={before}
            token={token}
          />
          <div className="flex-1 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Image src={token.icon} alt={token.name} width={32} height={32} />
              <div>
                <h3 className="font-bold text-xl">
                  {action} {token.name}
                </h3>
                {protocolName && <div className="text-xs opacity-70">{protocolName}</div>}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="badge badge-outline">
                {apyLabel} {formatApy(apy)}%
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
            />
            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <HealthFactor value={afterHf} />
              <Utilization value={afterUtil} />
              <LoanToValue value={afterLtv} />
              <div className="flex items-center gap-2">
                <span>{metricLabel}</span>
                <TokenPill value={afterValue} icon={token.icon} name={token.name} />
              </div>
            </div>
            <div className="modal-action pt-2">
              <button
                className={`btn w-full flex justify-between ${txState === "success" ? "btn-success" : "btn-primary"}`}
                onClick={handleConfirm}
                disabled={txState === "pending"}
              >
                <span>
                  {txState === "pending" ? (
                    <span className="loading loading-spinner"></span>
                  ) : txState === "success" ? (
                    "Close"
                  ) : (
                    action
                  )}
                </span>
                {network === "stark" && (
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump className="text-gray-400" />
                    {feeLoading && effectiveNative === null ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : feeError ? null : effectiveNative !== null ? (
                      <span>
                        {effectiveNative.toFixed(4)} {effectiveCurrency ?? "STRK"}
                      </span>
                    ) : null}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={handleClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};
