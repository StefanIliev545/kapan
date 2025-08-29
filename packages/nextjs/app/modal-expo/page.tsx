"use client";

import Image from "next/image";
import { useState } from "react";
import { FiPieChart, FiTrendingUp, FiArrowRight } from "react-icons/fi";
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
      <div className="text-xs opacity-70 mt-1">≈ ${usd}</div>
    </>
  );
};

const HealthFactor = ({ value }: { value: number }) => {
  const percent = Math.min(100, (value / 3) * 100);
  const color = value > 2 ? "text-success" : value > 1.2 ? "text-warning" : "text-error";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span>HF</span>
      <progress className="progress w-20" value={percent} max="100"></progress>
      <span className={color}>{value.toFixed(2)}</span>
    </div>
  );
};

const Utilization = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2 text-xs">
    <span>Util</span>
    <progress className="progress progress-primary w-20" value={value} max="100"></progress>
    <span>{value}%</span>
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
          <h2 className="card-title">Sidebar analytics</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
                <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              </div>
              <div className="flex gap-2 text-xs">
                <div className="badge badge-outline">APY {mock.borrowApy}%</div>
                <HealthFactor value={mock.hf} />
              </div>
              <div className="form-control pt-2">
                <label className="label justify-between">
                  <span>Amount</span>
                  <span className="text-xs opacity-60">Price ${mock.price}</span>
                </label>
                <PercentInput balance={mock.walletBalance} />
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
            <div className="w-full md:w-56 bg-base-200 p-6 space-y-3 text-sm border-t md:border-t-0 md:border-l border-base-300">
              <div className="font-semibold mb-2 underline decoration-primary">After</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv - 10}%</div>
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <div className="flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.totalDebt)} <FiArrowRight /> {format(mock.newTotalDebt)}</div>
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
          <h2 className="card-title">Bottom metrics</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-lg p-0 rounded-none overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
              <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
            </div>
            <div className="form-control">
              <label className="label justify-between">
                <span>Amount</span>
                <span className="text-xs opacity-60">Wallet {format(mock.walletBalance)}</span>
              </label>
              <PercentInput balance={mock.walletBalance} />
            </div>
          </div>
          <div className="bg-base-200 p-6 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <HealthFactor value={mock.newHf} />
              <Utilization value={mock.utilization} />
            </div>
            <div className="flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.totalDebt)} <FiArrowRight /> {format(mock.newTotalDebt)}</div>
            <div className="flex justify-between items-center pt-1">
              <div className="badge badge-outline">APY {mock.borrowApy}%</div>
              <button className="btn btn-primary btn-sm flex gap-1">
                <span>Execute</span>
                <span className="flex items-center gap-1 text-xs">
                  <FaGasPump /> ${mock.gasCostUsd}
                </span>
              </button>
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
          <h2 className="card-title">Before & After cards</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
              <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
            </div>
            <div className="form-control pt-2">
              <label className="label justify-between">
                <span>Amount</span>
                <span className="text-xs opacity-60">Price ${mock.price}</span>
              </label>
              <PercentInput balance={mock.walletBalance} />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 text-xs">
              <div className="p-3 bg-base-200 rounded space-y-1">
                <div className="font-semibold mb-1">Before</div>
                <HealthFactor value={mock.hf} />
                <Utilization value={mock.utilization} />
                <div className="flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.totalDebt)}</div>
              </div>
              <div className="p-3 bg-base-200 rounded space-y-1">
                <div className="font-semibold mb-1">After</div>
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <div className="flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.newTotalDebt)}</div>
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
          <h2 className="card-title">Gradient header</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-xl p-0 rounded-2xl overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-primary to-secondary text-primary-content flex items-center gap-3">
            <Image src={mock.token.icon} alt={mock.token.name} width={40} height={40} />
            <div>
              <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              <div className="text-xs">APY {mock.borrowApy}%</div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <PercentInput balance={mock.walletBalance} />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <HealthFactor value={mock.newHf} />
              <Utilization value={mock.utilization} />
              <div className="col-span-2 flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.totalDebt)} <FiArrowRight /> {format(mock.newTotalDebt)}</div>
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
          <h2 className="card-title">Left metrics column</h2>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="w-full md:w-56 bg-base-200 p-6 space-y-3 text-sm border-b md:border-b-0 md:border-r border-base-300">
              <div className="font-semibold mb-2 underline decoration-primary">Before</div>
              <div className="space-y-1 text-xs">
                <HealthFactor value={mock.hf} />
                <Utilization value={mock.utilization} />
                <div className="flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.totalDebt)}</div>
              </div>
            </div>
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
                <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              </div>
              <PercentInput balance={mock.walletBalance} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <HealthFactor value={mock.newHf} />
                <Utilization value={mock.utilization} />
                <div className="col-span-2 flex items-center gap-1"><FiTrendingUp /> Debt {format(mock.totalDebt)} <FiArrowRight /> {format(mock.newTotalDebt)}</div>
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

