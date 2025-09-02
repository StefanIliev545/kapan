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
import { AnimatePresence, motion } from "framer-motion";

interface VariantProps {
  supplied: ReturnType<typeof useNostraProtocolData>["suppliedPositions"];
  borrowed: ReturnType<typeof useNostraProtocolData>["borrowedPositions"];
  position: PositionManager;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i = 1) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05 } }),
};

const CardVariant: React.FC<VariantProps> = ({ supplied, borrowed, position }) => (
  <motion.div
    className="grid grid-cols-1 gap-6 lg:grid-cols-2"
    initial="hidden"
    animate="show"
    variants={fadeUp}
  >
    <div className="card bg-base-100 shadow-md transition-shadow hover:shadow-xl">
      <div className="card-body p-4">
        <h3 className="card-title mb-2">Supplied</h3>
        <div className="space-y-2">
          {supplied.map((p, i) => (
            <motion.div key={`s-${p.tokenAddress}-${i}`} custom={i} variants={fadeUp}>
              <SupplyPosition {...p} protocolName="Nostra" networkType="starknet" position={position} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
    <div className="card bg-base-100 shadow-md transition-shadow hover:shadow-xl">
      <div className="card-body p-4">
        <h3 className="card-title mb-2">Borrowed</h3>
        <div className="space-y-2">
          {borrowed.map((p, i) => (
            <motion.div key={`b-${p.tokenAddress}-${i}`} custom={i} variants={fadeUp}>
              <BorrowPosition {...p} protocolName="Nostra" networkType="starknet" position={position} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  </motion.div>
);

const TableVariant: React.FC<VariantProps> = ({ supplied, borrowed }) => (
  <motion.div className="space-y-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="overflow-x-auto">
      <h3 className="mb-2 font-semibold">Supplied</h3>
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
            <motion.tr key={`ts-${p.tokenAddress}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
              <td className="flex items-center gap-2">
                <Image src={p.icon} alt={p.name} width={20} height={20} />
                {p.name}
              </td>
              <td>{p.balance.toFixed(2)}</td>
              <td>{p.currentRate.toFixed(2)}%</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="overflow-x-auto">
      <h3 className="mb-2 font-semibold">Borrowed</h3>
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
            <motion.tr key={`tb-${p.tokenAddress}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
              <td className="flex items-center gap-2">
                <Image src={p.icon} alt={p.name} width={20} height={20} />
                {p.name}
              </td>
              <td>{p.balance.toFixed(2)}</td>
              <td>{p.currentRate.toFixed(2)}%</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  </motion.div>
);

const MinimalVariant: React.FC<VariantProps> = ({ supplied, borrowed }) => {
  const totalSupplied = supplied.reduce((acc, p) => acc + p.balance, 0);
  const totalBorrowed = borrowed.reduce((acc, p) => acc + Math.abs(p.balance), 0);
  const utilization = totalSupplied ? (totalBorrowed / totalSupplied) * 100 : 0;
  return (
    <motion.div
      className="flex flex-col items-center gap-6"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div
        className="radial-progress bg-base-200 text-primary"
        style={{
          // @ts-expect-error radial-progress variables
          "--value": utilization,
          "--size": "8rem",
          "--thickness": "8px",
        }}
      >
        {utilization.toFixed(0)}%
      </div>
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
    </motion.div>
  );
};

const SplitVariant: React.FC<VariantProps> = ({ supplied, borrowed, position }) => (
  <motion.div className="grid gap-6 md:grid-cols-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div>
      <h3 className="mb-2 font-semibold">Supplied</h3>
      <div className="space-y-2">
        {supplied.map((p, i) => (
          <motion.div key={`ss-${p.tokenAddress}-${i}`} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.05 }}>
            <SupplyPosition {...p} protocolName="Nostra" networkType="starknet" position={position} />
          </motion.div>
        ))}
      </div>
    </div>
    <div>
      <h3 className="mb-2 font-semibold">Borrowed</h3>
      <div className="space-y-2">
        {borrowed.map((p, i) => (
          <motion.div key={`bb-${p.tokenAddress}-${i}`} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.05 }}>
            <BorrowPosition {...p} protocolName="Nostra" networkType="starknet" position={position} />
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

const GradientVariant: React.FC<VariantProps> = ({ supplied, borrowed, position }) => (
  <motion.div
    className="rounded-xl bg-gradient-to-br from-primary to-secondary p-6 text-white"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {supplied.map((p, i) => (
          <motion.div key={`gs-${p.tokenAddress}-${i}`} whileHover={{ scale: 1.03 }}>
            <SupplyPosition {...p} protocolName="Nostra" networkType="starknet" position={position} />
          </motion.div>
        ))}
      </div>
      <div className="space-y-2">
        {borrowed.map((p, i) => (
          <motion.div key={`gb-${p.tokenAddress}-${i}`} whileHover={{ scale: 1.03 }}>
            <BorrowPosition {...p} protocolName="Nostra" networkType="starknet" position={position} />
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
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
      <div role="tablist" className="tabs tabs-bordered relative flex flex-wrap gap-2">
        {[
          { id: "original", label: "Original", icon: RocketLaunchIcon },
          { id: "card", label: "Card", icon: Squares2X2Icon },
          { id: "table", label: "Table", icon: TableCellsIcon },
          { id: "minimal", label: "Minimal", icon: ChartBarIcon },
          { id: "split", label: "Split", icon: ViewColumnsIcon },
          { id: "gradient", label: "Gradient", icon: PaintBrushIcon },
        ].map(v => {
          const Icon = v.icon;
          const activeTab = active === v.id;
          return (
            <button
              key={v.id}
              role="tab"
              onClick={() => setActive(v.id)}
              className={`relative tab flex items-center gap-2 ${activeTab ? "tab-active font-semibold" : ""}`}
            >
              {activeTab && (
                <motion.span
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-md bg-base-300"
                  transition={{ type: "spring", duration: 0.5 }}
                />
              )}
              <Icon className="z-10 h-4 w-4" />
              <span className="z-10">{v.label}</span>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {activeComponent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default NostraVariantsPage;
