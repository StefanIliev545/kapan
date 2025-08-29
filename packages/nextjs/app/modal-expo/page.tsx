"use client";

import Image from "next/image";
import { useState } from "react";
import { FaGasPump } from "react-icons/fa";

const mock = {
  token: { name: "USDC", icon: "/logos/usdc.svg" },
  walletBalance: 1234.56,
  price: 1.0,
  borrowApy: 6.1,
  ltv: 75,
  hf: 1.9,
  newHf: 2.1,
  utilization: 65,
  totalDebt: 400,
  newTotalDebt: 450,
  gasCostUsd: 1.23,
};

const format = (num: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);

const PercentInput = ({ balance }: { balance: number }) => {
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const setPercent = (p: number) => {
    setAmount(((balance * p) / 100).toString());
    setActive(p);
  };
  const usd = (parseFloat(amount || "0") * mock.price).toFixed(2);
  return (
    <>
      <div className="relative">
        <input
          type="number"
          value={amount}
          onChange={e => {
            setAmount(e.target.value);
            setActive(null);
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
        <span>
          Balance: {format(balance)} {mock.token.name}
        </span>
      </div>
    </>
  );
};

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

const DebtPill = ({ value }: { value: number }) => (
  <div className="badge badge-outline gap-1">
    <Image src={mock.token.icon} alt={mock.token.name} width={12} height={12} />
    {format(value)}
  </div>
);

const LeftMetrics = ({ className = "" }: { className?: string }) => (
  <div className={`w-full md:w-56 p-6 space-y-3 text-sm ${className}`}>
    <div className="font-semibold mb-2">Before</div>
    <div className="space-y-2 text-xs">
      <HealthFactor value={mock.hf} />
      <Utilization value={mock.utilization} />
      <LoanToValue value={mock.ltv} />
      <div className="flex items-center gap-2">
        <span>Debt</span>
        <DebtPill value={mock.totalDebt} />
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                Variant A                                  */
/* -------------------------------------------------------------------------- */
const VariantA = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Classic layout</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <LeftMetrics className="bg-base-200 border-b md:border-b-0 md:border-r border-base-300" />
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
                <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              </div>
              <div className="badge badge-outline text-xs w-max">Borrow APY {mock.borrowApy}%</div>
              <PercentInput balance={mock.walletBalance} />
              <div className="space-y-2 text-xs pt-2">
                <div className="font-semibold mb-1">After</div>
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <LoanToValue value={mock.ltv - 10} />
                <div className="flex items-center gap-2">
                  <span>Debt</span>
                  <DebtPill value={mock.newTotalDebt} />
                </div>
              </div>
              <div className="modal-action pt-4">
                <button className="btn btn-primary w-full flex justify-between">
                  <span>Execute</span>
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump /> ${mock.gasCostUsd}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={() => setOpen(false)}>
          <button>close</button>
        </form>
      </dialog>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Variant B                                  */
/* -------------------------------------------------------------------------- */
const VariantB = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Colored column</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <LeftMetrics className="bg-primary/10 border-b md:border-b-0 md:border-r border-primary/20" />
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
                <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              </div>
              <PercentInput balance={mock.walletBalance} />
              <div className="space-y-2 text-xs pt-2">
                <div className="font-semibold mb-1">After</div>
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <LoanToValue value={mock.ltv - 10} />
                <div className="flex items-center gap-2">
                  <span>Debt</span>
                  <DebtPill value={mock.newTotalDebt} />
                </div>
              </div>
              <div className="modal-action pt-4">
                <button className="btn btn-primary w-full flex justify-between">
                  <span>Execute</span>
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump /> ${mock.gasCostUsd}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={() => setOpen(false)}>
          <button>close</button>
        </form>
      </dialog>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Variant C                                  */
/* -------------------------------------------------------------------------- */
const VariantC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Pill metrics</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

  <dialog className={`modal ${open ? "modal-open" : ""}`}>
    <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <LeftMetrics className="bg-base-200 border-b md:border-b-0 md:border-r border-base-300 space-y-4" />
        <div className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
            <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
          </div>
          <PercentInput balance={mock.walletBalance} />
          <div className="grid grid-cols-2 gap-2 text-xs pt-2">
            <HealthFactor value={mock.newHf} />
            <Utilization value={mock.utilization} />
            <LoanToValue value={mock.ltv - 10} />
            <div className="flex items-center gap-2 col-span-2">
              <span>Debt</span>
              <DebtPill value={mock.newTotalDebt} />
            </div>
          </div>
          <div className="modal-action pt-2">
            <button className="btn btn-primary w-full flex justify-between">
              <span>Execute</span>
              <span className="flex items-center gap-1 text-xs">
                <FaGasPump /> ${mock.gasCostUsd}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <form method="dialog" className="modal-backdrop" onClick={() => setOpen(false)}>
      <button>close</button>
    </form>
  </dialog>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Variant D                                  */
/* -------------------------------------------------------------------------- */
const VariantD = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Rounded edges</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-2xl overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <LeftMetrics className="bg-base-200 border-b md:border-b-0 md:border-r border-base-300" />
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
                <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              </div>
              <PercentInput balance={mock.walletBalance} />
              <div className="space-y-2 text-xs pt-2">
                <div className="font-semibold mb-1">After</div>
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <LoanToValue value={mock.ltv - 10} />
                <div className="flex items-center gap-2">
                  <span>Debt</span>
                  <DebtPill value={mock.newTotalDebt} />
                </div>
              </div>
              <div className="modal-action pt-4">
                <button className="btn btn-primary w-full flex justify-between">
                  <span>Execute</span>
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump /> ${mock.gasCostUsd}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={() => setOpen(false)}>
          <button>close</button>
        </form>
      </dialog>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Variant E                                  */
/* -------------------------------------------------------------------------- */
const VariantE = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Minimal</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <LeftMetrics className="bg-base-200 border-b md:border-b-0 md:border-r border-base-300" />
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
                <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              </div>
              <PercentInput balance={mock.walletBalance} />
              <div className="space-y-2 text-xs pt-2">
                <div className="font-semibold mb-1">After</div>
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <LoanToValue value={mock.ltv - 10} />
                <div className="flex items-center gap-2">
                  <span>Debt</span>
                  <DebtPill value={mock.newTotalDebt} />
                </div>
              </div>
              <div className="modal-action pt-2">
                <button className="btn btn-primary w-full flex justify-between">
                  <span>Execute</span>
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump /> ${mock.gasCostUsd}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={() => setOpen(false)}>
          <button>close</button>
        </form>
      </dialog>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Modal Expo Page                               */
/* -------------------------------------------------------------------------- */
const ModalExpoPage = () => {
  const variants = [VariantA, VariantB, VariantC, VariantD, VariantE];
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Modal Design Expo</h1>
      <p className="text-sm opacity-70">Mocked data to experiment with lending flow layouts.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {variants.map((Variant, i) => (
          <Variant key={i} />
        ))}
      </div>
    </div>
  );
};

export default ModalExpoPage;

