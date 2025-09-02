"use client";

import React from "react";
import Image from "next/image";
import NostraProtocolView from "~~/components/specific/nostra/NostraProtocolView";

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
  <div className="grid gap-4 md:grid-cols-3">
    {mockPositions.map(pos => (
      <div key={pos.token} className="card bg-base-200 shadow-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Image src={pos.icon} alt={pos.token} width={24} height={24} />
          <span className="font-semibold">{pos.token}</span>
        </div>
        <div className="text-sm">Supplied: {pos.supplied} ({pos.apy}% APY)</div>
        <div className="text-sm">Borrowed: {pos.borrowed} ({pos.apr}% APR)</div>
      </div>
    ))}
  </div>
);

const TableVariant: React.FC = () => (
  <div className="overflow-x-auto">
    <table className="table">
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
        <div className="stat-title">Total Supplied</div>
        <div className="stat-value">{totalSupplied}</div>
      </div>
      <div className="stat">
        <div className="stat-title">Total Borrowed</div>
        <div className="stat-value">{totalBorrowed}</div>
      </div>
    </div>
  );
};

const SplitVariant: React.FC = () => (
  <div className="grid gap-6 md:grid-cols-2">
    <div>
      <h3 className="font-semibold mb-2">Supplied</h3>
      <ul className="space-y-2">
        {mockPositions.map(pos => (
          <li key={pos.token} className="flex items-center gap-2">
            <Image src={pos.icon} alt={pos.token} width={20} height={20} />
            {pos.token}: {pos.supplied}
          </li>
        ))}
      </ul>
    </div>
    <div>
      <h3 className="font-semibold mb-2">Borrowed</h3>
      <ul className="space-y-2">
        {mockPositions.map(pos => (
          <li key={pos.token} className="flex items-center gap-2">
            <Image src={pos.icon} alt={pos.token} width={20} height={20} />
            {pos.token}: {pos.borrowed}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const GradientVariant: React.FC = () => (
  <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-6 text-white space-y-4">
    {mockPositions.map(pos => (
      <div key={pos.token} className="flex justify-between">
        <span>{pos.token}</span>
        <span>
          {pos.supplied} / {pos.borrowed}
        </span>
      </div>
    ))}
  </div>
);

const NostraVariantsPage: React.FC = () => {
  return (
    <div className="container mx-auto space-y-16 p-4">
      <section>
        <h1 className="mb-4 text-3xl font-bold">Original Nostra Protocol View</h1>
        <NostraProtocolView />
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Variant: Card Layout</h2>
        <CardVariant />
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Variant: Table Overview</h2>
        <TableVariant />
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Variant: Minimal Stats</h2>
        <MinimalVariant />
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Variant: Split Columns</h2>
        <SplitVariant />
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Variant: Gradient Panel</h2>
        <GradientVariant />
      </section>
    </div>
  );
};

export default NostraVariantsPage;

