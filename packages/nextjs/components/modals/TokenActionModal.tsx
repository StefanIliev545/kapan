import { FC, useState } from "react";
import Image from "next/image";
import { FaGasPump } from "react-icons/fa";

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
  after: number;
  balance: number;
  gasCostUsd?: number;
  hf?: number;
  newHf?: number;
  utilization?: number;
  newUtilization?: number;
  ltv?: number;
  newLtv?: number;
  onConfirm?: (amount: string) => void;
}

const format = (num: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);

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

const PercentInput: FC<{ balance: number; price?: number; onChange: (v: string) => void }> = ({ balance, price = 0, onChange }) => {
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const setPercent = (p: number) => {
    const val = ((balance * p) / 100).toString();
    setAmount(val);
    setActive(p);
    onChange(val);
  };
  const usd = (parseFloat(amount || "0") * price).toFixed(2);
  return (
    <>
      <div className="relative">
        <input
          type="number"
          value={amount}
          onChange={e => {
            setAmount(e.target.value);
            setActive(null);
            onChange(e.target.value);
          }}
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
        <span>Balance: {format(balance)}</span>
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
  after,
  balance,
  gasCostUsd = 0,
  hf = 1.9,
  newHf = 2.1,
  utilization = 65,
  newUtilization = 65,
  ltv = 75,
  newLtv = 75,
  onConfirm,
}) => {
  const [amount, setAmount] = useState("");

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
            <PercentInput balance={balance} price={token.usdPrice} onChange={setAmount} />
            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <HealthFactor value={newHf} />
              <Utilization value={newUtilization} />
              <LoanToValue value={newLtv} />
              <div className="flex items-center gap-2">
                <span>{metricLabel}</span>
                <TokenPill value={after} icon={token.icon} name={token.name} />
              </div>
            </div>
            <div className="modal-action pt-2">
              <button
                className="btn btn-primary w-full flex justify-between"
                onClick={() => {
                  onConfirm?.(amount);
                  onClose();
                }}
              >
                <span>{action}</span>
                <span className="flex items-center gap-1 text-xs">
                  <FaGasPump /> ${gasCostUsd.toFixed(2)}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};

