"use client";

import { useState } from "react";

const mock = {
  token: "DAI",
  walletBalance: 1234.56,
  supplyApy: 4.3,
  borrowApy: 6.1,
  ltv: 75,
  healthFactor: 1.9,
  newHealthFactor: 2.1,
  gasCostUsd: 1.23,
  tokenPrice: 1.0,
  poolLiquidity: 1000000,
};

const VariantOne = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-primary text-primary-content">
        <div className="card-body">
          <h2 className="card-title">Variant 1</h2>
          <p className="text-sm">Basic layout</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
      </div>
      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg mb-2">Deposit {mock.token}</h3>
          <div className="form-control">
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="opacity-60">Balance</div>
              <div>{mock.walletBalance} {mock.token}</div>
            </div>
            <div>
              <div className="opacity-60">Supply APY</div>
              <div>{mock.supplyApy}%</div>
            </div>
            <div>
              <div className="opacity-60">Token price</div>
              <div>${mock.tokenPrice}</div>
            </div>
            <div>
              <div className="opacity-60">Gas est.</div>
              <div>${mock.gasCostUsd}</div>
            </div>
          </div>
          <div className="modal-action">
            <button className="btn btn-primary">Confirm</button>
            <button className="btn" onClick={() => setOpen(false)}>
              Close
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

const VariantTwo = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-secondary text-secondary-content">
        <div className="card-body">
          <h2 className="card-title">Variant 2</h2>
          <p className="text-sm">Before/After</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
      </div>
      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg mb-2">Supply {mock.token}</h3>
          <div className="form-control mb-4">
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold mb-1">Current</div>
              <ul className="space-y-1">
                <li>HF: {mock.healthFactor}</li>
                <li>LTV: {mock.ltv}%</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold mb-1">After</div>
              <ul className="space-y-1">
                <li>HF: {mock.newHealthFactor}</li>
                <li>LTV: {mock.ltv - 5}%</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-sm">
            <span>Gas: ${mock.gasCostUsd}</span>
            <span>Pool liq.: ${mock.poolLiquidity.toLocaleString()}</span>
          </div>
          <div className="modal-action">
            <button className="btn btn-secondary">Confirm</button>
            <button className="btn" onClick={() => setOpen(false)}>
              Close
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

const VariantThree = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-accent text-accent-content">
        <div className="card-body">
          <h2 className="card-title">Variant 3</h2>
          <p className="text-sm">Sidebar stats</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
      </div>
      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-lg mb-4">Borrow {mock.token}</h3>
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="form-control">
                <label className="label">Amount</label>
                <input type="number" className="input input-bordered" placeholder="0.0" />
              </div>
              <div className="mt-4 text-sm space-y-1">
                <div>Borrow APY: {mock.borrowApy}%</div>
                <div>Token price: ${mock.tokenPrice}</div>
              </div>
            </div>
            <div className="w-48 bg-base-200 rounded-lg p-4 text-sm space-y-2">
              <div className="font-semibold">Risk</div>
              <div>HF: {mock.healthFactor} ➜ {mock.newHealthFactor}</div>
              <div>LTV: {mock.ltv}%</div>
              <div>Gas: ${mock.gasCostUsd}</div>
            </div>
          </div>
          <div className="modal-action">
            <button className="btn btn-accent">Confirm</button>
            <button className="btn" onClick={() => setOpen(false)}>
              Close
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

const VariantFour = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-info text-info-content">
        <div className="card-body">
          <h2 className="card-title">Variant 4</h2>
          <p className="text-sm">Stepper flow</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
      </div>
      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-lg">
          <h3 className="font-bold text-lg mb-4">Repay {mock.token}</h3>
          <ul className="steps mb-4">
            <li className="step step-primary">Amount</li>
            <li className="step step-primary">Review</li>
            <li className="step">Confirm</li>
          </ul>
          <div className="form-control">
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>
          <div className="mt-4 text-sm space-y-1">
            <div>Wallet: {mock.walletBalance} {mock.token}</div>
            <div>Gas est.: ${mock.gasCostUsd}</div>
            <div>HF after: {mock.newHealthFactor}</div>
          </div>
          <div className="modal-action">
            <button className="btn btn-info">Next</button>
            <button className="btn" onClick={() => setOpen(false)}>
              Close
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

const VariantFive = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card bg-warning text-warning-content">
        <div className="card-body">
          <h2 className="card-title">Variant 5</h2>
          <p className="text-sm">Tabs layout</p>
          <button className="btn" onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
      </div>
      <dialog className={`modal ${open ? "modal-open" : ""}`}>
        <div className="modal-box max-w-md">
          <h3 className="font-bold text-lg mb-4">Withdraw {mock.token}</h3>
          <div role="tablist" className="tabs tabs-boxed mb-4">
            <a role="tab" className="tab tab-active">
              Details
            </a>
            <a role="tab" className="tab">
              Metrics
            </a>
          </div>
          <div className="form-control">
            <label className="label">Amount</label>
            <input type="number" className="input input-bordered" placeholder="0.0" />
          </div>
          <div className="mt-4 text-sm grid grid-cols-2 gap-2">
            <div>
              <div className="opacity-60">Liquidity</div>
              <div>${mock.poolLiquidity.toLocaleString()}</div>
            </div>
            <div>
              <div className="opacity-60">HF</div>
              <div>{mock.healthFactor} ➜ {mock.newHealthFactor}</div>
            </div>
          </div>
          <div className="modal-action">
            <button className="btn btn-warning">Confirm</button>
            <button className="btn" onClick={() => setOpen(false)}>
              Close
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

const ModalExpoPage = () => {
  const variants = [VariantOne, VariantTwo, VariantThree, VariantFour, VariantFive];
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Modal Design Expo</h1>
      <p className="text-sm opacity-70">Mocked data to experiment with different layouts.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {variants.map((Variant, i) => (
          <Variant key={i} />
        ))}
      </div>
    </div>
  );
};

export default ModalExpoPage;
