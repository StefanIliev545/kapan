"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import DataCycle from "../ui/DataCycle";

// Minimal card component for dark theme
const DemoCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-base-200/50 border border-base-content/10 p-4 ${className}`}>
    {children}
  </div>
);

// Position row component
const PositionRow = ({ 
  icon, 
  name, 
  amount, 
  rate, 
  isDebt = false 
}: { 
  icon: string; 
  name: string; 
  amount: string; 
  rate: number; 
  isDebt?: boolean;
}) => (
  <div className="flex items-center justify-between py-2 border-b border-base-content/5 last:border-b-0">
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 relative">
        <Image src={icon} alt={name} fill className="object-contain" />
      </div>
      <span className="text-sm font-medium text-base-content/80">{name}</span>
    </div>
    <div className="flex items-center gap-4">
      <span className={`text-sm ${isDebt ? "text-error/70" : "text-base-content/60"}`}>
        {isDebt ? "-" : ""}{amount}
      </span>
      <span className="text-xs text-base-content/40">{rate.toFixed(1)}%</span>
    </div>
  </div>
);

// Overview demo - shows positions across protocols
const OverviewDemo = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
    <DemoCard>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-base-content/10">
        <div className="w-5 h-5 relative">
          <Image src="/logos/aave.svg" alt="Aave" fill className="object-contain" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Aave</span>
      </div>
      <PositionRow icon="/logos/eth.svg" name="ETH" amount="5,240.21" rate={2.8} />
      <PositionRow icon="/logos/dai.svg" name="DAI" amount="1,800.50" rate={4.1} isDebt />
    </DemoCard>
    <DemoCard>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-base-content/10">
        <div className="w-5 h-5 relative">
          <Image src="/logos/compound.svg" alt="Compound" fill className="object-contain" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Compound</span>
      </div>
      <PositionRow icon="/logos/usdc.svg" name="USDC" amount="1,250.00" rate={3.2} />
      <PositionRow icon="/logos/usdt.svg" name="USDT" amount="420.00" rate={4.6} isDebt />
    </DemoCard>
  </div>
);

// Lend demo - shows deposit action
const LendDemo = () => {
  const tokens = [
    { icon: "/logos/usdc.svg", name: "USDC", amount: "5,000", apy: 3.4 },
    { icon: "/logos/weth.svg", name: "ETH", amount: "1.25", apy: 2.9 },
    { icon: "/logos/wbtc.svg", name: "WBTC", amount: "0.50", apy: 2.2 },
  ];

  return (
    <div className="max-w-md mx-auto">
      <DataCycle
        items={tokens}
        intervalMs={3500}
        animation="zoom"
        render={(t) => (
          <DemoCard>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/50">Deposit</span>
              <span className="text-xs text-success/70">{t.apy}% APY</span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 relative">
                <Image src={t.icon} alt={t.name} fill className="object-contain" />
              </div>
              <div>
                <div className="text-lg font-semibold text-base-content">{t.amount} {t.name}</div>
                <div className="text-xs text-base-content/40">Available in wallet</div>
              </div>
            </div>
            <div className="h-10 bg-base-content/5 border border-base-content/10 flex items-center justify-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/30">Confirm Deposit</span>
            </div>
          </DemoCard>
        )}
      />
    </div>
  );
};

// Borrow demo
const BorrowDemo = () => (
  <div className="max-w-lg mx-auto">
    <DemoCard>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-base-content/50">Borrow</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 relative">
            <Image src="/logos/aave.svg" alt="Aave" fill className="object-contain" />
          </div>
          <span className="text-xs text-base-content/40">Aave</span>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <PositionRow icon="/logos/usdc.svg" name="USDC" amount="12,000" rate={3.4} />
        <PositionRow icon="/logos/usdt.svg" name="USDT" amount="7,500" rate={3.1} />
      </div>
      <div className="pt-3 border-t border-base-content/10">
        <div className="flex items-center justify-between text-xs">
          <span className="text-base-content/40">Health Factor</span>
          <span className="text-success/70">1.85</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-base-content/40">Available to Borrow</span>
          <span className="text-base-content/60">$4,200</span>
        </div>
      </div>
    </DemoCard>
  </div>
);

// Swap demo
const SwapDemo = () => {
  const swaps = [
    { from: { icon: "/logos/usdc.svg", name: "USDC", amount: "1,000" }, to: { icon: "/logos/usdt.svg", name: "USDT", amount: "1,000" } },
    { from: { icon: "/logos/weth.svg", name: "ETH", amount: "0.31" }, to: { icon: "/logos/wbtc.svg", name: "WBTC", amount: "0.015" } },
  ];

  return (
    <div className="max-w-md mx-auto">
      <DataCycle
        items={swaps}
        intervalMs={3500}
        animation="slideX"
        render={(s) => (
          <DemoCard>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-4">Swap Collateral</div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 relative">
                  <Image src={s.from.icon} alt={s.from.name} fill className="object-contain" />
                </div>
                <div>
                  <div className="text-sm font-medium">{s.from.amount}</div>
                  <div className="text-xs text-base-content/40">{s.from.name}</div>
                </div>
              </div>
              <div className="text-base-content/30">-&gt;</div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 relative">
                  <Image src={s.to.icon} alt={s.to.name} fill className="object-contain" />
                </div>
                <div>
                  <div className="text-sm font-medium">{s.to.amount}</div>
                  <div className="text-xs text-base-content/40">{s.to.name}</div>
                </div>
              </div>
            </div>
          </DemoCard>
        )}
      />
    </div>
  );
};

// Refinance demo
const RefinanceDemo = () => {
  const moves = [
    { from: { icon: "/logos/nostra.svg", name: "Nostra" }, to: { icon: "/logos/vesu.svg", name: "Vesu" }, saving: "0.4%" },
    { from: { icon: "/logos/aave.svg", name: "Aave" }, to: { icon: "/logos/compound.svg", name: "Compound" }, saving: "0.6%" },
  ];

  return (
    <div className="max-w-md mx-auto">
      <DataCycle
        items={moves}
        intervalMs={3500}
        animation="slideX"
        render={(m) => (
          <DemoCard>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-4">Refinance Position</div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 relative">
                  <Image src={m.from.icon} alt={m.from.name} fill className="object-contain" />
                </div>
                <span className="text-sm font-medium">{m.from.name}</span>
              </div>
              <div className="text-base-content/30">-&gt;</div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 relative">
                  <Image src={m.to.icon} alt={m.to.name} fill className="object-contain" />
                </div>
                <span className="text-sm font-medium">{m.to.name}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-base-content/10 flex items-center justify-between text-xs">
              <span className="text-base-content/40">Interest Saved</span>
              <span className="text-success/70">{m.saving} lower</span>
            </div>
          </DemoCard>
        )}
      />
    </div>
  );
};

const tabs = [
  { id: "overview", label: "Overview", content: <OverviewDemo /> },
  { id: "lend", label: "Lend", content: <LendDemo /> },
  { id: "borrow", label: "Borrow", content: <BorrowDemo /> },
  { id: "swap", label: "Swap", content: <SwapDemo /> },
  { id: "refinance", label: "Refinance", content: <RefinanceDemo /> },
];

export const LandingExplainer = () => {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Minimal tab bar */}
      <div className="flex items-center justify-center gap-1 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              relative px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-300
              ${activeTab === tab.id ? "text-base-content" : "text-base-content/30 hover:text-base-content/60"}
            `}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[1px] bg-base-content/60"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {tabs.find(t => t.id === activeTab)?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default LandingExplainer;
