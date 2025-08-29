import { FC, useState } from "react";
import Image from "next/image";
import { FaGasPump } from "react-icons/fa";
import { formatUnits, parseUnits } from "viem";

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
  gasCostUsd?: number;
  hf?: number;
  utilization?: number;
  ltv?: number;
  onConfirm?: (amount: string, isMax?: boolean) => Promise<unknown> | void;
}

const format = (num: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);

const HealthFactor = ({ value }: { value: number }) => {
  const percent = Math.min(100, (value / 3) * 100);
  const color = value > 2 ? "text-success" : value > 1.2 ? "text-warning" : "text-error";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span>Health Factor</span>
      <progress className="progress w-20" value={percent} max="100"></progress>
      <span className={color}>{value.toFixed(2)}</span>
    </div>
  );
};

const Utilization = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2 text-xs">
    <span>Utilization</span>
    <progress className="progress progress-primary w-20" value={value} max="100"></progress>
    <span>{value}%</span>
  </div>
);

const LoanToValue = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2 text-xs">
    <span>Loan to Value</span>
    <span>{value}%</span>
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
  max?: bigint;
}> = ({ balance, decimals, price = 0, onChange, max }) => {
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const setPercent = (p: number) => {
    const base = max ?? balance;
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
    const base = max ?? balance;
    let isMax = false;
    if (parsed >= base) {
      parsed = base;
      val = formatUnits(base, decimals);
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
      <div className="flex justify-between text-xs opacity-70 mt-1">
        <span>≈ ${usd}</span>
        <span>Balance: {format(Number(formatUnits(balance, decimals)))} </span>
      </div>
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
  gasCostUsd = 0,
  hf = 1.9,
  utilization = 65,
  ltv = 75,
  onConfirm,
}) => {
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [txState, setTxState] = useState<"idle" | "pending" | "success">("idle");

  const parsed = parseFloat(amount || "0");
  const afterValue = (() => {
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
  })();

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
            hf={hf}
            utilization={utilization}
            ltv={ltv}
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
            <div className="badge badge-outline text-xs w-max">
              {apyLabel} {apy}%
            </div>
            <PercentInput
              balance={balance}
              decimals={token.decimals || 18}
              price={token.usdPrice}
              onChange={(val, max) => {
                setAmount(val);
                setIsMax(max);
              }}
              max={percentBase}
            />
            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <HealthFactor value={hf} />
              <Utilization value={utilization} />
              <LoanToValue value={ltv} />
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
                <span className="flex items-center gap-1 text-xs">
                  <FaGasPump /> ${gasCostUsd < 0.01 ? gasCostUsd.toFixed(4) : gasCostUsd.toFixed(2)}
                </span>
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
