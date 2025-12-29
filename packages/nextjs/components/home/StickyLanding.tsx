"use client";

import { useRef, useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useSpring, useTransform, useMotionValue } from "framer-motion";
import { ChevronDownIcon, ArrowRightIcon, ShieldCheckIcon, BoltIcon, CurrencyDollarIcon, SparklesIcon, CubeTransparentIcon, PuzzlePieceIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { StickySection, SectionData } from "./StickySection";
import { useKapanTheme } from "~~/hooks/useKapanTheme";

const protocols = [
  { name: "Aave", logo: "/logos/aave.svg" },
  { name: "Compound", logo: "/logos/compound.svg" },
  { name: "Vesu", logo: "/logos/vesu.svg" },
  { name: "Nostra", logo: "/logos/nostra.svg" },
  { name: "Venus", logo: "/logos/venus.svg" },
  { name: "ZeroLend", logo: "/logos/zerolend.svg" },
];

// Duplicate for seamless loop
const duplicatedProtocols = [...protocols, ...protocols];

const ProtocolMarquee = () => {
  return (
    <div className="relative overflow-hidden w-full max-w-md">
      <motion.div
        className="flex gap-6"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          x: {
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          },
        }}
      >
        {duplicatedProtocols.map((protocol, index) => (
          <div
            key={`${protocol.name}-${index}`}
            className="flex items-center gap-2 flex-shrink-0"
          >
            <div className="w-5 h-5 relative">
              <Image
                src={protocol.logo}
                alt={protocol.name}
                fill
                className="object-contain"
              />
            </div>
            <span className="text-sm font-medium text-base-content/50">
              {protocol.name}
            </span>
          </div>
        ))}
      </motion.div>
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-base-100 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-base-100 to-transparent pointer-events-none" />
    </div>
  );
};

const LaunchAppButton = () => {
  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");
    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;
    return `${protocol}//app.${baseHost}`;
  }, []);

  return (
    <a
      href="/app"
      onClick={e => {
        e.preventDefault();
        track("To App conversion", { button: "Landing Hero" });
        window.location.assign(appUrl);
      }}
      className="group relative h-16 md:h-20 px-10 md:px-14 bg-primary text-primary-content font-black uppercase tracking-[0.3em] text-[11px] md:text-xs hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all duration-500 overflow-hidden flex items-center justify-center"
    >
      <div className="relative z-10 flex items-center gap-4">
        <span className="translate-x-2 group-hover:translate-x-0 transition-transform duration-500">
          Launch App
        </span>
        <ArrowRightIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-500" />
      </div>
    </a>
  );
};

const HeroContent = () => (
  <div className="flex flex-col items-center gap-8">
    <ProtocolMarquee />
    <LaunchAppButton />
  </div>
);

// Supported networks
const networks = [
  { name: "Ethereum", logo: "/logos/eth.svg" },
  { name: "Base", logo: "/logos/base.svg" },
  { name: "Arbitrum", logo: "/logos/arb.svg" },
  { name: "Optimism", logo: "/logos/optimism.svg" },
  { name: "Starknet", logo: "/logos/starknet.svg" },
  { name: "Linea", logo: "/logos/linea.svg" },
];

// Supported protocols
const supportedProtocols = [
  { name: "Aave", logo: "/logos/aave.svg" },
  { name: "Morpho", logo: "/logos/morpho.svg" },
  { name: "Compound", logo: "/logos/compound.svg" },
  { name: "Vesu", logo: "/logos/vesu.svg" },
  { name: "Nostra", logo: "/logos/nostra.svg" },
  { name: "Venus", logo: "/logos/venus.svg" },
  { name: "ZeroLend", logo: "/logos/zerolend.svg" },
];

// Aggregators & integrations
const integrations = [
  { name: "1inch", logo: "/logos/1inch.png" },
  { name: "Pendle", logo: "/logos/pendle.png" },
  { name: "AVNU", logo: "/logos/avnu.png" },
];

// Duplicate arrays for seamless loop
const duplicatedNetworks = [...networks, ...networks];
const duplicatedSupportedProtocols = [...supportedProtocols, ...supportedProtocols];
const duplicatedIntegrations = [...integrations, ...integrations];

// Marquee row component
const MarqueeRow = ({ items, label, reverse = false }: { items: { name: string; logo: string }[]; label: string; reverse?: boolean }) => (
  <div className="flex items-center gap-4 w-full">
    <span className="text-[10px] uppercase tracking-wider text-base-content/30 w-20 flex-shrink-0 text-right">{label}</span>
    <div className="relative overflow-hidden flex-1">
      <motion.div
        className="flex gap-6"
        animate={{ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{
          x: {
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          },
        }}
      >
        {items.map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center gap-2 flex-shrink-0">
            <div className="w-5 h-5 relative">
              <Image src={item.logo} alt={item.name} fill className="object-contain" />
            </div>
            <span className="text-xs text-base-content/40">{item.name}</span>
          </div>
        ))}
      </motion.div>
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-base-100 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-base-100 to-transparent pointer-events-none" />
    </div>
  </div>
);

const FeatureList = () => {
  const features = [
    { icon: ShieldCheckIcon, title: "Non-Custodial", desc: "Your assets stay yours. Verify on any protocol's frontend." },
    { icon: BoltIcon, title: "Atomic Transactions", desc: "All operations execute in a single transaction using flash loans." },
    { icon: CurrencyDollarIcon, title: "Zero Protocol Fees", desc: "You only pay network gas and swap fees. No Kapan fees." },
    { icon: SparklesIcon, title: "Any Gas Token", desc: "Pay gas in any token with AVNU Paymaster integration." },
  ];

  return (
    <div className="flex flex-col items-center gap-10 w-full max-w-4xl mx-auto px-4">
      {/* Features grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {features.map((f, i) => (
          <div key={i} className="flex gap-4 text-left">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-base-content/5 flex items-center justify-center">
              <f.icon className="w-5 h-5 text-base-content/50" />
            </div>
            <div>
              <div className="text-sm font-semibold text-base-content/90 mb-1">{f.title}</div>
              <div className="text-sm text-base-content/50">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Supported networks/protocols/integrations marquees */}
      <div className="w-full space-y-3 pt-4 border-t border-base-content/5">
        <MarqueeRow items={duplicatedNetworks} label="Networks" />
        <MarqueeRow items={duplicatedSupportedProtocols} label="Protocols" reverse />
        <MarqueeRow items={duplicatedIntegrations} label="Swaps" />
      </div>
    </div>
  );
};

// Final CTA section
const FinalCTA = () => (
  <div className="flex flex-col items-center gap-8 text-center px-4">
    <div className="space-y-4">
      <p className="text-base-content/40 text-sm max-w-md">
        Join thousands of DeFi users optimizing their lending positions across multiple protocols.
      </p>
    </div>
    <LaunchAppButton />
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-6 text-xs text-base-content/30">
        <a href="https://discord.gg/Vjk6NhkxGv" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">Discord</a>
        <a href="https://t.me/+vYCKr2TrOXRiODg0" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">Telegram</a>
        <a href="https://x.com/KapanFinance" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">Twitter</a>
        <a href="https://github.com/kapan-finance" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">GitHub</a>
      </div>
      <a 
        href="/audits/022_CODESPECT_KAPAN_FINANCE.pdf" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-[10px] uppercase tracking-wider text-base-content/20 hover:text-base-content/40 transition-colors"
      >
        Starknet Audit by Codespect
      </a>
    </div>
  </div>
);

// How it Works section
const HowItWorks = () => {
  const steps = [
    { 
      icon: PuzzlePieceIcon, 
      title: "Lending Instructions", 
      desc: "Modular building blocks for any lending action—deposit, borrow, repay, withdraw, swap, move." 
    },
    { 
      icon: CubeTransparentIcon, 
      title: "Compose Bundles", 
      desc: "Combine instructions into a single bundle that interacts with multiple protocols at once." 
    },
    { 
      icon: RocketLaunchIcon, 
      title: "Execute Atomically", 
      desc: "Flash loans power the entire bundle. Everything succeeds or nothing happens. No partial state." 
    },
  ];

  return (
    <div className="flex flex-col items-center gap-8 max-w-4xl mx-auto px-4">
      {/* Visual flow */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 w-full">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center text-center max-w-[200px]">
              <div className="w-14 h-14 rounded-2xl bg-base-content/5 border border-base-content/10 flex items-center justify-center mb-3">
                <step.icon className="w-7 h-7 text-base-content/60" />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-base-content/70 mb-1">{step.title}</div>
              <div className="text-xs text-base-content/40 leading-relaxed">{step.desc}</div>
            </div>
            {i < steps.length - 1 && (
              <ArrowRightIcon className="w-5 h-5 text-base-content/20 mx-4 hidden md:block" />
            )}
          </div>
        ))}
      </div>
      
      {/* Example bundle */}
      <div className="bg-base-200/40 border border-base-300/50 rounded-xl p-4 w-full max-w-lg">
        <div className="text-[10px] uppercase tracking-wider text-base-content/40 mb-3 text-center">Example Bundle</div>
        <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 rounded bg-success/10 text-success border border-success/20">Withdraw wstETH</span>
          <ArrowRightIcon className="w-3 h-3 text-base-content/30" />
          <span className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">Swap → USDC</span>
          <ArrowRightIcon className="w-3 h-3 text-base-content/30" />
          <span className="px-2 py-1 rounded bg-error/10 text-error border border-error/20">Repay Debt</span>
        </div>
        <div className="text-[10px] text-base-content/30 text-center mt-3">Aave + 1inch + Morpho — one transaction</div>
      </div>
    </div>
  );
};

// Wrapper to add fade effect to real components
const FadedPreview = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative w-full max-w-6xl mx-auto px-4 ${className}`}>
    <div className="pointer-events-none">
      {children}
    </div>
    {/* Fade overlay on bottom */}
    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-base-100 to-transparent pointer-events-none" />
    {/* Fade overlay on sides */}
    <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-base-100 to-transparent pointer-events-none" />
    <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-base-100 to-transparent pointer-events-none" />
  </div>
);

// Mock Morpho Blue protocol view with pair-isolated positions (like real app)
const MockMorphoView = () => (
  <div className="w-full flex flex-col p-3 space-y-2">
    {/* Protocol Header Card */}
    <div className="card bg-base-200/40 shadow-lg rounded-xl border border-base-300/50">
      <div className="card-body px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* Protocol name + icon */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-2 flex items-center justify-center shadow-sm ring-1 ring-base-300/30">
              <Image src="/logos/morpho.svg" alt="Morpho Blue" width={24} height={24} className="object-contain drop-shadow-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Protocol</span>
              <span className="text-base font-bold tracking-tight">Morpho Blue</span>
            </div>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-base-300 to-transparent" />
          {/* Stats */}
          <div className="flex-1 flex flex-wrap items-center justify-around gap-y-3">
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Balance</span>
              <span className="text-sm font-mono font-bold tabular-nums text-success">$6.46K</span>
            </div>
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">30D Yield</span>
              <span className="text-sm font-mono font-bold tabular-nums text-success">$264.90</span>
            </div>
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Net APY</span>
              <span className="text-sm font-mono font-bold tabular-nums text-success">+49.91%</span>
            </div>
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 bg-base-300/60 rounded-full overflow-hidden">
                  <div className="h-full bg-error rounded-full w-[90%]" />
                </div>
                <span className="text-xs font-mono font-semibold tabular-nums text-error">90%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* YOUR POSITIONS section */}
    <div className="card bg-base-200/40 shadow-md rounded-xl border border-base-300/50">
      <div className="card-body p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-1 border-b border-base-200/50">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-base-content/60">Your Positions</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            <span className="text-xs font-mono font-bold">1</span>
            <span className="text-[10px] uppercase tracking-wider opacity-70">market</span>
          </div>
        </div>

        {/* Market pair row */}
        <div className="rounded-md border border-base-300">
          {/* Market pair header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-base-200/50 px-3 py-2 border-b border-base-300">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={20} height={20} className="rounded-full border border-base-100 bg-base-200" />
                <Image src="/logos/usdc.svg" alt="USDC" width={20} height={20} className="rounded-full border border-base-100 bg-base-200" />
              </div>
              <span className="text-sm font-medium">PT-USDai-19FEB2026/USDC</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="text-base-content/60">Net: <span className="text-success">$6.46K</span></span>
              <span className="text-base-content/60">Net APY: <span className="text-success">+49.91%</span></span>
              <span className="text-base-content/60">30D: <span className="text-success">$264.90</span></span>
              <span className="text-base-content/60">LTV: <span className="text-success">89.9%</span><span className="text-base-content/50">/92%</span></span>
            </div>
          </div>

          {/* Side-by-side positions */}
          <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-y md:divide-y-0 divide-base-300">
            {/* Collateral side */}
            <div className="p-3">
              <div className="flex items-center gap-3">
                <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={40} height={40} className="rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">PT-USDai-1...</div>
                  <div className="text-xs text-base-content/60">Collateral</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-success">$63,717.30</div>
                  <div className="text-xs text-base-content/60">8.42% APY</div>
                </div>
              </div>
            </div>
            {/* Debt side */}
            <div className="p-3">
              <div className="flex items-center gap-3">
                <Image src="/logos/usdc.svg" alt="USDC" width={40} height={40} className="rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">USDC</div>
                  <div className="text-xs text-base-content/60">Debt</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-error">-$57,259.78</div>
                  <div className="text-xs text-base-content/60">3.74% APR</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Mock Aave header only (fades into darkness)
const MockAaveHeader = () => (
  <div className="w-full flex flex-col p-3">
    <div className="card bg-base-200/40 shadow-lg rounded-xl border border-base-300/50">
      <div className="card-body px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-2 flex items-center justify-center shadow-sm ring-1 ring-base-300/30">
              <Image src="/logos/aave.svg" alt="Aave V3" width={24} height={24} className="object-contain drop-shadow-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Protocol</span>
              <span className="text-base font-bold tracking-tight">Aave V3</span>
            </div>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-base-300 to-transparent" />
          <div className="flex-1 flex flex-wrap items-center justify-around gap-y-3">
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Balance</span>
              <span className="text-sm font-mono font-bold tabular-nums text-success">$2,356.66</span>
            </div>
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">30D Yield</span>
              <span className="text-sm font-mono font-bold tabular-nums text-error">-$7.45</span>
            </div>
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Net APY</span>
              <span className="text-sm font-mono font-bold tabular-nums text-error">-3.85%</span>
            </div>
            <div className="flex flex-col gap-1 items-center px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 bg-base-300/60 rounded-full overflow-hidden">
                  <div className="h-full bg-error rounded-full w-[81%]" />
                </div>
                <span className="text-xs font-mono font-semibold tabular-nums text-error">81%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Dashboard preview - Morpho with positions, Aave header fading out
const DashboardPreview = () => (
  <div className="relative w-full max-w-5xl mx-auto">
    <div className="pointer-events-none">
      <MockMorphoView />
      <MockAaveHeader />
    </div>
    {/* Fade overlay on bottom */}
    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-base-100 via-base-100/90 to-transparent pointer-events-none" />
  </div>
);

// Compact action cards for landing page
const LendCard = () => (
  <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-5 max-w-sm mx-auto">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <Image src="/logos/usdc.svg" alt="USDC" width={36} height={36} className="rounded-full" />
        <div>
          <div className="font-semibold">USDC</div>
          <div className="text-xs text-base-content/50">Balance: 5,000.00</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-base-content/50">Supply APY</div>
        <div className="text-lg font-bold text-success">3.40%</div>
      </div>
    </div>
    <div className="flex items-center gap-2 text-xs text-base-content/40 mb-3">
      <Image src="/logos/aave.svg" alt="Aave" width={14} height={14} />
      <span>Aave V3</span>
    </div>
    <div className="h-2 bg-base-300/50 rounded-full overflow-hidden">
      <div className="h-full bg-success/60 rounded-full w-3/4" />
    </div>
    <div className="flex justify-between mt-2 text-xs text-base-content/40">
      <span>Deposit amount</span>
      <span>3,750 USDC</span>
    </div>
  </div>
);

const BorrowCard = () => (
  <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-5 max-w-sm mx-auto">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <Image src="/logos/usdc.svg" alt="USDC" width={36} height={36} className="rounded-full" />
        <div>
          <div className="font-semibold">USDC</div>
          <div className="text-xs text-error">-$8,200.00</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-base-content/50">Borrow APR</div>
        <div className="text-lg font-bold text-error">4.80%</div>
      </div>
    </div>
    <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-base-content/60">Better rate on</span>
        <div className="flex items-center gap-2">
          <Image src="/logos/morpho.svg" alt="Morpho" width={14} height={14} />
          <span className="text-xs font-medium">Morpho</span>
          <span className="text-xs font-bold text-success">3.20%</span>
        </div>
      </div>
    </div>
    <div className="text-xs text-base-content/40 text-center">
      Save <span className="text-success font-medium">1.60%</span> by refinancing
    </div>
  </div>
);

const SwapCard = () => (
  <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-5 max-w-sm mx-auto">
    <div className="text-xs text-base-content/50 mb-3 text-center">Swap Collateral</div>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Image src="/logos/weth.svg" alt="WETH" width={32} height={32} className="rounded-full" />
        <div>
          <div className="font-medium text-sm">WETH</div>
          <div className="text-xs text-base-content/50">2.5 ETH</div>
        </div>
      </div>
      <ArrowRightIcon className="w-5 h-5 text-base-content/30" />
      <div className="flex items-center gap-2">
        <Image src="/logos/wsteth.svg" alt="wstETH" width={32} height={32} className="rounded-full" />
        <div>
          <div className="font-medium text-sm">wstETH</div>
          <div className="text-xs text-base-content/50">2.15 wstETH</div>
        </div>
      </div>
    </div>
    <div className="border-t border-base-300/50 pt-3 flex justify-between text-xs text-base-content/40">
      <span>Same position, different collateral</span>
      <span className="text-success">+0.8% APY</span>
    </div>
  </div>
);

const LoopCard = () => (
  <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-5 max-w-sm mx-auto">
    <div className="flex items-center justify-center gap-2 mb-4">
      <div className="flex -space-x-2">
        <Image src="/logos/wsteth.svg" alt="wstETH" width={28} height={28} className="rounded-full border-2 border-base-200" />
        <Image src="/logos/weth.svg" alt="WETH" width={28} height={28} className="rounded-full border-2 border-base-200" />
      </div>
      <span className="font-semibold">wstETH / WETH Loop</span>
    </div>
    <div className="space-y-2 mb-4">
      <div className="flex justify-between text-sm">
        <span className="text-base-content/50">Collateral</span>
        <span>5.0 wstETH <span className="text-base-content/40">→</span> <span className="text-success">15.0 wstETH</span></span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-base-content/50">Debt</span>
        <span className="text-error">10.0 WETH</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-base-content/50">Leverage</span>
        <span className="font-medium">3x</span>
      </div>
    </div>
    <div className="bg-success/10 border border-success/20 rounded-lg p-2 text-center">
      <span className="text-xs text-success">Net APY: +4.2% (leveraged staking yield)</span>
    </div>
    <div className="mt-3 text-[10px] text-base-content/30 text-center">
      Supports zapping from any token
    </div>
  </div>
);

const PendleCard = () => (
  <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-5 max-w-sm mx-auto">
    <div className="flex items-center justify-center gap-2 mb-4">
      <Image src="/logos/pendle.png" alt="Pendle" width={24} height={24} />
      <span className="font-semibold">Pendle Integration</span>
    </div>
    <div className="space-y-3 mb-4">
      <div className="bg-base-300/30 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={20} height={20} className="rounded-full" />
          <span className="text-sm font-medium">PT-USDai-19FEB2026</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-base-content/50">Fixed APY</span>
          <span className="text-success font-medium">8.42%</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-base-content/40">
        <span>Swap</span>
        <ArrowRightIcon className="w-3 h-3" />
        <span>Leverage</span>
        <ArrowRightIcon className="w-3 h-3" />
        <span>Refinance</span>
      </div>
    </div>
    <div className="text-xs text-base-content/40 text-center">
      Full PT token support via Pendle Router
    </div>
  </div>
);

const RefinanceCard = () => (
  <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-5 max-w-md mx-auto">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Image src="/logos/aave.svg" alt="Aave" width={28} height={28} />
        <span className="font-medium">Aave</span>
      </div>
      <ArrowRightIcon className="w-5 h-5 text-base-content/30" />
      <div className="flex items-center gap-2">
        <Image src="/logos/morpho.svg" alt="Morpho" width={28} height={28} />
        <span className="font-medium">Morpho</span>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="bg-base-300/30 rounded-lg p-3">
        <div className="text-xs text-base-content/50 mb-1">Collateral</div>
        <div className="flex items-center gap-2">
          <Image src="/logos/wsteth.svg" alt="wstETH" width={18} height={18} />
          <span>5.25 wstETH</span>
        </div>
      </div>
      <div className="bg-base-300/30 rounded-lg p-3">
        <div className="text-xs text-base-content/50 mb-1">Debt</div>
        <div className="flex items-center gap-2">
          <Image src="/logos/usdc.svg" alt="USDC" width={18} height={18} />
          <span className="text-error">$12,000</span>
        </div>
      </div>
    </div>
    <div className="mt-3 text-xs text-base-content/40 text-center">
      Move entire position in one atomic transaction
    </div>
  </div>
);

// Action tabs configuration
const actionTabs = [
  { id: "lend", label: "Lend", description: <>Deposit assets to earn yield. Compare rates <strong className="text-base-content/70">across all protocols</strong>.</>, content: <LendCard /> },
  { id: "borrow", label: "Borrow", description: <>Borrow against collateral. Kapan highlights better rates <strong className="text-base-content/70">on every protocol</strong>.</>, content: <BorrowCard /> },
  { id: "loop", label: "Loop", description: <>Create leveraged positions <strong className="text-base-content/70">on any protocol</strong>. Repay with collateral. Zap from any token.</>, content: <LoopCard /> },
  { id: "swap", label: "Swap", description: <>Switch collateral or debt assets atomically <strong className="text-base-content/70">on all protocols</strong>.</>, content: <SwapCard /> },
  { id: "refinance", label: "Refinance", description: <>Move positions <strong className="text-base-content/70">between any protocols</strong> to optimize rates.</>, content: <RefinanceCard /> },
  { id: "pendle", label: "Pendle", description: <>Leverage PT tokens, swap between them, and refinance <strong className="text-base-content/70">on every protocol</strong>.</>, content: <PendleCard /> },
];

const ActionTabs = () => {
  const [activeTab, setActiveTab] = useState("lend");
  const activeAction = actionTabs.find(t => t.id === activeTab)!;

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* Tab bar */}
      <div className="flex items-center justify-center gap-1 mb-6">
        {actionTabs.map((tab) => (
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
                layoutId="action-tab-underline"
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
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="text-center"
        >
          {/* Description */}
          <p className="text-sm text-base-content/40 mb-8 max-w-md mx-auto">
            {activeAction.description}
          </p>
          {/* Compact card */}
          {activeAction.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export const StickyLanding = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Force kapan dark theme on landing page
  useKapanTheme();

  // Parallax grid effect - mouse tracking
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Smooth spring animation for mouse movement (inverse parallax)
  const gridX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const gridY = useSpring(mouseY, { stiffness: 50, damping: 20 });
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    // Map mouse position to -40px to 40px range (inverse: subtract from center)
    const xOffset = ((clientX / innerWidth) - 0.5) * -80;
    const yOffset = ((clientY / innerHeight) - 0.5) * -80;
    mouseX.set(xOffset);
    mouseY.set(yOffset);
  };

  const sections: SectionData[] = [
    {
      tag: "00 / KAPAN",
      title: "ONE DASHBOARD.",
      titlePhrases: ["ONE DASHBOARD.", "EVERY PROTOCOL.", "ALL NETWORKS."],
      description: "View all your lending positions in one place. Refinance debt, swap collateral, and migrate between protocols—all in a single atomic transaction.",
      content: <HeroContent />,
    },
    {
      tag: "01 / PORTFOLIO",
      title: "SEE EVERYTHING.",
      description: "All your DeFi lending positions across protocols, unified in a single view. Compare rates, track health, and spot opportunities instantly.",
      content: <DashboardPreview />,
      compactHeader: true,
    },
    {
      tag: "02 / ACTIONS",
      title: "DO MORE.",
      description: "Lend, borrow, swap collateral, and refinance between protocols. All operations are atomic—no extra capital needed.",
      content: <ActionTabs />,
      compactHeader: true,
    },
    {
      tag: "03 / HOW",
      title: "HOW IT WORKS.",
      description: "Composable lending instructions powered by flash loans.",
      content: <HowItWorks />,
      compactHeader: true,
    },
    {
      tag: "04 / WHY",
      title: "BUILT FOR YOU.",
      description: "Everything you need for efficient DeFi lending, without the usual friction.",
      content: <FeatureList />,
      compactHeader: true,
    },
    {
      tag: "05 / START",
      title: "GET STARTED.",
      description: "Start optimizing your DeFi lending today.",
      content: <FinalCTA />,
    },
  ];

  const { scrollYProgress } = useScroll({ container: containerRef });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  
  // Scroll-based parallax: grid shifts up as you scroll down
  const scrollGridY = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const smoothScrollGridY = useSpring(scrollGridY, { stiffness: 50, damping: 20 });

  return (
    <div 
      className="fixed inset-0 bg-base-100 text-base-content overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Background grid with parallax effect */}
      <motion.div 
        className="absolute inset-0"
        style={{ 
          x: gridX, 
          y: smoothScrollGridY,
        }}
      >
        <motion.div 
          className="absolute -inset-24 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]"
          style={{ y: gridY }}
        />
      </motion.div>
      
      {/* Radial glow - fixed position, no parallax */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="h-full w-full hide-scrollbar relative z-10 overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        {/* Total height based on sections */}
        <div style={{ height: `${sections.length * 100}vh` }} className="relative">
          {/* Snap targets */}
          <div className="absolute inset-0 flex flex-col pointer-events-none">
            {sections.map((_, i) => (
              <div key={i} className="h-screen w-full snap-start" />
            ))}
          </div>

          {/* Sticky viewport */}
          <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
            {/* Scroll progress indicator */}
            <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 h-48 w-[1px] bg-base-content/5 hidden lg:block">
              <motion.div
                className="w-full bg-base-content/40 origin-top"
                style={{ height: "100%", scaleY: smoothProgress }}
              />
            </div>

            {/* Sections */}
            {sections.map((section, i) => (
              <StickySection
                key={i}
                section={section}
                index={i}
                total={sections.length}
                scrollYProgress={smoothProgress}
              />
            ))}

            {/* Scroll hint on first section */}
            <motion.div
              style={{ opacity: useTransform(smoothProgress, [0, 0.1], [1, 0]) }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-base-content/30"
            >
              <span className="landing-tag">Scroll to explore</span>
              <ChevronDownIcon className="w-5 h-5 animate-bounce" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StickyLanding;
