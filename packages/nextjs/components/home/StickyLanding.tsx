"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useSpring, useTransform, useMotionValue } from "framer-motion";
import { ChevronDownIcon, ChevronUpIcon, ArrowRightIcon, ArrowPathIcon, ShieldCheckIcon, BoltIcon, CurrencyDollarIcon, SparklesIcon, CubeTransparentIcon, PuzzlePieceIcon, RocketLaunchIcon, PlusIcon, MinusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@radix-ui/themes";
import { track } from "@vercel/analytics";
import { StickySection, SectionData } from "./StickySection";
import { useKapanTheme } from "~~/hooks/useKapanTheme";
import { useLandingSection } from "~~/contexts/LandingSectionContext";

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
  { name: "AVNU", logo: "/logos/avnu.png" },
  { name: "Pendle", logo: "/logos/pendle.png" },
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
      {/* Features grid - centered with consistent spacing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 w-full max-w-2xl">
        {features.map((f, i) => (
          <div key={i} className="flex gap-4 text-left">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-base-content/5 border border-base-content/5 flex items-center justify-center">
              <f.icon className="w-5 h-5 text-base-content/60" />
            </div>
            <div className="pt-0.5">
              <div className="text-sm font-semibold text-base-content mb-1">{f.title}</div>
              <div className="text-sm text-base-content/40 leading-relaxed">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Supported networks/protocols/integrations marquees */}
      <div className="w-full space-y-3 pt-6 border-t border-base-content/5">
        <MarqueeRow items={duplicatedNetworks} label="Networks" />
        <MarqueeRow items={duplicatedSupportedProtocols} label="Protocols" reverse />
        <MarqueeRow items={duplicatedIntegrations} label="Routers" />
      </div>
    </div>
  );
};

// Neon letter flicker - each letter flickers on individually
const NeonLetter = ({ letter, delay, animate }: { letter: string; delay: number; animate: boolean }) => (
  <motion.span
    className="inline-block"
    initial={{ opacity: 0 }}
    animate={animate ? { 
      opacity: [0, 0, 0.8, 0, 0.6, 0.1, 0.9, 0.2, 1, 0.7, 1],
    } : { opacity: 0 }}
    transition={{ 
      delay,
      duration: 0.8,
      times: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      ease: "linear" as const,
    }}
  >
    {letter}
  </motion.span>
);

// Final CTA section with Fallout neon sign effect
const FinalCTA = ({ isActive = false }: { isActive?: boolean }) => {
  const letters = "KAPAN".split("");
  
  return (
    <div className="flex flex-col items-center gap-10 text-center px-4">
      {/* Logo + KAPAN text - Fallout sign style */}
      <div className="flex flex-col items-center gap-4">
        {/* Logo flickers first */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isActive ? { 
            opacity: [0, 0, 0.7, 0, 0, 0.5, 0.1, 0.8, 0, 0.9, 0.3, 1, 0.8, 1],
          } : { opacity: 0 }}
          transition={{ 
            delay: 0.3,
            duration: 1.2,
            times: [0, 0.05, 0.1, 0.18, 0.28, 0.35, 0.4, 0.5, 0.58, 0.68, 0.78, 0.88, 0.94, 1],
            ease: "linear" as const,
          }}
          className="w-16 h-16 md:w-20 md:h-20 relative"
        >
          <Image src="/seal-logo.png" alt="Kapan" fill className="object-contain" />
        </motion.div>
        
        {/* Letters flicker on one by one */}
        <div className="text-4xl md:text-5xl font-black tracking-[0.3em] uppercase">
          {letters.map((letter, i) => (
            <NeonLetter key={i} letter={letter} delay={1.5 + i * 0.25} animate={isActive} />
          ))}
        </div>
      </div>

      {/* Button flickers on after letters - big dramatic flicker */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isActive ? { 
          opacity: [0, 0, 1, 0, 0.8, 0, 1, 0.3, 1, 0.6, 1, 1],
        } : { opacity: 0 }}
        transition={{ 
          delay: 3.0,
          duration: 1.0,
          times: [0, 0.1, 0.15, 0.22, 0.3, 0.38, 0.5, 0.6, 0.72, 0.82, 0.92, 1],
          ease: "linear" as const,
        }}
      >
        <LaunchAppButton />
      </motion.div>
      
      {/* Links slide up and fade in after button */}
      <motion.div 
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ delay: 4.2, duration: 0.6, ease: "easeOut" }}
      >
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
      </motion.div>
    </div>
  );
};

// How it Works section - Kapan as orchestrator visualization
const HowItWorks = () => {
  // Protocols positioned around Kapan - using consistent percentage-based positioning
  // Angles: 0=top, 45=top-right, 90=right, 135=bottom-right, 180=bottom, 225=bottom-left, 270=left, 315=top-left
  const connectedProtocols = [
    { name: "Aave", logo: "/logos/aave.svg", angle: 0 },
    { name: "Morpho", logo: "/logos/morpho.svg", angle: 45 },
    { name: "Compound", logo: "/logos/compound.svg", angle: 90 },
    { name: "1inch", logo: "/logos/1inch.png", angle: 135 },
    { name: "Pendle", logo: "/logos/pendle.png", angle: 180 },
    { name: "Venus", logo: "/logos/venus.svg", angle: 225 },
    { name: "ZeroLend", logo: "/logos/zerolend.svg", angle: 270 },
    { name: "Nostra", logo: "/logos/nostra.svg", angle: 315 },
  ];

  // Instructions that travel to specific protocols
  // deposit->Aave(0), borrow->Morpho(45), swap->1inch(135), swap PT->Pendle(180), repay->Venus(225), move->Nostra(315)
  const travelingInstructions = [
    { instruction: "deposit", angle: 0, delay: 0, color: "bg-success/20 text-success border-success/30" },
    { instruction: "borrow", angle: 45, delay: 1.5, color: "bg-error/20 text-error border-error/30" },
    { instruction: "swap", angle: 135, delay: 3, color: "bg-primary/20 text-primary border-primary/30" },
    { instruction: "swap PT", angle: 180, delay: 4.5, color: "bg-warning/20 text-warning border-warning/30" },
    { instruction: "repay", angle: 225, delay: 6, color: "bg-info/20 text-info border-info/30" },
    { instruction: "move", angle: 315, delay: 7.5, color: "bg-secondary/20 text-secondary border-secondary/30" },
  ];

  // Shared radius values - X is larger since container is wider than tall
  const radiusX = 42; // percentage from center horizontally
  const radiusY = 38; // percentage from center vertically
  
  // Helper to calculate position from angle
  const getPosition = (angle: number, radius: number = 1) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: 50 + Math.cos(radians) * radiusX * radius,
      y: 50 + Math.sin(radians) * radiusY * radius,
    };
  };

  return (
    <div className="flex flex-col items-center gap-10 max-w-5xl mx-auto px-4">
      {/* Mobile: Just Kapan logo centered */}
      <div className="md:hidden flex flex-col items-center gap-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
        >
          <div className="w-20 h-20 rounded-2xl bg-base-200/80 border border-base-content/20 flex items-center justify-center shadow-lg">
            <Image src="/seal-logo.png" alt="Kapan" width={48} height={48} />
          </div>
        </motion.div>
        
        {/* Protocol logos in a row */}
        <div className="flex flex-wrap items-center justify-center gap-3 max-w-xs">
          {connectedProtocols.map((protocol, i) => (
            <motion.div
              key={protocol.name}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.05 }}
            >
              <div className="w-8 h-8 rounded-lg bg-base-200/60 border border-base-content/10 flex items-center justify-center">
                <Image src={protocol.logo} alt={protocol.name} width={18} height={18} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Desktop: Full orchestrator visualization */}
      <div className="hidden md:flex items-center justify-center w-full">
        <div className="relative w-full max-w-2xl h-[350px]">
          {/* Connection lines using same percentage system */}
          <svg className="absolute inset-0 w-full h-full overflow-visible">
            {connectedProtocols.map((protocol, i) => {
              const pos = getPosition(protocol.angle);
              return (
                <motion.line
                  key={i}
                  x1="50%"
                  y1="50%"
                  x2={`${pos.x}%`}
                  y2={`${pos.y}%`}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-base-content/10"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                />
              );
            })}
          </svg>

          {/* Traveling instructions */}
          {travelingInstructions.map((item, i) => {
            const endPos = getPosition(item.angle, 0.65); // Stop at 65% of the way
            return (
              <React.Fragment key={i}>
                {/* Outbound: instruction travels TO protocol */}
                <motion.div
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-5 pointer-events-none"
                  initial={{ left: "50%", top: "50%", opacity: 0 }}
                  animate={{ 
                    left: ["50%", "50%", `${endPos.x}%`, `${endPos.x}%`],
                    top: ["50%", "50%", `${endPos.y}%`, `${endPos.y}%`],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{ 
                    delay: item.delay,
                    duration: 2.5,
                    repeat: Infinity,
                    repeatDelay: 3.5,
                    times: [0, 0.1, 0.7, 1],
                    ease: "easeInOut",
                  }}
                >
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border ${item.color} whitespace-nowrap`}>
                    {item.instruction}
                  </span>
                </motion.div>
                
                {/* Return: UTXO travels back FROM protocol */}
                <motion.div
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-5 pointer-events-none"
                  initial={{ left: `${endPos.x}%`, top: `${endPos.y}%`, opacity: 0 }}
                  animate={{ 
                    left: [`${endPos.x}%`, `${endPos.x}%`, "50%", "50%"],
                    top: [`${endPos.y}%`, `${endPos.y}%`, "50%", "50%"],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{ 
                    delay: item.delay + 2.8,
                    duration: 2.5,
                    repeat: Infinity,
                    repeatDelay: 3.5,
                    times: [0, 0.1, 0.7, 1],
                    ease: "easeInOut",
                  }}
                >
                  <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded border bg-base-content/10 text-base-content/60 border-base-content/20 whitespace-nowrap">
                    UTXO
                  </span>
                </motion.div>
              </React.Fragment>
            );
          })}

          {/* Center - Kapan Router */}
          <motion.div 
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-base-100 border border-base-content/20 rounded-lg shadow-lg">
              <Image src="/seal-logo.png" alt="Kapan" width={24} height={24} />
              <span className="font-bold text-sm tracking-wide">KAPAN</span>
            </div>
          </motion.div>

          {/* Surrounding protocols */}
          {connectedProtocols.map((protocol, i) => {
            const pos = getPosition(protocol.angle);
            return (
              <motion.div
                key={protocol.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-xl bg-base-100 border border-base-content/10 flex items-center justify-center shadow-md">
                    <Image src={protocol.logo} alt={protocol.name} width={28} height={28} />
                  </div>
                  <span className="text-[10px] text-base-content/40 font-medium">{protocol.name}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Explanation text */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 text-center">
        <motion.div 
          className="max-w-[200px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="text-[10px] uppercase tracking-widest text-primary mb-1">01</div>
          <div className="text-sm font-medium mb-1">Bundle Instructions</div>
          <div className="text-xs text-base-content/40">Combine deposit, borrow, swap, and repay into one bundle.</div>
        </motion.div>
        <motion.div 
          className="max-w-[200px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95 }}
        >
          <div className="text-[10px] uppercase tracking-widest text-primary mb-1">02</div>
          <div className="text-sm font-medium mb-1">Flash Loan Powered</div>
          <div className="text-xs text-base-content/40">No upfront capital needed. Borrow, execute, repay atomically.</div>
        </motion.div>
        <motion.div 
          className="max-w-[200px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
        >
          <div className="text-[10px] uppercase tracking-widest text-primary mb-1">03</div>
          <div className="text-sm font-medium mb-1">All or Nothing</div>
          <div className="text-xs text-base-content/40">Transaction succeeds completely or reverts. No partial states.</div>
        </motion.div>
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

// Tooltip wrapper using Radix UI for professional look
const MockTooltip = ({ children, tip }: { children: React.ReactNode; tip: string }) => (
  <Tooltip content={tip} delayDuration={100}>
    <span className="cursor-help">{children}</span>
  </Tooltip>
);

// Mock action button matching real SegmentedActionBar style
const MockActionButton = ({ icon, label, tip }: { icon: React.ReactNode; label: string; tip: string }) => (
  <Tooltip content={tip} delayDuration={100}>
    <button 
      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-base-content/50 hover:text-base-content/70 hover:bg-base-content/5 transition-colors cursor-help"
    >
      {icon}
      <span>{label}</span>
    </button>
  </Tooltip>
);

// Mock Morpho Blue protocol view - matches real dashboard layout with mobile responsiveness
const MockMorphoView = () => (
  <div className="w-full flex flex-col p-2 sm:p-3 space-y-2">
    {/* Protocol Header Card */}
    <div className="card bg-base-200/40 shadow-lg rounded-xl border border-base-300/50">
      <div className="card-body px-3 sm:px-5 py-2 sm:py-3">
        {/* Mobile Protocol Header */}
        <div className="flex md:hidden items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 relative rounded-lg bg-gradient-to-br from-base-200 to-base-300/50 p-1.5 flex items-center justify-center ring-1 ring-base-300/30">
              <Image src="/logos/morpho.svg" alt="Morpho Blue" width={18} height={18} className="object-contain" />
            </div>
            <span className="text-sm font-bold">Morpho Blue</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <MockTooltip tip="Net balance">
              <span className="text-success font-mono font-semibold">$6.55K</span>
            </MockTooltip>
            <MockTooltip tip="Net APY">
              <span className="text-success font-mono font-semibold">+44.79%</span>
            </MockTooltip>
          </div>
        </div>

        {/* Desktop Protocol Header */}
        <div className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-4">
          <MockTooltip tip="The lending protocol where this position lives">
            <div className="flex items-center gap-3 cursor-help">
              <div className="w-10 h-10 relative rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-2 flex items-center justify-center shadow-sm ring-1 ring-base-300/30">
                <Image src="/logos/morpho.svg" alt="Morpho Blue" width={24} height={24} className="object-contain drop-shadow-sm" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Protocol</span>
                <span className="text-base font-bold tracking-tight">Morpho Blue</span>
              </div>
            </div>
          </MockTooltip>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-base-300 to-transparent" />
          <div className="flex-1 flex flex-wrap items-center justify-around gap-y-3">
            <MockTooltip tip="Total value of your positions (collateral minus debt)">
              <div className="flex flex-col gap-1 items-center px-3 py-1 cursor-help">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Balance</span>
                <span className="text-sm font-mono font-bold tabular-nums text-success">$6.55K</span>
              </div>
            </MockTooltip>
            <MockTooltip tip="Estimated earnings over the last 30 days">
              <div className="flex flex-col gap-1 items-center px-3 py-1 cursor-help">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">30D Yield</span>
                <span className="text-sm font-mono font-bold tabular-nums text-success">$241.28</span>
              </div>
            </MockTooltip>
            <MockTooltip tip="Net APY: supply yield minus borrow cost">
              <div className="flex flex-col gap-1 items-center px-3 py-1 cursor-help">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Net APY</span>
                <span className="text-sm font-mono font-bold tabular-nums text-success">+44.79%</span>
              </div>
            </MockTooltip>
            <MockTooltip tip="How much of your borrowing capacity you're using">
              <div className="flex flex-col gap-1 items-center px-3 py-1 cursor-help">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Utilization</span>
                <div className="flex items-center gap-2.5">
                  <div className="w-24 h-1.5 bg-base-300/60 rounded-full overflow-hidden">
                    <div className="h-full bg-error rounded-full w-[90%]" />
                  </div>
                  <span className="text-xs font-mono font-semibold tabular-nums text-error">90%</span>
                </div>
              </div>
            </MockTooltip>
          </div>
          <MockTooltip tip="View available markets on this protocol">
            <div className="flex items-center gap-1 text-xs text-base-content/50 cursor-help border border-base-content/20 rounded px-2 py-1">
              <span>Markets</span>
              <ChevronDownIcon className="w-4 h-4" />
            </div>
          </MockTooltip>
        </div>
      </div>
    </div>

    {/* YOUR POSITIONS section */}
    <div className="card bg-base-200/40 shadow-md rounded-xl border border-base-300/50">
      <div className="card-body p-3 sm:p-4 space-y-2 sm:space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 sm:h-5 rounded-full bg-primary" />
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-widest text-base-content/60">Your Positions</span>
          </div>
          <MockTooltip tip="Number of active markets you have positions in">
            <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-primary/10 text-primary cursor-help">
              <span className="text-[10px] sm:text-xs font-mono font-bold">1</span>
              <span className="text-[8px] sm:text-[10px] uppercase tracking-wider opacity-70">market</span>
            </div>
          </MockTooltip>
        </div>

        {/* Market pair - expanded view */}
        <div className="rounded-lg border border-primary/30 overflow-hidden ring-1 ring-primary/10">
          {/* Market pair header - Mobile */}
          <div className="flex md:hidden items-center justify-between bg-base-200/50 px-3 py-2 border-b border-base-300">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={18} height={18} className="rounded-full border border-base-200 bg-base-200" />
                <Image src="/logos/usdc.svg" alt="USDC" width={18} height={18} className="rounded-full border border-base-200 bg-base-200" />
              </div>
              <span className="text-xs font-semibold truncate max-w-[120px]">PT-USDai/USDC</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-success font-mono">$6.55K</span>
              <span className="text-warning font-mono">89.7%</span>
            </div>
          </div>

          {/* Market pair header - Desktop */}
          <div className="hidden md:flex items-center justify-between bg-base-200/50 px-4 py-2.5 border-b border-base-300">
            <div className="flex items-center gap-3">
              <MockTooltip tip="Isolated lending market: PT-USDai collateral, USDC debt">
                <div className="flex items-center gap-3 cursor-help">
                  <div className="flex -space-x-1.5">
                    <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={22} height={22} className="rounded-full border-2 border-base-200 bg-base-200" />
                    <Image src="/logos/usdc.svg" alt="USDC" width={22} height={22} className="rounded-full border-2 border-base-200 bg-base-200" />
                  </div>
                  <span className="text-sm font-semibold">PT-USDai-19FEB2026/USDC</span>
                </div>
              </MockTooltip>
              <div className="flex items-center gap-1.5">
                <Image src="/logos/morpho.svg" alt="Morpho" width={14} height={14} />
                <MockTooltip tip="View on Morpho">
                  <a href="#" className="text-base-content/40 hover:text-base-content/60">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </MockTooltip>
              </div>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <MockTooltip tip="Net position value (collateral - debt)">
                <span className="text-base-content/50 cursor-help">Net: <span className="text-success font-mono font-semibold">$6.55K</span></span>
              </MockTooltip>
              <MockTooltip tip="Combined APY after borrow costs">
                <span className="text-base-content/50 cursor-help">APY: <span className="text-success font-mono font-semibold">+44.79%</span></span>
              </MockTooltip>
              <MockTooltip tip="Loan-to-Value: 89.7% used of 92% max">
                <span className="text-base-content/50 cursor-help">LTV: <span className="text-warning font-mono font-semibold">89.7%</span><span className="text-base-content/40">/92%</span></span>
              </MockTooltip>
              <MockTooltip tip="Projected 30-day earnings">
                <span className="text-base-content/50 cursor-help">30D: <span className="text-success font-mono font-semibold">$241.28</span></span>
              </MockTooltip>
            </div>
          </div>

          {/* Mobile: Stacked layout */}
          <div className="md:hidden bg-base-200/20">
            {/* Collateral */}
            <div className="px-3 py-2 border-b border-base-300/50">
              <div className="flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={28} height={28} className="rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-base-content/40 uppercase tracking-wider">Collateral</div>
                  <div className="font-medium text-xs truncate">PT-USDai-1...</div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-[8px] text-base-content/40 uppercase">Bal</div>
                    <div className="text-xs font-mono font-semibold text-success">$63.8K</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-base-content/40 uppercase">APY</div>
                    <div className="text-xs font-mono font-semibold">7.46%</div>
                  </div>
                </div>
              </div>
              {/* Mobile action buttons */}
              <div className="flex items-center gap-1 mt-2">
                <button className="flex-1 text-[10px] text-base-content/50 py-1 hover:bg-base-content/5 rounded">+ Deposit</button>
                <button className="flex-1 text-[10px] text-base-content/50 py-1 hover:bg-base-content/5 rounded">- Withdraw</button>
                <button className="flex-1 text-[10px] text-base-content/50 py-1 hover:bg-base-content/5 rounded">Move</button>
              </div>
            </div>
            {/* Debt */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <Image src="/logos/usdc.svg" alt="USDC" width={28} height={28} className="rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-base-content/40 uppercase tracking-wider">Debt</div>
                  <div className="font-medium text-xs">USDC</div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-[8px] text-base-content/40 uppercase">Bal</div>
                    <div className="text-xs font-mono font-semibold text-error">-$57.3K</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-base-content/40 uppercase">APR</div>
                    <div className="text-xs font-mono font-semibold">3.19%</div>
                  </div>
                </div>
              </div>
              {/* Mobile action buttons */}
              <div className="flex items-center gap-1 mt-2">
                <button className="flex-1 text-[10px] text-base-content/50 py-1 hover:bg-base-content/5 rounded">- Repay</button>
                <button className="flex-1 text-[10px] text-base-content/50 py-1 hover:bg-base-content/5 rounded">+ Borrow</button>
                <button className="flex-1 text-[10px] text-base-content/50 py-1 hover:bg-base-content/5 rounded">Move</button>
              </div>
            </div>
          </div>

          {/* Desktop: Two-column layout */}
          <div className="hidden md:grid grid-cols-2 divide-x divide-base-300">
            {/* Collateral side */}
            <div className="bg-base-200/20">
              {/* Using 12-col grid like real app: token=3, stats=8, chevron=1 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-base-300/50">
                {/* Token - col-span-3 */}
                <div className="col-span-3 flex items-center gap-2 min-w-0">
                  <MockTooltip tip="Pendle Principal Token - fixed yield until maturity">
                    <div className="relative cursor-help flex-shrink-0">
                      <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={36} height={36} className="rounded-full" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-base-200 border border-base-300 flex items-center justify-center">
                        <Image src="/logos/pendle.png" alt="Pendle" width={10} height={10} />
                      </div>
                    </div>
                  </MockTooltip>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">PT-USDai-1...</div>
                  </div>
                </div>
                {/* Stats - col-span-9, evenly distributed */}
                <div className="col-span-9 grid grid-cols-4 gap-0">
                  <MockTooltip tip="Total collateral value">
                    <div className="text-center cursor-help px-2 border-r border-base-300/30">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">Balance</div>
                      <div className="text-sm font-mono font-semibold text-success">$63.83K</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Current yield rate">
                    <div className="text-center cursor-help px-2 border-r border-base-300/30">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">APY</div>
                      <div className="text-sm font-mono font-semibold">7.46%</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Best available rate across protocols">
                    <div className="text-center cursor-help px-2 border-r border-base-300/30">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">Best APY</div>
                      <div className="flex items-center gap-1 justify-center">
                        <span className="text-sm font-mono font-semibold text-success">7.46%</span>
                        <Image src="/logos/morpho.svg" alt="Morpho" width={12} height={12} />
                      </div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Loan-to-Value ratio">
                    <div className="text-center cursor-help px-2">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">LTV</div>
                      <div className="text-sm font-mono font-semibold text-warning">89.7%</div>
                    </div>
                  </MockTooltip>
                </div>
              </div>
              <div className="flex items-stretch divide-x divide-base-300/30">
                <MockActionButton icon={<PlusIcon className="w-3.5 h-3.5" />} label="Deposit" tip="Add more collateral to reduce liquidation risk" />
                <MockActionButton icon={<MinusIcon className="w-3.5 h-3.5" />} label="Withdraw" tip="Remove collateral from your position" />
                <MockActionButton icon={<ArrowRightIcon className="w-3.5 h-3.5" />} label="Move" tip="Move collateral to another protocol" />
              </div>
            </div>

            {/* Debt side */}
            <div className="bg-base-200/20">
              {/* Using 12-col grid: token=3, stats=8, chevron=1 */}
              <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-base-300/50">
                {/* Token - col-span-3 */}
                <div className="col-span-3 flex items-center gap-2 min-w-0">
                  <MockTooltip tip="USDC stablecoin borrowed against collateral">
                    <Image src="/logos/usdc.svg" alt="USDC" width={36} height={36} className="rounded-full cursor-help flex-shrink-0" />
                  </MockTooltip>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">USDC</div>
                  </div>
                </div>
                {/* Stats - col-span-8, evenly distributed */}
                <div className="col-span-8 grid grid-cols-3 gap-0">
                  <MockTooltip tip="Total debt owed">
                    <div className="text-center cursor-help px-2 border-r border-base-300/30">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">Balance</div>
                      <div className="text-sm font-mono font-semibold text-error">-$57.28K</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Current borrow rate">
                    <div className="text-center cursor-help px-2 border-r border-base-300/30">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">APR</div>
                      <div className="text-sm font-mono font-semibold">3.19%</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Best available borrow rate">
                    <div className="text-center cursor-help px-2">
                      <div className="text-[10px] text-base-content/40 uppercase tracking-wider">Best APR</div>
                      <div className="flex items-center gap-1 justify-center">
                        <span className="text-sm font-mono font-semibold text-success">3.72%</span>
                        <Image src="/logos/aave.svg" alt="Aave" width={12} height={12} />
                      </div>
                    </div>
                  </MockTooltip>
                </div>
                {/* Chevron - col-span-1 */}
                <div className="col-span-1 flex justify-end">
                  <MockTooltip tip="Collapse position details">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-base-300/30 cursor-help">
                      <ChevronUpIcon className="w-4 h-4 text-base-content/50" />
                    </div>
                  </MockTooltip>
                </div>
              </div>
              <div className="flex items-stretch divide-x divide-base-300/30">
                <MockActionButton icon={<MinusIcon className="w-3.5 h-3.5" />} label="Repay" tip="Pay back debt to reduce interest costs" />
                <MockActionButton icon={<PlusIcon className="w-3.5 h-3.5" />} label="Borrow" tip="Borrow more against your collateral" />
                <MockActionButton icon={<ArrowRightIcon className="w-3.5 h-3.5" />} label="Move" tip="Move debt to another protocol" />
                <MockActionButton icon={<XMarkIcon className="w-3.5 h-3.5" />} label="Close" tip="Close entire position" />
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
  <div className="w-full flex flex-col p-2 sm:p-3">
    <div className="card bg-base-200/40 shadow-lg rounded-xl border border-base-300/50">
      <div className="card-body px-3 sm:px-5 py-2 sm:py-3">
        {/* Mobile */}
        <div className="flex md:hidden items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 relative rounded-lg bg-gradient-to-br from-base-200 to-base-300/50 p-1.5 flex items-center justify-center ring-1 ring-base-300/30">
              <Image src="/logos/aave.svg" alt="Aave V3" width={18} height={18} className="object-contain" />
            </div>
            <span className="text-sm font-bold">Aave V3</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-success font-mono font-semibold">$2.36K</span>
            <span className="text-error font-mono font-semibold">-3.85%</span>
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-4">
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
                  <div className="h-full bg-warning rounded-full w-[81%]" />
                </div>
                <span className="text-xs font-mono font-semibold tabular-nums text-warning">81%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-base-content/50">
            <span>Markets</span>
            <ChevronDownIcon className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Dashboard preview - Morpho with positions, Aave header fading out
const DashboardPreview = () => (
  <div className="relative w-full max-w-5xl mx-auto">
    <MockMorphoView />
    <div className="pointer-events-none">
      <MockAaveHeader />
    </div>
    {/* Fade overlay on bottom */}
    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-base-100 via-base-100/90 to-transparent pointer-events-none" />
  </div>
);

// Animated flow component - shows the transaction being built
const FlowStep = ({ 
  children, 
  delay = 0,
  isActive = true 
}: { 
  children: React.ReactNode; 
  delay?: number;
  isActive?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0.3, y: 0 }}
    transition={{ delay, duration: 0.4, ease: "easeOut" }}
    className="flex-shrink-0"
  >
    {children}
  </motion.div>
);

// Horizontal flow step for desktop
const HFlowStep = ({ 
  children, 
  delay = 0,
}: { 
  children: React.ReactNode; 
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.4, ease: "easeOut" }}
    className="flex-shrink-0"
  >
    {children}
  </motion.div>
);

// Token display - minimal, elegant
const TokenDisplay = ({ 
  logo, 
  symbol, 
  amount, 
  label,
  variant = "default",
  size = "md"
}: { 
  logo: string; 
  symbol: string; 
  amount?: string;
  label?: string;
  variant?: "default" | "success" | "error";
  size?: "sm" | "md" | "lg";
}) => {
  const sizes = {
    sm: { img: 24, amount: "text-base", symbol: "text-xs" },
    md: { img: 32, amount: "text-lg", symbol: "text-sm" },
    lg: { img: 40, amount: "text-xl", symbol: "text-base" },
  };
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <Image src={logo} alt={symbol} width={s.img} height={s.img} className="rounded-full" />
      <div>
        {label && <div className="text-[10px] uppercase tracking-wider text-base-content/30">{label}</div>}
        <div className="flex items-baseline gap-2">
          <span className={`font-mono ${s.amount} ${
            variant === "success" ? "text-success" : 
            variant === "error" ? "text-error" : 
            "text-base-content"
          }`}>
            {amount}
          </span>
          <span className={`text-base-content/50 ${s.symbol}`}>{symbol}</span>
        </div>
      </div>
    </div>
  );
};

// Protocol badge - clean, minimal
const ProtocolBadge = ({ logo, name, size = "md" }: { logo: string; name: string; size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: { img: 20, text: "text-xs" },
    md: { img: 28, text: "text-sm" },
    lg: { img: 36, text: "text-base" },
  };
  const s = sizes[size];
  return (
    <div className="flex items-center gap-2">
      <Image src={logo} alt={name} width={s.img} height={s.img} />
      <span className={`font-medium ${s.text}`}>{name}</span>
    </div>
  );
};

// Rate comparison - dramatic
const RateDisplay = ({ 
  oldRate, 
  newRate, 
  label = "APR",
  size = "lg"
}: { 
  oldRate?: string; 
  newRate: string; 
  label?: string;
  size?: "md" | "lg";
}) => (
  <div className={`flex items-baseline gap-3 ${size === "md" ? "" : ""}`}>
    <span className="text-xs uppercase tracking-wider text-base-content/30">{label}</span>
    {oldRate && (
      <span className="text-base-content/30 line-through font-mono">{oldRate}</span>
    )}
    <span className={`font-bold text-success font-mono ${size === "lg" ? "text-2xl sm:text-3xl" : "text-xl"}`}>{newRate}</span>
  </div>
);

// Animated arrow for horizontal flow
const FlowArrow = ({ delay = 0, vertical = false }: { delay?: number; vertical?: boolean }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay, duration: 0.3 }}
    className={`flex items-center justify-center ${vertical ? "py-2" : "px-4"}`}
  >
    <motion.div
      animate={vertical ? { y: [0, 3, 0] } : { x: [0, 3, 0] }}
      transition={{ duration: 1.2, repeat: Infinity }}
    >
      <ArrowRightIcon className={`w-5 h-5 text-base-content/20 ${vertical ? "rotate-90" : ""}`} />
    </motion.div>
  </motion.div>
);

// Action content wrapper - horizontal on desktop, vertical on mobile
const ActionContent = ({ children, description }: { children: React.ReactNode; description: string }) => (
  <div className="w-full max-w-4xl mx-auto">
    <motion.p 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-sm sm:text-base text-base-content/40 text-center mb-8 sm:mb-10"
    >
      {description}
    </motion.p>
    {children}
  </div>
);

const LendCard = () => (
  <ActionContent description="Deposit assets to earn yield. Compare rates across all protocols.">
    {/* Mobile: Vertical */}
    <div className="flex flex-col items-center gap-6 md:hidden">
      <FlowStep delay={0}>
        <TokenDisplay logo="/logos/usdc.svg" symbol="USDC" amount="5,000" label="Deposit" size="lg" />
      </FlowStep>
      <FlowArrow delay={0.2} vertical />
      <FlowStep delay={0.3}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <ProtocolBadge logo="/logos/aave.svg" name="Aave V3" size="lg" />
            <span className="text-[10px] uppercase tracking-wider text-success px-2 py-0.5 border border-success/20 rounded">Best</span>
          </div>
          <RateDisplay newRate="3.40%" label="APY" />
        </div>
      </FlowStep>
      <FlowStep delay={0.5}>
        <div className="flex items-center gap-4 text-base-content/25 text-xs">
          <span className="flex items-center gap-1"><Image src="/logos/morpho.svg" alt="" width={12} height={12} className="opacity-50" />3.21%</span>
          <span className="flex items-center gap-1"><Image src="/logos/compound.svg" alt="" width={12} height={12} className="opacity-50" />2.89%</span>
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden md:flex items-center justify-center gap-0">
      <HFlowStep delay={0}>
        <TokenDisplay logo="/logos/usdc.svg" symbol="USDC" amount="5,000" label="Deposit" size="lg" />
      </HFlowStep>
      <FlowArrow delay={0.15} />
      <HFlowStep delay={0.25}>
        <div className="flex flex-col items-center gap-2 px-6">
          <div className="flex items-center gap-3">
            <ProtocolBadge logo="/logos/aave.svg" name="Aave V3" size="lg" />
            <span className="text-[10px] uppercase tracking-wider text-success px-2 py-0.5 border border-success/20 rounded">Best rate</span>
          </div>
          <RateDisplay newRate="3.40%" label="Supply APY" />
        </div>
      </HFlowStep>
      <HFlowStep delay={0.4}>
        <div className="flex flex-col gap-2 text-base-content/25 text-xs pl-8 border-l border-base-content/10">
          <span className="flex items-center gap-1.5"><Image src="/logos/morpho.svg" alt="" width={14} height={14} className="opacity-50" />Morpho 3.21%</span>
          <span className="flex items-center gap-1.5"><Image src="/logos/compound.svg" alt="" width={14} height={14} className="opacity-50" />Compound 2.89%</span>
        </div>
      </HFlowStep>
    </div>
  </ActionContent>
);

const BorrowCard = () => (
  <ActionContent description="Borrow against your collateral. Compare rates across protocols.">
    {/* Mobile: Vertical */}
    <div className="flex flex-col items-center gap-6 md:hidden">
      <FlowStep delay={0}>
        <TokenDisplay logo="/logos/wsteth.svg" symbol="wstETH" amount="5.25" label="Collateral" size="lg" />
      </FlowStep>
      <FlowArrow delay={0.15} vertical />
      <FlowStep delay={0.25}>
        <TokenDisplay logo="/logos/usdc.svg" symbol="USDC" amount="10,000" label="Borrow" size="lg" />
      </FlowStep>
      <FlowStep delay={0.4}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <ProtocolBadge logo="/logos/morpho.svg" name="Morpho" size="md" />
            <span className="text-[10px] uppercase tracking-wider text-success px-2 py-0.5 border border-success/20 rounded">Best</span>
          </div>
          <RateDisplay newRate="3.20%" label="APR" />
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden md:flex items-center justify-center gap-0">
      <HFlowStep delay={0}>
        <TokenDisplay logo="/logos/wsteth.svg" symbol="wstETH" amount="5.25" label="Collateral" size="lg" />
      </HFlowStep>
      <FlowArrow delay={0.15} />
      <HFlowStep delay={0.25}>
        <TokenDisplay logo="/logos/usdc.svg" symbol="USDC" amount="10,000" label="Borrow" size="lg" />
      </HFlowStep>
      <FlowArrow delay={0.35} />
      <HFlowStep delay={0.45}>
        <div className="flex flex-col items-center gap-2 px-6">
          <div className="flex items-center gap-3">
            <ProtocolBadge logo="/logos/morpho.svg" name="Morpho" size="lg" />
            <span className="text-[10px] uppercase tracking-wider text-success px-2 py-0.5 border border-success/20 rounded">Best rate</span>
          </div>
          <RateDisplay newRate="3.20%" label="Borrow APR" />
        </div>
      </HFlowStep>
      <HFlowStep delay={0.55}>
        <div className="flex flex-col gap-2 text-base-content/25 text-xs pl-8 border-l border-base-content/10">
          <span className="flex items-center gap-1.5"><Image src="/logos/aave.svg" alt="" width={14} height={14} className="opacity-50" />Aave 4.80%</span>
          <span className="flex items-center gap-1.5"><Image src="/logos/compound.svg" alt="" width={14} height={14} className="opacity-50" />Compound 5.12%</span>
        </div>
      </HFlowStep>
    </div>
  </ActionContent>
);

const SwapCard = () => (
  <ActionContent description="Switch collateral or debt assets atomically. Position stays open.">
    {/* Mobile: Vertical */}
    <div className="flex flex-col items-center gap-6 md:hidden">
      <FlowStep delay={0}>
        <TokenDisplay logo="/logos/weth.svg" symbol="WETH" amount="2.5" label="From" size="lg" />
      </FlowStep>
      <FlowArrow delay={0.15} vertical />
      <FlowStep delay={0.25}>
        <TokenDisplay logo="/logos/wsteth.svg" symbol="wstETH" amount="2.15" label="To" size="lg" variant="success" />
      </FlowStep>
      <FlowStep delay={0.4}>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-base-content/30">APY improvement</span>
          <span className="text-xl font-bold text-success font-mono">+0.8%</span>
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden md:flex items-center justify-center gap-0">
      <HFlowStep delay={0}>
        <TokenDisplay logo="/logos/weth.svg" symbol="WETH" amount="2.5" label="Current collateral" size="lg" />
      </HFlowStep>
      <HFlowStep delay={0.15}>
        <div className="flex flex-col items-center px-8">
          <motion.div animate={{ x: [0, 4, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
            <ArrowRightIcon className="w-6 h-6 text-primary" />
          </motion.div>
          <span className="text-[9px] uppercase tracking-widest text-base-content/20 mt-1">swap</span>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.3}>
        <TokenDisplay logo="/logos/wsteth.svg" symbol="wstETH" amount="2.15" label="New collateral" size="lg" variant="success" />
      </HFlowStep>
      <HFlowStep delay={0.45}>
        <div className="flex flex-col items-center pl-10 border-l border-base-content/10 ml-6">
          <span className="text-[10px] uppercase tracking-wider text-base-content/30">APY improvement</span>
          <span className="text-2xl font-bold text-success font-mono">+0.8%</span>
        </div>
      </HFlowStep>
    </div>
  </ActionContent>
);

const LoopCard = () => (
  <ActionContent description="Create leveraged positions in one transaction. Zap from any token.">
    {/* Mobile: Vertical */}
    <div className="flex flex-col items-center gap-6 md:hidden">
      <FlowStep delay={0}>
        <div className="flex items-center gap-3">
          <Image src="/logos/wsteth.svg" alt="wstETH" width={36} height={36} className="rounded-full" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-base-content/30">Deposit</div>
            <span className="font-mono text-lg">5.0 wstETH</span>
          </div>
        </div>
      </FlowStep>
      <FlowStep delay={0.2}>
        <div className="flex items-center gap-3">
          <span className="text-sm px-3 py-1 bg-primary/10 text-primary rounded font-bold">3x Loop</span>
        </div>
      </FlowStep>
      <FlowStep delay={0.35}>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Image src="/logos/wsteth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Position:</span>
            <span className="font-mono text-success">15.0 wstETH</span>
          </div>
          <div className="flex items-center gap-2">
            <Image src="/logos/weth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Debt:</span>
            <span className="font-mono text-error">-10.0 WETH</span>
          </div>
        </div>
      </FlowStep>
      <FlowStep delay={0.5}>
        <RateDisplay newRate="+4.2%" label="Net APY" />
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden md:flex items-center justify-center gap-0">
      <HFlowStep delay={0}>
        <div className="flex items-center gap-3">
          <Image src="/logos/wsteth.svg" alt="wstETH" width={40} height={40} className="rounded-full" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-base-content/30">You deposit</div>
            <span className="font-mono text-xl">5.0 wstETH</span>
          </div>
        </div>
      </HFlowStep>
      <FlowArrow delay={0.15} />
      <HFlowStep delay={0.25}>
        <div className="flex flex-col items-center px-6">
          <span className="text-sm px-4 py-1.5 bg-primary/10 text-primary rounded font-bold">3x Leverage</span>
          <span className="text-[9px] uppercase tracking-widest text-base-content/20 mt-1">wstETH / WETH</span>
        </div>
      </HFlowStep>
      <FlowArrow delay={0.35} />
      <HFlowStep delay={0.45}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Image src="/logos/wsteth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Position:</span>
            <span className="font-mono text-success">15.0 wstETH</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Image src="/logos/weth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Debt:</span>
            <span className="font-mono text-error">-10.0 WETH</span>
          </div>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.55}>
        <div className="flex flex-col items-center pl-8 border-l border-base-content/10 ml-4">
          <RateDisplay newRate="+4.2%" label="Net APY" />
        </div>
      </HFlowStep>
    </div>
  </ActionContent>
);

const PendleCard = () => (
  <ActionContent description="Leverage Pendle PT tokens. Fixed yield until maturity.">
    {/* Mobile: Vertical */}
    <div className="flex flex-col items-center gap-6 md:hidden">
      <FlowStep delay={0}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={40} height={40} className="rounded-full" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-base-100 flex items-center justify-center">
              <Image src="/logos/pendle.png" alt="Pendle" width={14} height={14} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-base-content/30">Pendle PT</div>
            <div className="font-semibold">PT-USDai-19FEB2026</div>
          </div>
        </div>
      </FlowStep>
      <FlowStep delay={0.2}>
        <RateDisplay newRate="8.42%" label="Fixed APY" />
      </FlowStep>
      <FlowStep delay={0.4}>
        <div className="flex items-center gap-4 text-xs text-base-content/30">
          <span className="uppercase tracking-wider">Leverage</span>
          <span className="text-base-content/10">|</span>
          <span className="uppercase tracking-wider">Swap</span>
          <span className="text-base-content/10">|</span>
          <span className="uppercase tracking-wider">Refinance</span>
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden md:flex items-center justify-center gap-0">
      <HFlowStep delay={0}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={44} height={44} className="rounded-full" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-base-100 flex items-center justify-center border border-base-content/10">
              <Image src="/logos/pendle.png" alt="Pendle" width={16} height={16} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-base-content/30">Pendle PT Token</div>
            <div className="font-semibold text-lg">PT-USDai-19FEB2026</div>
          </div>
        </div>
      </HFlowStep>
      <FlowArrow delay={0.15} />
      <HFlowStep delay={0.25}>
        <div className="flex flex-col items-center px-8">
          <RateDisplay newRate="8.42%" label="Fixed APY" />
        </div>
      </HFlowStep>
      <HFlowStep delay={0.4}>
        <div className="flex flex-col gap-2 pl-8 border-l border-base-content/10 text-xs text-base-content/30">
          <span className="uppercase tracking-wider hover:text-base-content/60 transition-colors cursor-default">Leverage</span>
          <span className="uppercase tracking-wider hover:text-base-content/60 transition-colors cursor-default">Swap</span>
          <span className="uppercase tracking-wider hover:text-base-content/60 transition-colors cursor-default">Refinance</span>
        </div>
      </HFlowStep>
    </div>
  </ActionContent>
);

const RefinanceCard = () => (
  <ActionContent description="Move entire positions between protocols in one atomic transaction.">
    {/* Mobile: Vertical */}
    <div className="flex flex-col items-center gap-5 md:hidden">
      <FlowStep delay={0}>
        <ProtocolBadge logo="/logos/aave.svg" name="Aave V3" size="lg" />
      </FlowStep>
      <FlowStep delay={0.15}>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Image src="/logos/wsteth.svg" alt="wstETH" width={20} height={20} />
            <span className="font-mono">5.25 wstETH</span>
          </div>
          <div className="flex items-center gap-2">
            <Image src="/logos/usdc.svg" alt="USDC" width={20} height={20} />
            <span className="font-mono text-error">-$12K</span>
          </div>
        </div>
      </FlowStep>
      <FlowArrow delay={0.25} vertical />
      <FlowStep delay={0.35}>
        <ProtocolBadge logo="/logos/morpho.svg" name="Morpho Blue" size="lg" />
      </FlowStep>
      <FlowStep delay={0.45}>
        <RateDisplay oldRate="4.80%" newRate="3.20%" label="APR" />
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden md:flex items-center justify-center gap-0">
      <HFlowStep delay={0}>
        <div className="flex flex-col items-center gap-2">
          <ProtocolBadge logo="/logos/aave.svg" name="Aave V3" size="lg" />
          <span className="text-[10px] uppercase tracking-wider text-base-content/25">Current</span>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.1}>
        <div className="flex flex-col items-center gap-3 px-8 py-2 mx-4 border-x border-base-content/5">
          <div className="text-[10px] uppercase tracking-wider text-base-content/30">Position</div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Image src="/logos/wsteth.svg" alt="wstETH" width={24} height={24} />
              <span className="font-mono">5.25 wstETH</span>
            </div>
            <div className="w-px h-6 bg-base-content/10" />
            <div className="flex items-center gap-2">
              <Image src="/logos/usdc.svg" alt="USDC" width={24} height={24} />
              <span className="font-mono text-error">-$12,000</span>
            </div>
          </div>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.2}>
        <motion.div 
          className="px-4"
          animate={{ x: [0, 4, 0] }} 
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <ArrowRightIcon className="w-6 h-6 text-primary" />
        </motion.div>
      </HFlowStep>
      <HFlowStep delay={0.3}>
        <div className="flex flex-col items-center gap-2">
          <ProtocolBadge logo="/logos/morpho.svg" name="Morpho Blue" size="lg" />
          <span className="text-[10px] uppercase tracking-wider text-success">Better rate</span>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.45}>
        <div className="pl-8 border-l border-base-content/10 ml-4">
          <RateDisplay oldRate="4.80%" newRate="3.20%" label="APR" />
        </div>
      </HFlowStep>
    </div>
  </ActionContent>
);

// Action tabs - simpler, tighter design
const actionTabs = [
  { id: "lend", label: "Lend" },
  { id: "borrow", label: "Borrow" },
  { id: "loop", label: "Loop" },
  { id: "swap", label: "Swap" },
  { id: "refinance", label: "Refinance" },
  { id: "pendle", label: "Pendle" },
];

const ActionTabs = () => {
  const [activeTab, setActiveTab] = useState("lend");

  // Render card based on active tab
  const renderCard = () => {
    switch (activeTab) {
      case "lend": return <LendCard />;
      case "borrow": return <BorrowCard />;
      case "loop": return <LoopCard />;
      case "swap": return <SwapCard />;
      case "refinance": return <RefinanceCard />;
      case "pendle": return <PendleCard />;
      default: return <LendCard />;
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      {/* Tight tab bar */}
      <div className="flex items-center justify-center mb-8">
        <div className="inline-flex items-center gap-0 border-b border-base-content/10">
          {actionTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.15em] transition-colors
                ${activeTab === tab.id 
                  ? "text-base-content" 
                  : "text-base-content/30 hover:text-base-content/60"}
              `}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="action-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-base-content"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content area - allows breathing room for animated content */}
      <div className="min-h-[320px] sm:min-h-[380px] flex items-start justify-center pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full"
          >
            {renderCard()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export const StickyLanding = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setCurrentSection, setTotalSections } = useLandingSection();
  
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

  // Track current section for header CTA visibility
  useEffect(() => {
    setTotalSections(sections.length);
    
    const unsubscribe = scrollYProgress.on("change", (progress) => {
      const sectionIndex = Math.round(progress * (sections.length - 1));
      setCurrentSection(sectionIndex);
    });
    
    return () => unsubscribe();
  }, [scrollYProgress, sections.length, setCurrentSection, setTotalSections]);

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
