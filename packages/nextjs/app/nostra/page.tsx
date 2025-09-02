"use client";

import React, { useState } from "react";
import Image from "next/image";
import NostraProtocolView from "~~/components/specific/nostra/NostraProtocolView";
import {
  RocketLaunchIcon,
  Squares2X2Icon,
  TableCellsIcon,
  ChartBarIcon,
  ViewColumnsIcon,
  PaintBrushIcon,
  ArrowUpCircleIcon,
  ArrowDownCircleIcon,
} from "@heroicons/react/24/outline";

interface MockPosition {
  icon: string;
  token: string;
  supplied: number;
  apy: number;
  borrowed: number;
  apr: number;
}

const mockPositions: MockPosition[] = [
  { icon: "/logos/eth.svg", token: "ETH", supplied: 1.2, apy: 2.1, borrowed: 0.4, apr: 3.2 },
  { icon: "/logos/usdc.svg", token: "USDC", supplied: 1000, apy: 1.5, borrowed: 500, apr: 4.0 },
  { icon: "/logos/dai.svg", token: "DAI", supplied: 500, apy: 1.8, borrowed: 150, apr: 3.5 },
];

const CardVariant: React.FC = () => (
  <div className="grid gap-6 md:grid-cols-3">
    {mockPositions.map(pos => (
      <div key={pos.token} className="card bg-base-100 shadow-xl">
        <figure className="px-4 pt-4">
          <Image
            src={pos.icon}
            alt={pos.token}
            width={48}
            height={48}
            className="rounded-xl"
          />
        </figure>
        <div className="card-body">
          <h2 className="card-title mb-2">{pos.token}</h2>
          <div className="flex justify-between text-sm">
            <span className="opacity-70">Supplied</span>
            <span className="font-medium">{pos.supplied}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="opacity-70">Borrowed</span>
            <span className="font-medium">{pos.borrowed}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="badge badge-success gap-1">APY {pos.apy}%</span>
            <span className="badge badge-warning gap-1">APR {pos.apr}%</span>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const TableVariant: React.FC = () => (
  <div className="overflow-x-auto">
    <table className="table table-zebra">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Supplied</th>
          <th>Borrowed</th>
          <th>APY</th>
          <th>APR</th>
        </tr>
      </thead>
      <tbody>
        {mockPositions.map(pos => (
          <tr key={pos.token}>
            <td className="flex items-center gap-2">
              <Image src={pos.icon} alt={pos.token} width={20} height={20} />
              {pos.token}
            </td>
            <td>{pos.supplied}</td>
            <td>{pos.borrowed}</td>
            <td>{pos.apy}%</td>
            <td>{pos.apr}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MinimalVariant: React.FC = () => {
  const totalSupplied = mockPositions.reduce((acc, p) => acc + p.supplied, 0);
  const totalBorrowed = mockPositions.reduce((acc, p) => acc + p.borrowed, 0);
  return (
    <div className="stats shadow">
      <div className="stat">
        <div className="stat-figure text-secondary">
          <ArrowUpCircleIcon className="w-6 h-6" />
        </div>
        <div className="stat-title">Total Supplied</div>
        <div className="stat-value">{totalSupplied}</div>
      </div>
      <div className="stat">
        <div className="stat-figure text-primary">
          <ArrowDownCircleIcon className="w-6 h-6" />
        </div>
        <div className="stat-title">Total Borrowed</div>
        <div className="stat-value">{totalBorrowed}</div>
      </div>
    </div>
  );
};

const SplitVariant: React.FC = () => (
  <div className="grid gap-6 md:grid-cols-2">
    <div className="bg-base-200 rounded-xl p-4">
      <h3 className="font-semibold mb-3">Supplied</h3>
      <ul className="space-y-2">
        {mockPositions.map(pos => (
          <li key={pos.token} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Image src={pos.icon} alt={pos.token} width={20} height={20} />
              {pos.token}
            </span>
            <span className="font-medium">{pos.supplied}</span>
          </li>
        ))}
      </ul>
    </div>
    <div className="bg-base-200 rounded-xl p-4">
      <h3 className="font-semibold mb-3">Borrowed</h3>
      <ul className="space-y-2">
        {mockPositions.map(pos => (
          <li key={pos.token} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Image src={pos.icon} alt={pos.token} width={20} height={20} />
              {pos.token}
            </span>
            <span className="font-medium">{pos.borrowed}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const GradientVariant: React.FC = () => (
  <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-6 text-white">
    {mockPositions.map(pos => (
      <div
        key={pos.token}
        className="flex items-center justify-between py-2 border-b border-white/20 last:border-b-0"
      >
        <span className="flex items-center gap-2">
          <Image src={pos.icon} alt={pos.token} width={20} height={20} />
          {pos.token}
        </span>
        <span className="text-sm">
          {pos.supplied} / {pos.borrowed}
        </span>
      </div>
    ))}
  </div>
);

const variants = [
  { id: "original", label: "Original", icon: RocketLaunchIcon, component: <NostraProtocolView /> },
  { id: "card", label: "Card", icon: Squares2X2Icon, component: <CardVariant /> },
  { id: "table", label: "Table", icon: TableCellsIcon, component: <TableVariant /> },
  { id: "minimal", label: "Minimal", icon: ChartBarIcon, component: <MinimalVariant /> },
  { id: "split", label: "Split", icon: ViewColumnsIcon, component: <SplitVariant /> },
  { id: "gradient", label: "Gradient", icon: PaintBrushIcon, component: <GradientVariant /> },
];

const NostraVariantsPage: React.FC = () => {
  const [active, setActive] = useState("original");

  const activeVariant = variants.find(v => v.id === active);

  return (
    <div className="container mx-auto p-4">
      <div role="tablist" className="tabs tabs-bordered flex flex-wrap gap-2">
        {variants.map(v => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              role="tab"
              onClick={() => setActive(v.id)}
              className={`tab flex items-center gap-2 ${active === v.id ? "tab-active" : ""}`}
            >
              <Icon className="w-4 h-4" />
              {v.label}
            </button>
          );
        })}
      </div>
      <div className="mt-8 space-y-8">
        {activeVariant?.component}
      </div>
    </div>
  );
};

export default NostraVariantsPage;

