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
              <label className="label">Amount</label>
              <input type="number" className="input input-bordered" placeholder="0.0" />
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
              <button className="btn btn-primary w-full">Confirm deposit</button>
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
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
            <Image src={mock.token.icon} alt={mock.token.name} width={32} height={32} />
            Supply {mock.token.name}
          </h3>

          <div className="form-control mb-4">
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold mb-1">Current</div>
              <div className="flex items-center gap-1"><FiActivity /> HF {mock.healthFactor}</div>
              <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv}%</div>
            </div>
            <div>
              <div className="font-semibold mb-1">After</div>
              <div className="flex items-center gap-1"><FiActivity /> HF {mock.newHealthFactor}</div>
              <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv - 5}%</div>
            </div>
          </div>

          <div className="mt-4 flex justify-between text-sm opacity-80">
            <span className="flex items-center gap-1"><FiZap /> ${mock.gasCostUsd}</span>
            <span className="flex items-center gap-1">
              <FiDollarSign /> ${format(mock.poolLiquidity)} pool
            </span>
          </div>

          <div className="modal-action">
            <button className="btn btn-secondary w-full">Confirm supply</button>
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
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-xl mb-4">Borrow {mock.token.name}</h3>
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="form-control">
                <label className="label">Amount</label>
                <input type="number" className="input input-bordered" placeholder="0.0" />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-1"><FiTrendingUp /> Borrow APY {mock.borrowApy}%</div>
                <div className="flex items-center gap-1"><FiDollarSign /> Price ${mock.tokenPrice}</div>
              </div>
            </div>

            <div className="w-52 bg-base-200 rounded-xl p-4 text-sm space-y-2">
              <div className="font-semibold mb-2">Risk &amp; stats</div>
              <div className="flex items-center gap-1"><FiActivity /> HF {mock.healthFactor} → {mock.newHealthFactor}</div>
              <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv}%</div>
              <div className="flex items-center gap-1"><FiZap /> Gas ${mock.gasCostUsd}</div>
              <div className="flex items-center gap-1"><FiTrendingUp /> Util {mock.utilization}%</div>
            </div>
          </div>

          <div className="modal-action">
            <button className="btn btn-accent w-full">Confirm borrow</button>
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
        <div className="modal-box max-w-lg">
          <h3 className="font-bold text-xl mb-4">Repay {mock.token.name}</h3>

          <ul className="steps mb-6">
            <li className="step step-primary">Amount</li>
            <li className="step">Review</li>
            <li className="step">Confirm</li>
          </ul>

          <div className="form-control">
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>

          <div className="mt-4 text-sm space-y-1 opacity-80">
            <div className="flex items-center gap-1"><FiDollarSign /> Wallet {format(mock.walletBalance)}</div>
            <div className="flex items-center gap-1"><FiZap /> Gas ${mock.gasCostUsd}</div>
            <div className="flex items-center gap-1"><FiActivity /> HF → {mock.newHealthFactor}</div>
          </div>

          <div className="modal-action">
            <button className="btn btn-info w-full">Next step</button>
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
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-xl mb-4">Withdraw {mock.token.name}</h3>

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
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>

          {tab === "details" ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-1"><FiDollarSign /> Liquidity ${format(mock.poolLiquidity)}</div>
              <div className="flex items-center gap-1"><FiTrendingUp /> APY {mock.supplyApy}%</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-1"><FiActivity /> HF {mock.healthFactor} → {mock.newHealthFactor}</div>
              <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv}%</div>
            </div>
          )}

          <div className="modal-action mt-6">
            <button className="btn btn-warning w-full">Confirm withdraw</button>
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
        <div className="modal-box max-w-xl">
          <h3 className="font-bold text-xl mb-6">Deposit {mock.token.name}</h3>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1"><FiActivity /> HF {mock.healthFactor}</div>
            <div className="flex items-center gap-1"><FiPieChart /> LTV {mock.ltv}%</div>
            <div className="flex items-center gap-1"><FiZap /> Gas ${mock.gasCostUsd}</div>
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
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>

          <div className="modal-action mt-6">
            <button className="btn btn-success w-full">
              Continue <FiArrowRight className="ml-2" />
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
/*                              Modal Expo Page                               */
/* -------------------------------------------------------------------------- */
const ModalExpoPage = () => {
  const variants = [VariantOne, VariantTwo, VariantThree, VariantFour, VariantFive, VariantSix];
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Modal Design Expo</h1>
      <p className="text-sm opacity-70">
        Mocked data to experiment with different lending flow layouts.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {variants.map((Variant, i) => (
          <Variant key={i} />
        ))}
      </div>
    </div>
  );
};

export default ModalExpoPage;

