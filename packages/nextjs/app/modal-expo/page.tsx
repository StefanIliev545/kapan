"use client";

import Image from "next/image";
import { useState } from "react";
import {
  FiActivity,
  FiArrowRight,
  FiDollarSign,
  FiPieChart,
  FiTrendingUp,
  FiZap,
} from "react-icons/fi";
import { FaGasPump } from "react-icons/fa";

// Shared mocked data for modal prototypes
const mock = {
  token: { name: "USDC", icon: "/logos/usdc.svg" },
  walletBalance: 1234.56,
  supplyApy: 4.3,
  borrowApy: 6.1,
  ltv: 75,
  healthFactor: 1.9,
  newHealthFactor: 2.1,
  gasCostUsd: 1.23,
  tokenPrice: 1.0,
  poolLiquidity: 1_000_000,
  utilization: 65,
};

const format = (num: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);

// Token input with inline percent shortcuts and USD helper
const PercentInput = ({
  balance,
  options = [25, 50, 100],
}: {
  balance: number;
  options?: number[];
}) => {
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<number | null>(null);

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
          {options.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setAmount(((balance * p) / 100).toString());
                setActive(p);
              }}
              className={`px-1 ${active === p ? "underline" : ""}`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs opacity-70 mt-1">
        ≈ ${(parseFloat(amount || "0") * mock.tokenPrice).toFixed(2)}
      </div>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                 Variant One                                */
/* -------------------------------------------------------------------------- */
// Gradient header + metrics grid
const VariantOne = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-primary text-primary-content">
        <div className="card-body">
          <h2 className="card-title">Gradient header</h2>
          <p className="text-sm opacity-80">Hero style with key metrics</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box p-0 max-w-md overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-primary to-secondary text-primary-content flex items-center gap-4">
            <div className="avatar">
              <div className="w-14 h-14 rounded-full ring ring-offset-2 ring-primary-content/30 bg-base-100">
                <Image src={mock.token.icon} alt={mock.token.name} width={56} height={56} />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold">Deposit {mock.token.name}</h3>
              <p className="text-xs opacity-80">Supply APY {mock.supplyApy}%</p>
            </div>
            <button
              className="btn btn-sm btn-circle btn-ghost ml-auto"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="form-control">
              <label className="label justify-between">
                <span>Amount</span>
                <span className="text-xs opacity-60">
                  Wallet: {format(mock.walletBalance)}
                </span>
              </label>
              <input
                type="number"
                className="input input-bordered w-full"
                placeholder="0.0"
              />
              <div className="mt-2 flex gap-2">
                {[25, 50, 100].map(p => (
                  <button key={p} className="btn btn-outline btn-xs">
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <FiDollarSign />
                <span className="opacity-70">Wallet</span>
                <span className="ml-auto">{format(mock.walletBalance)}</span>
              </div>
              <div className="flex items-center gap-2">
                <FiTrendingUp />
                <span className="opacity-70">APY</span>
                <span className="ml-auto">{mock.supplyApy}%</span>
              </div>
              <div className="flex items-center gap-2">
                <FiDollarSign />
                <span className="opacity-70">Price</span>
                <span className="ml-auto">${mock.tokenPrice}</span>
              </div>
              <div className="flex items-center gap-2">
                <FiZap />
                <span className="opacity-70">Gas est.</span>
                <span className="ml-auto">${mock.gasCostUsd}</span>
              </div>
            </div>

            <div className="modal-action">
              <button className="btn btn-primary w-full flex justify-between">
                <span>Confirm deposit</span>
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
/*                                Variant Two                                 */
/* -------------------------------------------------------------------------- */
// Before/after metrics comparison
const VariantTwo = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-secondary text-secondary-content">
        <div className="card-body">
          <h2 className="card-title">Before / After</h2>
          <p className="text-sm opacity-80">Compare positions</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-md rounded-3xl">
          <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
            <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
            Supply {mock.token.name}
          </h3>

          <div className="form-control mb-6">
            <label className="label justify-between">
              <span>Amount</span>
              <span className="text-xs opacity-60">LTV {mock.ltv}%</span>
            </label>
            <PercentInput balance={mock.walletBalance} options={[25, 50, 75, 100]} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-base-200 rounded-xl p-4 space-y-2">
              <div className="badge badge-outline">Current</div>
              <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv}%</div>
              <progress
                className="progress progress-secondary w-full"
                value={mock.ltv}
                max="100"
              ></progress>
              <div className="flex items-center gap-1"><FiActivity /> HF {mock.healthFactor}</div>
            </div>
            <div className="bg-base-200 rounded-xl p-4 space-y-2">
              <div className="badge badge-outline">After</div>
              <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv - 5}%</div>
              <progress
                className="progress progress-secondary w-full"
                value={mock.ltv - 5}
                max="100"
              ></progress>
              <div className="flex items-center gap-1"><FiActivity /> HF {mock.newHealthFactor}</div>
            </div>
          </div>

          <div className="mt-4 flex justify-between text-sm opacity-80">
            <span className="flex items-center gap-1">
              <FaGasPump /> ${mock.gasCostUsd}
            </span>
            <span className="flex items-center gap-1">
              <FiDollarSign /> ${format(mock.poolLiquidity)} pool
            </span>
          </div>

          <div className="modal-action">
            <button className="btn btn-secondary w-full flex justify-between">
              <span>Confirm supply</span>
              <span className="flex items-center gap-1 text-xs">
                <FaGasPump /> ${mock.gasCostUsd}
              </span>
            </button>
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
/*                               Variant Three                                */
/* -------------------------------------------------------------------------- */
// Sidebar analytics panel
const VariantThree = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-accent text-accent-content">
        <div className="card-body">
          <h2 className="card-title">Sidebar stats</h2>
          <p className="text-sm opacity-80">Risk panel to the right</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex">
            <div className="flex-1 p-6 space-y-4">
              <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              <div className="form-control">
                <label className="label justify-between">
                  <span>Amount</span>
                  <span className="text-xs opacity-60">Price ${mock.tokenPrice}</span>
                </label>
                <PercentInput balance={mock.walletBalance} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <FiTrendingUp /> Borrow APY {mock.borrowApy}%
                </div>
                <div className="flex items-center gap-1">
                  <FiPieChart /> LTV {mock.ltv}%
                </div>
              </div>

              <div className="modal-action pt-4">
                <button className="btn btn-accent w-full flex justify-between">
                  <span>Confirm borrow</span>
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump /> ${mock.gasCostUsd}
                  </span>
                </button>
              </div>
            </div>

            <div className="w-60 bg-base-200 p-6 space-y-3 text-sm">
              <div className="font-semibold mb-2">Risk &amp; stats</div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <FiActivity /> HF {mock.healthFactor} → {mock.newHealthFactor}
                </div>
                <div className="flex items-center gap-1">
                  <FiTrendingUp /> Util {mock.utilization}%
                </div>
                <div className="flex items-center gap-1">
                  <FaGasPump /> ${mock.gasCostUsd}
                </div>
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
/*                                Variant Four                                */
/* -------------------------------------------------------------------------- */
// Stepper flow with progress indication
const VariantFour = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-info text-info-content">
        <div className="card-body">
          <h2 className="card-title">Stepper flow</h2>
          <p className="text-sm opacity-80">Multi-step repay</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-lg rounded-2xl">
          <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
            <FiDollarSign /> Repay {mock.token.name}
          </h3>

          <ul className="steps mb-6">
            <li className="step step-primary" data-content="1"></li>
            <li className="step" data-content="2"></li>
            <li className="step" data-content="3"></li>
          </ul>

          <div className="form-control">
            <label className="label justify-between">
              <span>Amount</span>
              <span className="text-xs opacity-60">
                Wallet {format(mock.walletBalance)}
              </span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder="0.0"
            />
            <div className="mt-2 flex gap-2">
              {[25, 50, 100].map(p => (
                <button key={p} className="btn btn-outline btn-xs">
                  {p}%
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 text-sm space-y-1 opacity-80">
            <div className="flex items-center gap-1">
              <FiActivity /> HF → {mock.newHealthFactor}
            </div>
          </div>

          <div className="modal-action">
            <button className="btn btn-info w-full flex justify-between">
              <span>Next step</span>
              <span className="flex items-center gap-1 text-xs">
                <FaGasPump /> ${mock.gasCostUsd}
              </span>
            </button>
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
/*                                 Variant Five                               */
/* -------------------------------------------------------------------------- */
// Tabbed layout for switching metric views
const VariantFive = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"details" | "risk">("details");
  return (
    <>
      <div className="card bg-warning text-warning-content">
        <div className="card-body">
          <h2 className="card-title">Tabbed layout</h2>
          <p className="text-sm opacity-80">Toggle views</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-md rounded-3xl border-2 border-warning">
          <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
            <FiDollarSign /> Withdraw {mock.token.name}
          </h3>

          <div role="tablist" className="tabs tabs-boxed mb-4">
            <a
              role="tab"
              className={`tab ${tab === "details" ? "tab-active" : ""}`}
              onClick={() => setTab("details")}
            >
              Details
            </a>
            <a
              role="tab"
              className={`tab ${tab === "risk" ? "tab-active" : ""}`}
              onClick={() => setTab("risk")}
            >
              Risk
            </a>
          </div>

          <div className="form-control mb-4">
            <label className="label justify-between">
              <span>Amount</span>
              <span className="text-xs opacity-60">
                Wallet {format(mock.walletBalance)}
              </span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder="0.0"
            />
            <div className="mt-2 flex gap-2">
              {[25, 50, 100].map(p => (
                <button key={p} className="btn btn-outline btn-xs">
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {tab === "details" ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-1">
                <FiDollarSign /> Liquidity ${format(mock.poolLiquidity)}
              </div>
              <div className="flex items-center gap-1">
                <FiTrendingUp /> APY {mock.supplyApy}%
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-1">
                <FiActivity /> HF {mock.healthFactor} → {mock.newHealthFactor}
              </div>
              <div className="flex items-center gap-1">
                <FiPieChart /> LTV {mock.ltv}%
              </div>
            </div>
          )}

          <div className="modal-action mt-6">
            <button className="btn btn-warning w-full flex justify-between">
              <span>Confirm withdraw</span>
              <span className="flex items-center gap-1 text-xs">
                <FaGasPump /> ${mock.gasCostUsd}
              </span>
            </button>
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
/*                                 Variant Six                                */
/* -------------------------------------------------------------------------- */
// Summary row + progress bar
const VariantSix = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-success text-success-content">
        <div className="card-body">
          <h2 className="card-title">Analytics row</h2>
          <p className="text-sm opacity-80">Top metrics & progress</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-xl rounded-xl">
          <h3 className="font-bold text-xl mb-6">Deposit {mock.token.name}</h3>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1">
              <FiActivity /> HF {mock.healthFactor}
            </div>
            <div className="flex items-center gap-1">
              <FiPieChart /> LTV {mock.ltv}%
            </div>
            <div className="flex items-center gap-1">
              <FaGasPump /> ${mock.gasCostUsd}
            </div>
          </div>

          <progress
            className="progress progress-success w-full"
            value={mock.utilization}
            max="100"
          ></progress>
          <div className="text-xs opacity-70 mt-1">
            Pool utilization {mock.utilization}% ({format(mock.poolLiquidity)} liquidity)
          </div>

          <div className="form-control mt-6">
            <label className="label justify-between">
              <span>Amount</span>
              <span className="text-xs opacity-60">
                Wallet {format(mock.walletBalance)}
              </span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder="0.0"
            />
            <div className="mt-2 flex gap-2">
              {[25, 50, 100].map(p => (
                <button key={p} className="btn btn-outline btn-xs">
                  {p}%
                </button>
              ))}
            </div>
          </div>

          <div className="modal-action mt-6">
            <button className="btn btn-success w-full flex justify-between">
              <span>
                Continue <FiArrowRight className="ml-2" />
              </span>
              <span className="flex items-center gap-1 text-xs">
                <FaGasPump /> ${mock.gasCostUsd}
              </span>
            </button>
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
/*                                Variant Seven                               */
/* -------------------------------------------------------------------------- */
// Sidebar + before/after comparison
const VariantSeven = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-neutral text-neutral-content">
        <div className="card-body">
          <h2 className="card-title">Side compare</h2>
          <p className="text-sm opacity-80">Before vs after with stats</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-2xl overflow-hidden">
          <div className="flex">
            <div className="flex-1 p-6 space-y-4">
              <h3 className="font-bold text-xl mb-2">Supply {mock.token.name}</h3>
              <div className="form-control">
                <label className="label justify-between">
                  <span>Amount</span>
                  <span className="text-xs opacity-60">Wallet {format(mock.walletBalance)}</span>
                </label>
                <PercentInput balance={mock.walletBalance} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-base-200 rounded-xl p-3 space-y-1">
                  <div className="badge badge-ghost">Current</div>
                  <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv}%</div>
                  <div className="flex items-center gap-1"><FiActivity /> HF {mock.healthFactor}</div>
                </div>
                <div className="bg-base-200 rounded-xl p-3 space-y-1">
                  <div className="badge badge-ghost">After</div>
                  <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv - 5}%</div>
                  <div className="flex items-center gap-1"><FiActivity /> HF {mock.newHealthFactor}</div>
                </div>
              </div>
              <div className="modal-action pt-4">
                <button className="btn btn-neutral w-full flex justify-between">
                  <span>Confirm supply</span>
                  <span className="flex items-center gap-1 text-xs">
                    <FaGasPump /> ${mock.gasCostUsd}
                  </span>
                </button>
              </div>
            </div>
            <div className="w-56 bg-gradient-to-b from-neutral to-neutral-focus text-neutral-content p-6 space-y-3 text-sm">
              <div className="font-semibold mb-2">Pool stats</div>
              <div className="badge badge-outline">Util {mock.utilization}%</div>
              <div className="badge badge-outline">Liquidity ${format(mock.poolLiquidity)}</div>
              <div className="badge badge-outline flex items-center gap-1">
                <FaGasPump /> ${mock.gasCostUsd}
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
/*                                Variant Eight                               */
/* -------------------------------------------------------------------------- */
// Metric pills with underlines and side panel
const VariantEight = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Metric pills</h2>
          <p className="text-sm opacity-80">Underlined accents</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Preview
          </button>
        </div>
      </div>

      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl p-0 rounded-none overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-6 space-y-4">
              <h3 className="font-bold text-xl">Borrow {mock.token.name}</h3>
              <div className="flex gap-2 text-xs">
                <div className="badge badge-primary badge-outline">APY {mock.borrowApy}%</div>
                <div className="badge badge-primary badge-outline">HF {mock.healthFactor}</div>
              </div>
              <div className="form-control pt-2">
                <label className="label justify-between">
                  <span>Amount</span>
                  <span className="text-xs opacity-60">Price ${mock.tokenPrice}</span>
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
                <div className="flex items-center gap-1"><FiActivity /> HF {mock.newHealthFactor}</div>
                <div className="flex items-center gap-1"><FiTrendingUp /> Util {mock.utilization}%</div>
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
  const variants = [
    VariantOne,
    VariantTwo,
    VariantThree,
    VariantFour,
    VariantFive,
    VariantSix,
    VariantSeven,
    VariantEight,
  ];
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Modal Design Expo</h1>
      <p className="text-sm opacity-70">
        Mocked data to experiment with different lending flow layouts.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-4">
        {variants.map((Variant, i) => (
          <Variant key={i} />
        ))}
      </div>
    </div>
  );
};

export default ModalExpoPage;

