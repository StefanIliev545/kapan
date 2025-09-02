"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import NostraProtocolView from "~~/components/specific/nostra/NostraProtocolView";
import useNostraProtocolData from "~~/components/specific/nostra/useNostraProtocolData";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { PositionManager } from "~~/utils/position";
import {
  RocketLaunchIcon,
  Squares2X2Icon,
  TableCellsIcon,
  ChartBarIcon,
  ViewColumnsIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";

interface VariantProps {
  supplied: ReturnType<typeof useNostraProtocolData>["suppliedPositions"];
  borrowed: ReturnType<typeof useNostraProtocolData>["borrowedPositions"];
  position: PositionManager;
}

const CardVariant: React.FC<VariantProps> = ({ supplied, borrowed, position }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div className="card bg-base-100 shadow-md">
      <div className="card-body p-4">
        <h3 className="card-title mb-2">Supplied</h3>
        <div className="space-y-2">
          {supplied.map((p, i) => (
            <SupplyPosition key={`s-${p.tokenAddress}-${i}`} {...p} protocolName="Nostra" networkType="starknet" position={position} />
          ))}
        </div>
      </div>
    </div>
    <div className="card bg-base-100 shadow-md">
      <div className="card-body p-4">
        <h3 className="card-title mb-2">Borrowed</h3>
        <div className="space-y-2">
          {borrowed.map((p, i) => (
            <BorrowPosition key={`b-${p.tokenAddress}-${i}`} {...p} protocolName="Nostra" networkType="starknet" position={position} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const TableVariant: React.FC<VariantProps> = ({ supplied, borrowed }) => (
  <div className="space-y-8">
    <div className="overflow-x-auto">
      <h3 className="font-semibold mb-2">Supplied</h3>
      <table className="table table-zebra">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Balance</th>
            <th>APY</th>
          </tr>
        </thead>
        <tbody>
          {supplied.map((p, i) => (
            <tr key={`ts-${p.tokenAddress}-${i}`}>
              <td className="flex items-center gap-2">
                <Image src={p.icon} alt={p.name} width={20} height={20} />
                {p.name}
              </td>
              <td>{p.balance.toFixed(2)}</td>
              <td>{p.currentRate.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="overflow-x-auto">
      <h3 className="font-semibold mb-2">Borrowed</h3>
      <table className="table table-zebra">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Balance</th>
            <th>APR</th>
          </tr>
        </thead>
        <tbody>
          {borrowed.map((p, i) => (
            <tr key={`tb-${p.tokenAddress}-${i}`}>
              <td className="flex items-center gap-2">
                <Image src={p.icon} alt={p.name} width={20} height={20} />
                {p.name}
              </td>
              <td>{p.balance.toFixed(2)}</td>
              <td>{p.currentRate.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const MinimalVariant: React.FC<VariantProps> = ({ supplied, borrowed }) => {
  const totalSupplied = supplied.reduce((acc, p) => acc + p.balance, 0);
  const totalBorrowed = borrowed.reduce((acc, p) => acc + Math.abs(p.balance), 0);
  return (
    <div className="space-y-4">
      <div className="stats shadow">
        <div className="stat">
          <div className="stat-title">Total Supplied</div>
          <div className="stat-value">{totalSupplied.toFixed(2)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Total Borrowed</div>
          <div className="stat-value">{totalBorrowed.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
};

const SplitVariant: React.FC<VariantProps> = ({ supplied, borrowed, position }) => (
  <div className="grid gap-6 md:grid-cols-2">
    <div>
      <h3 className="font-semibold mb-2">Supplied</h3>
      <div className="space-y-2">
        {supplied.map((p, i) => (
          <SupplyPosition key={`ss-${p.tokenAddress}-${i}`} {...p} protocolName="Nostra" networkType="starknet" position={position} />
        ))}
      </div>
    </div>
    <div>
      <h3 className="font-semibold mb-2">Borrowed</h3>
      <div className="space-y-2">
        {borrowed.map((p, i) => (
          <BorrowPosition key={`bb-${p.tokenAddress}-${i}`} {...p} protocolName="Nostra" networkType="starknet" position={position} />
        ))}
      </div>
    </div>
  </div>
);

const GradientVariant: React.FC<VariantProps> = ({ supplied, borrowed, position }) => (
  <div className="p-6 rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {supplied.map((p, i) => (
          <SupplyPosition key={`gs-${p.tokenAddress}-${i}`} {...p} protocolName="Nostra" networkType="starknet" position={position} />
        ))}
      </div>
      <div className="space-y-2">
        {borrowed.map((p, i) => (
          <BorrowPosition key={`gb-${p.tokenAddress}-${i}`} {...p} protocolName="Nostra" networkType="starknet" position={position} />
        ))}
      </div>
    </div>
  </div>
);

const NostraVariantsPage: React.FC = () => {
  const { suppliedPositions, borrowedPositions } = useNostraProtocolData();
  const [active, setActive] = useState("original");

  const position = useMemo(
    () => PositionManager.fromPositions(suppliedPositions, borrowedPositions),
    [suppliedPositions, borrowedPositions],
  );

  const shared = { supplied: suppliedPositions, borrowed: borrowedPositions, position };

  const activeComponent = () => {
    switch (active) {
      case "card":
        return <CardVariant {...shared} />;
      case "table":
        return <TableVariant {...shared} />;
      case "minimal":
        return <MinimalVariant {...shared} />;
      case "split":
        return <SplitVariant {...shared} />;
      case "gradient":
        return <GradientVariant {...shared} />;
      default:
        return <NostraProtocolView />;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div role="tablist" className="tabs tabs-bordered flex flex-wrap gap-2">
        {[
          { id: "original", label: "Original", icon: RocketLaunchIcon },
          { id: "card", label: "Card", icon: Squares2X2Icon },
          { id: "table", label: "Table", icon: TableCellsIcon },
          { id: "minimal", label: "Minimal", icon: ChartBarIcon },
          { id: "split", label: "Split", icon: ViewColumnsIcon },
          { id: "gradient", label: "Gradient", icon: PaintBrushIcon },
        ].map(v => {
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
      {activeComponent()}
    </div>
  );
};

export default NostraVariantsPage;
