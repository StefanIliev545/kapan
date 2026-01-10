"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useSpring, useTransform, useMotionValue, MotionValue } from "framer-motion";
import { ChevronDownIcon, ChevronUpIcon, ArrowRightIcon, ShieldCheckIcon, BoltIcon, CurrencyDollarIcon, SparklesIcon, PlusIcon, MinusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@radix-ui/themes";
import { track } from "@vercel/analytics";
import { StickySection, SectionData } from "./StickySection";
import { useKapanTheme } from "~~/hooks/useKapanTheme";
import { useLandingSection } from "~~/contexts/LandingSectionContext";

// ================================
// Static Animation Constants
// ================================

// ProtocolMarquee animations
const MARQUEE_ANIMATE = { x: ["0%", "-50%"] as [string, string] };
const MARQUEE_TRANSITION = {
  x: {
    duration: 20,
    repeat: Infinity,
    ease: "linear" as const,
  },
};

// MarqueeRow animations
const MARQUEE_ROW_TRANSITION = {
  x: {
    duration: 25,
    repeat: Infinity,
    ease: "linear" as const,
  },
};

// NeonLetter animations
const NEON_LETTER_INITIAL = { opacity: 0 };
const NEON_LETTER_ANIMATE = {
  opacity: [0, 0, 0.8, 0, 0.6, 0.1, 0.9, 0.2, 1, 0.7, 1],
};
const NEON_LETTER_ANIMATE_INACTIVE = { opacity: 0 };
const NEON_LETTER_TIMES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

// FinalCTA animations
const LOGO_INITIAL = { opacity: 0 };
const LOGO_ANIMATE = {
  opacity: [0, 0, 0.7, 0, 0, 0.5, 0.1, 0.8, 0, 0.9, 0.3, 1, 0.8, 1],
};
const LOGO_ANIMATE_INACTIVE = { opacity: 0 };
const LOGO_TRANSITION_TIMES = [0, 0.05, 0.1, 0.18, 0.28, 0.35, 0.4, 0.5, 0.58, 0.68, 0.78, 0.88, 0.94, 1];

const BUTTON_FLICKER_INITIAL = { opacity: 0 };
const BUTTON_FLICKER_ANIMATE = {
  opacity: [0, 0, 1, 0, 0.8, 0, 1, 0.3, 1, 0.6, 1, 1],
};
const BUTTON_FLICKER_ANIMATE_INACTIVE = { opacity: 0 };
const BUTTON_FLICKER_TIMES = [0, 0.1, 0.15, 0.22, 0.3, 0.38, 0.5, 0.6, 0.72, 0.82, 0.92, 1];

const LINKS_INITIAL = { opacity: 0, y: 20 };
const LINKS_ANIMATE_ACTIVE = { opacity: 1, y: 0 };
const LINKS_ANIMATE_INACTIVE = { opacity: 0, y: 20 };
const LINKS_TRANSITION = { delay: 4.2, duration: 0.6, ease: "easeOut" as const };

// HowItWorks animations
const SPRING_SCALE_INITIAL = { scale: 0 };
const SPRING_SCALE_ANIMATE = { scale: 1 };
const SPRING_SCALE_TRANSITION = { type: "spring" as const, bounce: 0.4, duration: 0.8 };

const LINE_INITIAL = { pathLength: 0 };
const LINE_ANIMATE = { pathLength: 1 };

const FADE_UP_INITIAL = { opacity: 0, scale: 0 };
const FADE_UP_ANIMATE = { opacity: 1, scale: 1 };

const STEP_01_INITIAL = { opacity: 0, y: 10 };
const STEP_01_ANIMATE = { opacity: 1, y: 0 };
const STEP_01_TRANSITION = { delay: 0.8 };

const STEP_02_TRANSITION = { delay: 0.95 };
const STEP_03_TRANSITION = { delay: 1.1 };

// FlowStep animations
const FLOW_STEP_INITIAL = { opacity: 0, y: 10 };
const FLOW_STEP_ANIMATE_ACTIVE = { opacity: 1, y: 0 };
const FLOW_STEP_ANIMATE_INACTIVE = { opacity: 0.3, y: 0 };

// HFlowStep animations
const HFLOW_STEP_INITIAL = { opacity: 0, x: -10 };
const HFLOW_STEP_ANIMATE = { opacity: 1, x: 0 };

// FlowArrow animations
const FLOW_ARROW_INITIAL = { opacity: 0 };
const FLOW_ARROW_ANIMATE = { opacity: 1 };
const FLOW_ARROW_HORIZONTAL = { x: [0, 3, 0] };
const FLOW_ARROW_VERTICAL = { y: [0, 3, 0] };
const FLOW_ARROW_TRANSITION = { duration: 1.2, repeat: Infinity };

// ActionContent animations
const ACTION_CONTENT_INITIAL = { opacity: 0 };
const ACTION_CONTENT_ANIMATE = { opacity: 1 };

// ActionTabs animations
const ACTION_TAB_UNDERLINE_TRANSITION = { type: "spring" as const, bounce: 0.15, duration: 0.5 };
const ACTION_TAB_CONTENT_INITIAL = { opacity: 0, y: 8 };
const ACTION_TAB_CONTENT_ANIMATE = { opacity: 1, y: 0 };
const ACTION_TAB_CONTENT_EXIT = { opacity: 0, y: -8 };
const ACTION_TAB_CONTENT_TRANSITION = { duration: 0.25, ease: "easeOut" as const };

// Swap card arrow animation
const SWAP_ARROW_ANIMATE = { x: [0, 4, 0] };
const SWAP_ARROW_TRANSITION = { duration: 1.2, repeat: Infinity };

// ================================
// Protocol and Network Data
// ================================

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
    <div className="relative w-full max-w-md overflow-hidden">
      <motion.div
        className="flex gap-6"
        animate={MARQUEE_ANIMATE}
        transition={MARQUEE_TRANSITION}
      >
        {duplicatedProtocols.map((protocol, index) => (
          <div
            key={`${protocol.name}-${index}`}
            className="flex flex-shrink-0 items-center gap-2"
          >
            <div className="relative size-5">
              <Image
                src={protocol.logo}
                alt={protocol.name}
                fill
                className="object-contain"
              />
            </div>
            <span className="text-base-content/50 text-sm font-medium">
              {protocol.name}
            </span>
          </div>
        ))}
      </motion.div>
      {/* Fade edges */}
      <div className="from-base-100 pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent" />
      <div className="from-base-100 pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent" />
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

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    track("To App conversion", { button: "Landing Hero" });
    window.location.assign(appUrl);
  }, [appUrl]);

  return (
    <a
      href="/app"
      onClick={handleClick}
      className="bg-primary text-primary-content group relative flex h-16 items-center justify-center overflow-hidden px-10 text-[11px] font-black uppercase tracking-[0.3em] transition-all duration-500 hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] md:h-20 md:px-14 md:text-xs"
    >
      <div className="relative z-10 flex items-center gap-4">
        <span className="translate-x-2 transition-transform duration-500 group-hover:translate-x-0">
          Launch App
        </span>
        <ArrowRightIcon className="size-4 opacity-0 transition-all duration-500 group-hover:translate-x-1 group-hover:opacity-100" />
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
const MarqueeRow = ({ items, label, reverse = false }: { items: { name: string; logo: string }[]; label: string; reverse?: boolean }) => {
  const animate = useMemo(() =>
    ({ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] as [string, string] }),
    [reverse]
  );

  return (
    <div className="flex w-full items-center gap-4">
      <span className="text-base-content/30 w-20 flex-shrink-0 text-right text-[10px] uppercase tracking-wider">{label}</span>
      <div className="relative flex-1 overflow-hidden">
        <motion.div
          className="flex gap-6"
          animate={animate}
          transition={MARQUEE_ROW_TRANSITION}
        >
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex flex-shrink-0 items-center gap-2">
              <div className="relative size-5">
                <Image src={item.logo} alt={item.name} fill className="object-contain" />
              </div>
              <span className="text-base-content/40 text-xs">{item.name}</span>
            </div>
          ))}
        </motion.div>
        {/* Fade edges */}
        <div className="from-base-100 pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent" />
        <div className="from-base-100 pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent" />
      </div>
    </div>
  );
};

const FeatureList = () => {
  const features = useMemo(() => [
    { icon: ShieldCheckIcon, title: "Non-Custodial", desc: "Your assets stay yours. Verify on any protocol's frontend." },
    { icon: BoltIcon, title: "Atomic Transactions", desc: "All operations execute in a single transaction using flash loans." },
    { icon: CurrencyDollarIcon, title: "Zero Protocol Fees", desc: "You only pay network gas and swap fees. No Kapan fees." },
    { icon: SparklesIcon, title: "Any Gas Token", desc: "Pay gas in any token with AVNU Paymaster integration." },
  ], []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10 px-4">
      {/* Features grid - centered with consistent spacing */}
      <div className="grid w-full max-w-2xl grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
        {features.map((f, i) => (
          <div key={i} className="flex gap-4 text-left">
            <div className="bg-base-content/5 border-base-content/5 flex size-11 flex-shrink-0 items-center justify-center rounded-xl border">
              <f.icon className="text-base-content/60 size-5" />
            </div>
            <div className="pt-0.5">
              <div className="text-base-content mb-1 text-sm font-semibold">{f.title}</div>
              <div className="text-base-content/40 text-sm leading-relaxed">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Supported networks/protocols/integrations marquees */}
      <div className="border-base-content/5 w-full space-y-3 border-t pt-6">
        <MarqueeRow items={duplicatedNetworks} label="Networks" />
        <MarqueeRow items={duplicatedSupportedProtocols} label="Protocols" reverse />
        <MarqueeRow items={duplicatedIntegrations} label="Routers" />
      </div>
    </div>
  );
};

// Neon letter flicker - each letter flickers on individually
const NeonLetter = ({ letter, delay, animate }: { letter: string; delay: number; animate: boolean }) => {
  const animateValue = useMemo(() =>
    animate ? NEON_LETTER_ANIMATE : NEON_LETTER_ANIMATE_INACTIVE,
    [animate]
  );

  const transition = useMemo(() => ({
    delay,
    duration: 0.8,
    times: NEON_LETTER_TIMES,
    ease: "linear" as const,
  }), [delay]);

  return (
    <motion.span
      className="inline-block"
      initial={NEON_LETTER_INITIAL}
      animate={animateValue}
      transition={transition}
    >
      {letter}
    </motion.span>
  );
};

// Final CTA section with Fallout neon sign effect
const FinalCTA = ({ isActive = false }: { isActive?: boolean }) => {
  const letters = useMemo(() => "KAPAN".split(""), []);

  const logoAnimate = useMemo(() =>
    isActive ? LOGO_ANIMATE : LOGO_ANIMATE_INACTIVE,
    [isActive]
  );

  const logoTransition = useMemo(() => ({
    delay: 0.3,
    duration: 1.2,
    times: LOGO_TRANSITION_TIMES,
    ease: "linear" as const,
  }), []);

  const buttonAnimate = useMemo(() =>
    isActive ? BUTTON_FLICKER_ANIMATE : BUTTON_FLICKER_ANIMATE_INACTIVE,
    [isActive]
  );

  const buttonTransition = useMemo(() => ({
    delay: 3.0,
    duration: 1.0,
    times: BUTTON_FLICKER_TIMES,
    ease: "linear" as const,
  }), []);

  const linksAnimate = useMemo(() =>
    isActive ? LINKS_ANIMATE_ACTIVE : LINKS_ANIMATE_INACTIVE,
    [isActive]
  );

  return (
    <div className="flex flex-col items-center gap-10 px-4 text-center">
      {/* Logo + KAPAN text - Fallout sign style */}
      <div className="flex flex-col items-center gap-4">
        {/* Logo flickers first */}
        <motion.div
          initial={LOGO_INITIAL}
          animate={logoAnimate}
          transition={logoTransition}
          className="relative size-16 md:size-20"
        >
          <Image src="/seal-logo.png" alt="Kapan" fill className="object-contain" />
        </motion.div>

        {/* Letters flicker on one by one */}
        <div className="text-4xl font-black uppercase tracking-[0.3em] md:text-5xl">
          {letters.map((letter, i) => (
            <NeonLetter key={i} letter={letter} delay={1.5 + i * 0.25} animate={isActive} />
          ))}
        </div>
      </div>

      {/* Button flickers on after letters - big dramatic flicker */}
      <motion.div
        initial={BUTTON_FLICKER_INITIAL}
        animate={buttonAnimate}
        transition={buttonTransition}
      >
        <LaunchAppButton />
      </motion.div>

      {/* Links slide up and fade in after button */}
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={LINKS_INITIAL}
        animate={linksAnimate}
        transition={LINKS_TRANSITION}
      >
        <div className="text-base-content/30 flex items-center gap-6 text-xs">
          <a href="https://discord.gg/Vjk6NhkxGv" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">Discord</a>
          <a href="https://t.me/+vYCKr2TrOXRiODg0" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">Telegram</a>
          <a href="https://x.com/KapanFinance" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">Twitter</a>
          <a href="https://github.com/StefanIliev545/kapan" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">GitHub</a>
        </div>
        <a
          href="/audits/022_CODESPECT_KAPAN_FINANCE.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-base-content/20 hover:text-base-content/40 text-[10px] uppercase tracking-wider transition-colors"
        >
          Starknet Audit by Codespect
        </a>
      </motion.div>
    </div>
  );
};

// How it Works section - Kapan as orchestrator visualization
const HowItWorks = () => {
  // Shared radius values - X is larger since container is wider than tall
  const radiusX = 42; // percentage from center horizontally
  const radiusY = 38; // percentage from center vertically

  // Helper to calculate position from angle
  const getPosition = useCallback((angle: number, radius = 1) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: 50 + Math.cos(radians) * radiusX * radius,
      y: 50 + Math.sin(radians) * radiusY * radius,
    };
  }, []);

  // Pre-compute all protocol data with positions, styles, and transitions
  const protocolData = useMemo(() => {
    const protocols = [
      { name: "Aave", logo: "/logos/aave.svg", angle: 0 },
      { name: "Morpho", logo: "/logos/morpho.svg", angle: 45 },
      { name: "Compound", logo: "/logos/compound.svg", angle: 90 },
      { name: "1inch", logo: "/logos/1inch.png", angle: 135 },
      { name: "Pendle", logo: "/logos/pendle.png", angle: 180 },
      { name: "Venus", logo: "/logos/venus.svg", angle: 225 },
      { name: "ZeroLend", logo: "/logos/zerolend.svg", angle: 270 },
      { name: "Nostra", logo: "/logos/nostra.svg", angle: 315 },
    ];

    return protocols.map((protocol, i) => {
      const pos = getPosition(protocol.angle);
      return {
        ...protocol,
        pos,
        style: { left: `${pos.x}%`, top: `${pos.y}%` },
        mobileTransition: { delay: 0.2 + i * 0.05 },
        lineTransition: { delay: i * 0.1, duration: 0.5 },
        desktopTransition: { delay: 0.3 + i * 0.08, duration: 0.4 },
      };
    });
  }, [getPosition]);

  // Pre-compute all traveling instruction animation data
  const instructionAnimations = useMemo(() => {
    const instructions = [
      { instruction: "deposit", angle: 0, delay: 0, color: "bg-success/20 text-success border-success/30" },
      { instruction: "borrow", angle: 45, delay: 1.5, color: "bg-error/20 text-error border-error/30" },
      { instruction: "swap", angle: 135, delay: 3, color: "bg-primary/20 text-primary border-primary/30" },
      { instruction: "swap PT", angle: 180, delay: 4.5, color: "bg-warning/20 text-warning border-warning/30" },
      { instruction: "repay", angle: 225, delay: 6, color: "bg-info/20 text-info border-info/30" },
      { instruction: "move", angle: 315, delay: 7.5, color: "bg-secondary/20 text-secondary border-secondary/30" },
    ];

    return instructions.map((item) => {
      const endPos = getPosition(item.angle, 0.65);
      return {
        ...item,
        outboundInitial: { left: "50%", top: "50%", opacity: 0 },
        outboundAnimate: {
          left: ["50%", "50%", `${endPos.x}%`, `${endPos.x}%`],
          top: ["50%", "50%", `${endPos.y}%`, `${endPos.y}%`],
          opacity: [0, 1, 1, 0],
        },
        outboundTransition: {
          delay: item.delay,
          duration: 2.5,
          repeat: Infinity,
          repeatDelay: 3.5,
          times: [0, 0.1, 0.7, 1],
          ease: "easeInOut" as const,
        },
        returnInitial: { left: `${endPos.x}%`, top: `${endPos.y}%`, opacity: 0 },
        returnAnimate: {
          left: [`${endPos.x}%`, `${endPos.x}%`, "50%", "50%"],
          top: [`${endPos.y}%`, `${endPos.y}%`, "50%", "50%"],
          opacity: [0, 1, 1, 0],
        },
        returnTransition: {
          delay: item.delay + 2.8,
          duration: 2.5,
          repeat: Infinity,
          repeatDelay: 3.5,
          times: [0, 0.1, 0.7, 1],
          ease: "easeInOut" as const,
        },
      };
    });
  }, [getPosition]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-4">
      {/* Mobile: Just Kapan logo centered */}
      <div className="flex flex-col items-center gap-6 md:hidden">
        <motion.div
          initial={SPRING_SCALE_INITIAL}
          animate={SPRING_SCALE_ANIMATE}
          transition={SPRING_SCALE_TRANSITION}
        >
          <div className="bg-base-200/80 border-base-content/20 flex size-20 items-center justify-center rounded-2xl border shadow-lg">
            <Image src="/seal-logo.png" alt="Kapan" width={48} height={48} />
          </div>
        </motion.div>

        {/* Protocol logos in a row */}
        <div className="flex max-w-xs flex-wrap items-center justify-center gap-3">
          {protocolData.map((protocol) => (
            <motion.div
              key={protocol.name}
              initial={FADE_UP_INITIAL}
              animate={FADE_UP_ANIMATE}
              transition={protocol.mobileTransition}
            >
              <div className="bg-base-200/60 border-base-content/10 flex size-8 items-center justify-center rounded-lg border">
                <Image src={protocol.logo} alt={protocol.name} width={18} height={18} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Desktop: Full orchestrator visualization */}
      <div className="hidden w-full items-center justify-center md:flex">
        <div className="relative h-[350px] w-full max-w-2xl">
          {/* Connection lines using same percentage system */}
          <svg className="absolute inset-0 size-full overflow-visible">
            {protocolData.map((protocol, i) => (
              <motion.line
                key={i}
                x1="50%"
                y1="50%"
                x2={`${protocol.pos.x}%`}
                y2={`${protocol.pos.y}%`}
                stroke="currentColor"
                strokeWidth="1"
                className="text-base-content/10"
                initial={LINE_INITIAL}
                animate={LINE_ANIMATE}
                transition={protocol.lineTransition}
              />
            ))}
          </svg>

          {/* Traveling instructions */}
          {instructionAnimations.map((item, i) => (
            <React.Fragment key={i}>
              {/* Outbound: instruction travels TO protocol */}
              <motion.div
                className="z-5 pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                initial={item.outboundInitial}
                animate={item.outboundAnimate}
                transition={item.outboundTransition}
              >
                <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${item.color} whitespace-nowrap`}>
                  {item.instruction}
                </span>
              </motion.div>

              {/* Return: UTXO travels back FROM protocol */}
              <motion.div
                className="z-5 pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                initial={item.returnInitial}
                animate={item.returnAnimate}
                transition={item.returnTransition}
              >
                <span className="bg-base-content/10 text-base-content/60 border-base-content/20 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] font-medium">
                  UTXO
                </span>
              </motion.div>
            </React.Fragment>
          ))}

          {/* Center - Kapan Router */}
          <motion.div
            className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
            initial={SPRING_SCALE_INITIAL}
            animate={SPRING_SCALE_ANIMATE}
            transition={SPRING_SCALE_TRANSITION}
          >
            <div className="bg-base-100 border-base-content/20 flex items-center gap-2 rounded-lg border px-4 py-2 shadow-lg">
              <Image src="/seal-logo.png" alt="Kapan" width={24} height={24} />
              <span className="text-sm font-bold tracking-wide">KAPAN</span>
            </div>
          </motion.div>

          {/* Surrounding protocols */}
          {protocolData.map((protocol) => (
            <motion.div
              key={protocol.name}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={protocol.style}
              initial={FADE_UP_INITIAL}
              animate={FADE_UP_ANIMATE}
              transition={protocol.desktopTransition}
            >
              <div className="flex flex-col items-center gap-1">
                <div className="bg-base-100 border-base-content/10 flex size-12 items-center justify-center rounded-xl border shadow-md">
                  <Image src={protocol.logo} alt={protocol.name} width={28} height={28} />
                </div>
                <span className="text-base-content/40 text-[10px] font-medium">{protocol.name}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Explanation text */}
      <div className="flex flex-col items-center justify-center gap-8 text-center md:flex-row md:gap-16">
        <motion.div
          className="max-w-[200px]"
          initial={STEP_01_INITIAL}
          animate={STEP_01_ANIMATE}
          transition={STEP_01_TRANSITION}
        >
          <div className="text-primary mb-1 text-[10px] uppercase tracking-widest">01</div>
          <div className="mb-1 text-sm font-medium">Bundle Instructions</div>
          <div className="text-base-content/40 text-xs">Combine deposit, borrow, swap, and repay into one bundle.</div>
        </motion.div>
        <motion.div
          className="max-w-[200px]"
          initial={STEP_01_INITIAL}
          animate={STEP_01_ANIMATE}
          transition={STEP_02_TRANSITION}
        >
          <div className="text-primary mb-1 text-[10px] uppercase tracking-widest">02</div>
          <div className="mb-1 text-sm font-medium">Flash Loan Powered</div>
          <div className="text-base-content/40 text-xs">No upfront capital needed. Borrow, execute, repay atomically.</div>
        </motion.div>
        <motion.div
          className="max-w-[200px]"
          initial={STEP_01_INITIAL}
          animate={STEP_01_ANIMATE}
          transition={STEP_03_TRANSITION}
        >
          <div className="text-primary mb-1 text-[10px] uppercase tracking-widest">03</div>
          <div className="mb-1 text-sm font-medium">All or Nothing</div>
          <div className="text-base-content/40 text-xs">Transaction succeeds completely or reverts. No partial states.</div>
        </motion.div>
      </div>
    </div>
  );
};

// Tooltip wrapper using Radix UI for professional look
const MockTooltip = ({ children, tip }: { children: React.ReactNode; tip: string }) => (
  <Tooltip content={tip} delayDuration={100}>
    <span className="cursor-help">{children}</span>
  </Tooltip>
);

// Icon components for MockActionButton
type MockActionIconType = "plus" | "minus" | "arrow-right" | "x-mark";

const MockActionIcon = ({ type }: { type: MockActionIconType }) => {
  switch (type) {
    case "plus":
      return <PlusIcon className="size-3.5" />;
    case "minus":
      return <MinusIcon className="size-3.5" />;
    case "arrow-right":
      return <ArrowRightIcon className="size-3.5" />;
    case "x-mark":
      return <XMarkIcon className="size-3.5" />;
    default:
      return null;
  }
};

// Mock action button matching real SegmentedActionBar style
const MockActionButton = ({ iconType, label, tip }: { iconType: MockActionIconType; label: string; tip: string }) => (
  <Tooltip content={tip} delayDuration={100}>
    <button
      className="text-base-content/50 hover:text-base-content/70 hover:bg-base-content/5 flex flex-1 cursor-help items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
    >
      <MockActionIcon type={iconType} />
      <span>{label}</span>
    </button>
  </Tooltip>
);

// Mock Morpho Blue protocol view - matches real dashboard layout with mobile responsiveness
const MockMorphoView = () => (
  <div className="flex w-full flex-col space-y-2 p-2 sm:p-3">
    {/* Protocol Header Card */}
    <div className="card-surface shadow-lg">
      <div className="card-body px-3 py-2 sm:px-5 sm:py-3">
        {/* Mobile Protocol Header */}
        <div className="flex items-center justify-between gap-2 md:hidden">
          <div className="flex items-center gap-2">
            <div className="token-icon-wrapper-md">
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
        <div className="hidden flex-wrap items-center gap-x-6 gap-y-4 md:flex">
          <MockTooltip tip="The lending protocol where this position lives">
            <div className="flex cursor-help items-center gap-3">
              <div className="token-icon-wrapper-lg">
                <Image src="/logos/morpho.svg" alt="Morpho Blue" width={24} height={24} className="object-contain drop-shadow-sm" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-text-xs-semibold">Protocol</span>
                <span className="text-base font-bold tracking-tight">Morpho Blue</span>
              </div>
            </div>
          </MockTooltip>
          <div className="via-base-300 h-10 w-px bg-gradient-to-b from-transparent to-transparent" />
          <div className="flex flex-1 flex-wrap items-center justify-around gap-y-3">
            <MockTooltip tip="Total value of your positions (collateral minus debt)">
              <div className="flex cursor-help flex-col items-center gap-1 px-3 py-1">
                <span className="label-text-xs-semibold">Balance</span>
                <span className="text-success font-mono text-sm font-bold tabular-nums">$6.55K</span>
              </div>
            </MockTooltip>
            <MockTooltip tip="Estimated earnings over the last 30 days">
              <div className="flex cursor-help flex-col items-center gap-1 px-3 py-1">
                <span className="label-text-xs-semibold">30D Yield</span>
                <span className="text-success font-mono text-sm font-bold tabular-nums">$241.28</span>
              </div>
            </MockTooltip>
            <MockTooltip tip="Net APY: supply yield minus borrow cost">
              <div className="flex cursor-help flex-col items-center gap-1 px-3 py-1">
                <span className="label-text-xs-semibold">Net APY</span>
                <span className="text-success font-mono text-sm font-bold tabular-nums">+44.79%</span>
              </div>
            </MockTooltip>
            <MockTooltip tip="How much of your borrowing capacity you're using">
              <div className="flex cursor-help flex-col items-center gap-1 px-3 py-1">
                <span className="label-text-xs-semibold">Utilization</span>
                <div className="flex items-center gap-2.5">
                  <div className="bg-base-300/60 h-1.5 w-24 overflow-hidden rounded-full">
                    <div className="bg-error h-full w-[90%] rounded-full" />
                  </div>
                  <span className="text-error font-mono text-xs font-semibold tabular-nums">90%</span>
                </div>
              </div>
            </MockTooltip>
          </div>
          <MockTooltip tip="View available markets on this protocol">
            <div className="text-base-content/50 border-base-content/20 flex cursor-help items-center gap-1 rounded border px-2 py-1 text-xs">
              <span>Markets</span>
              <ChevronDownIcon className="size-4" />
            </div>
          </MockTooltip>
        </div>
      </div>
    </div>

    {/* YOUR POSITIONS section */}
    <div className="card bg-base-200/40 border-base-300/50 rounded-xl border shadow-md">
      <div className="card-body space-y-2 p-3 sm:space-y-3 sm:p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary h-4 w-1 rounded-full sm:h-5" />
            <span className="text-base-content/60 text-[10px] font-semibold uppercase tracking-widest sm:text-[11px]">Your Positions</span>
          </div>
          <MockTooltip tip="Number of active markets you have positions in">
            <div className="bg-primary/10 text-primary flex cursor-help items-center gap-1 rounded-full px-1.5 py-0.5 sm:px-2">
              <span className="font-mono text-[10px] font-bold sm:text-xs">1</span>
              <span className="text-[8px] uppercase tracking-wider opacity-70 sm:text-[10px]">market</span>
            </div>
          </MockTooltip>
        </div>

        {/* Market pair - expanded view */}
        <div className="border-primary/30 ring-primary/10 overflow-hidden rounded-lg border ring-1">
          {/* Market pair header - Mobile */}
          <div className="bg-base-200/50 border-base-300 flex items-center justify-between border-b px-3 py-2 md:hidden">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={18} height={18} className="border-base-200 bg-base-200 rounded-full border" />
                <Image src="/logos/usdc.svg" alt="USDC" width={18} height={18} className="border-base-200 bg-base-200 rounded-full border" />
              </div>
              <span className="max-w-[120px] truncate text-xs font-semibold">PT-USDai/USDC</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-success font-mono">$6.55K</span>
              <span className="text-warning font-mono">89.7%</span>
            </div>
          </div>

          {/* Market pair header - Desktop */}
          <div className="bg-base-200/50 border-base-300 hidden items-center justify-between border-b px-4 py-2.5 md:flex">
            <div className="flex items-center gap-3">
              <MockTooltip tip="Isolated lending market: PT-USDai collateral, USDC debt">
                <div className="flex cursor-help items-center gap-3">
                  <div className="flex -space-x-1.5">
                    <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={22} height={22} className="border-base-200 bg-base-200 rounded-full border-2" />
                    <Image src="/logos/usdc.svg" alt="USDC" width={22} height={22} className="border-base-200 bg-base-200 rounded-full border-2" />
                  </div>
                  <span className="text-sm font-semibold">PT-USDai-19FEB2026/USDC</span>
                </div>
              </MockTooltip>
              <div className="flex items-center gap-1.5">
                <Image src="/logos/morpho.svg" alt="Morpho" width={14} height={14} />
                <MockTooltip tip="View on Morpho">
                  <a href="#" className="text-base-content/40 hover:text-base-content/60">
                    <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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
          <div className="bg-base-200/20 md:hidden">
            {/* Collateral */}
            <div className="border-base-300/50 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={28} height={28} className="rounded-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base-content/40 text-[9px] uppercase tracking-wider">Collateral</div>
                  <div className="truncate text-xs font-medium">PT-USDai-1...</div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-base-content/40 text-[8px] uppercase">Bal</div>
                    <div className="text-success font-mono text-xs font-semibold">$63.8K</div>
                  </div>
                  <div>
                    <div className="text-base-content/40 text-[8px] uppercase">APY</div>
                    <div className="font-mono text-xs font-semibold">7.46%</div>
                  </div>
                </div>
              </div>
              {/* Mobile action buttons */}
              <div className="mt-2 flex items-center gap-1">
                <button className="text-base-content/50 hover:bg-base-content/5 flex-1 rounded py-1 text-[10px]">+ Deposit</button>
                <button className="text-base-content/50 hover:bg-base-content/5 flex-1 rounded py-1 text-[10px]">- Withdraw</button>
                <button className="text-base-content/50 hover:bg-base-content/5 flex-1 rounded py-1 text-[10px]">Move</button>
              </div>
            </div>
            {/* Debt */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <Image src="/logos/usdc.svg" alt="USDC" width={28} height={28} className="flex-shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="text-base-content/40 text-[9px] uppercase tracking-wider">Debt</div>
                  <div className="text-xs font-medium">USDC</div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-base-content/40 text-[8px] uppercase">Bal</div>
                    <div className="text-error font-mono text-xs font-semibold">-$57.3K</div>
                  </div>
                  <div>
                    <div className="text-base-content/40 text-[8px] uppercase">APR</div>
                    <div className="font-mono text-xs font-semibold">3.19%</div>
                  </div>
                </div>
              </div>
              {/* Mobile action buttons */}
              <div className="mt-2 flex items-center gap-1">
                <button className="text-base-content/50 hover:bg-base-content/5 flex-1 rounded py-1 text-[10px]">- Repay</button>
                <button className="text-base-content/50 hover:bg-base-content/5 flex-1 rounded py-1 text-[10px]">+ Borrow</button>
                <button className="text-base-content/50 hover:bg-base-content/5 flex-1 rounded py-1 text-[10px]">Move</button>
              </div>
            </div>
          </div>

          {/* Desktop: Two-column layout */}
          <div className="divide-base-300 hidden grid-cols-2 divide-x md:grid">
            {/* Collateral side */}
            <div className="bg-base-200/20">
              {/* Using 12-col grid like real app: token=3, stats=8, chevron=1 */}
              <div className="border-base-300/50 grid grid-cols-12 items-center border-b px-4 py-3">
                {/* Token - col-span-3 */}
                <div className="col-span-3 flex min-w-0 items-center gap-2">
                  <MockTooltip tip="Pendle Principal Token - fixed yield until maturity">
                    <div className="relative flex-shrink-0 cursor-help">
                      <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={36} height={36} className="rounded-full" />
                      <div className="bg-base-200 border-base-300 absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border">
                        <Image src="/logos/pendle.png" alt="Pendle" width={10} height={10} />
                      </div>
                    </div>
                  </MockTooltip>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">PT-USDai-1...</div>
                  </div>
                </div>
                {/* Stats - col-span-9, evenly distributed */}
                <div className="col-span-9 grid grid-cols-4 gap-0">
                  <MockTooltip tip="Total collateral value">
                    <div className="border-base-300/30 cursor-help border-r px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Balance</div>
                      <div className="text-success font-mono text-sm font-semibold">$63.83K</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Current yield rate">
                    <div className="border-base-300/30 cursor-help border-r px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">APY</div>
                      <div className="font-mono text-sm font-semibold">7.46%</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Best available rate across protocols">
                    <div className="border-base-300/30 cursor-help border-r px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Best APY</div>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-success font-mono text-sm font-semibold">7.46%</span>
                        <Image src="/logos/morpho.svg" alt="Morpho" width={12} height={12} />
                      </div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Loan-to-Value ratio">
                    <div className="cursor-help px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">LTV</div>
                      <div className="text-warning font-mono text-sm font-semibold">89.7%</div>
                    </div>
                  </MockTooltip>
                </div>
              </div>
              <div className="divide-base-300/30 flex items-stretch divide-x">
                <MockActionButton iconType="plus" label="Deposit" tip="Add more collateral to reduce liquidation risk" />
                <MockActionButton iconType="minus" label="Withdraw" tip="Remove collateral from your position" />
                <MockActionButton iconType="arrow-right" label="Move" tip="Move collateral to another protocol" />
              </div>
            </div>

            {/* Debt side */}
            <div className="bg-base-200/20">
              {/* Using 12-col grid: token=3, stats=8, chevron=1 */}
              <div className="border-base-300/50 grid grid-cols-12 items-center border-b px-4 py-3">
                {/* Token - col-span-3 */}
                <div className="col-span-3 flex min-w-0 items-center gap-2">
                  <MockTooltip tip="USDC stablecoin borrowed against collateral">
                    <Image src="/logos/usdc.svg" alt="USDC" width={36} height={36} className="flex-shrink-0 cursor-help rounded-full" />
                  </MockTooltip>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">USDC</div>
                  </div>
                </div>
                {/* Stats - col-span-8, evenly distributed */}
                <div className="col-span-8 grid grid-cols-3 gap-0">
                  <MockTooltip tip="Total debt owed">
                    <div className="border-base-300/30 cursor-help border-r px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Balance</div>
                      <div className="text-error font-mono text-sm font-semibold">-$57.28K</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Current borrow rate">
                    <div className="border-base-300/30 cursor-help border-r px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">APR</div>
                      <div className="font-mono text-sm font-semibold">3.19%</div>
                    </div>
                  </MockTooltip>
                  <MockTooltip tip="Best available borrow rate">
                    <div className="cursor-help px-2 text-center">
                      <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Best APR</div>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-success font-mono text-sm font-semibold">3.72%</span>
                        <Image src="/logos/aave.svg" alt="Aave" width={12} height={12} />
                      </div>
                    </div>
                  </MockTooltip>
                </div>
                {/* Chevron - col-span-1 */}
                <div className="col-span-1 flex justify-end">
                  <MockTooltip tip="Collapse position details">
                    <div className="bg-base-300/30 flex size-8 cursor-help items-center justify-center rounded-lg">
                      <ChevronUpIcon className="text-base-content/50 size-4" />
                    </div>
                  </MockTooltip>
                </div>
              </div>
              <div className="divide-base-300/30 flex items-stretch divide-x">
                <MockActionButton iconType="minus" label="Repay" tip="Pay back debt to reduce interest costs" />
                <MockActionButton iconType="plus" label="Borrow" tip="Borrow more against your collateral" />
                <MockActionButton iconType="arrow-right" label="Move" tip="Move debt to another protocol" />
                <MockActionButton iconType="x-mark" label="Close" tip="Close entire position" />
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
  <div className="flex w-full flex-col p-2 sm:p-3">
    <div className="card bg-base-200/40 border-base-300/50 rounded-xl border shadow-lg">
      <div className="card-body px-3 py-2 sm:px-5 sm:py-3">
        {/* Mobile */}
        <div className="flex items-center justify-between gap-2 md:hidden">
          <div className="flex items-center gap-2">
            <div className="from-base-200 to-base-300/50 ring-base-300/30 relative flex size-8 items-center justify-center rounded-lg bg-gradient-to-br p-1.5 ring-1">
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
        <div className="hidden flex-wrap items-center gap-x-6 gap-y-4 md:flex">
          <div className="flex items-center gap-3">
            <div className="from-base-200 to-base-300/50 ring-base-300/30 relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-br p-2 shadow-sm ring-1">
              <Image src="/logos/aave.svg" alt="Aave V3" width={24} height={24} className="object-contain drop-shadow-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-base-content/35 text-[10px] font-semibold uppercase tracking-widest">Protocol</span>
              <span className="text-base font-bold tracking-tight">Aave V3</span>
            </div>
          </div>
          <div className="via-base-300 h-10 w-px bg-gradient-to-b from-transparent to-transparent" />
          <div className="flex flex-1 flex-wrap items-center justify-around gap-y-3">
            <div className="flex flex-col items-center gap-1 px-3 py-1">
              <span className="text-base-content/35 text-[10px] font-semibold uppercase tracking-widest">Balance</span>
              <span className="text-success font-mono text-sm font-bold tabular-nums">$2,356.66</span>
            </div>
            <div className="flex flex-col items-center gap-1 px-3 py-1">
              <span className="text-base-content/35 text-[10px] font-semibold uppercase tracking-widest">30D Yield</span>
              <span className="text-error font-mono text-sm font-bold tabular-nums">-$7.45</span>
            </div>
            <div className="flex flex-col items-center gap-1 px-3 py-1">
              <span className="text-base-content/35 text-[10px] font-semibold uppercase tracking-widest">Net APY</span>
              <span className="text-error font-mono text-sm font-bold tabular-nums">-3.85%</span>
            </div>
            <div className="flex flex-col items-center gap-1 px-3 py-1">
              <span className="text-base-content/35 text-[10px] font-semibold uppercase tracking-widest">Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="bg-base-300/60 h-1.5 w-24 overflow-hidden rounded-full">
                  <div className="bg-warning h-full w-[81%] rounded-full" />
                </div>
                <span className="text-warning font-mono text-xs font-semibold tabular-nums">81%</span>
              </div>
            </div>
          </div>
          <div className="text-base-content/50 flex items-center gap-1 text-xs">
            <span>Markets</span>
            <ChevronDownIcon className="size-4" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Dashboard preview - Morpho with positions, Aave header fading out
const DashboardPreview = () => (
  <div className="relative mx-auto w-full max-w-5xl">
    <MockMorphoView />
    <div className="pointer-events-none">
      <MockAaveHeader />
    </div>
    {/* Fade overlay on bottom */}
    <div className="from-base-100 via-base-100/90 pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent" />
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
}) => {
  const animate = useMemo(() =>
    isActive ? FLOW_STEP_ANIMATE_ACTIVE : FLOW_STEP_ANIMATE_INACTIVE,
    [isActive]
  );

  const transition = useMemo(() =>
    ({ delay, duration: 0.4, ease: "easeOut" as const }),
    [delay]
  );

  return (
    <motion.div
      initial={FLOW_STEP_INITIAL}
      animate={animate}
      transition={transition}
      className="flex-shrink-0"
    >
      {children}
    </motion.div>
  );
};

// Horizontal flow step for desktop
const HFlowStep = ({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) => {
  const transition = useMemo(() =>
    ({ delay, duration: 0.4, ease: "easeOut" as const }),
    [delay]
  );

  return (
    <motion.div
      initial={HFLOW_STEP_INITIAL}
      animate={HFLOW_STEP_ANIMATE}
      transition={transition}
      className="flex-shrink-0"
    >
      {children}
    </motion.div>
  );
};

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
  const sizes = useMemo(() => ({
    sm: { img: 24, amount: "text-base", symbol: "text-xs" },
    md: { img: 32, amount: "text-lg", symbol: "text-sm" },
    lg: { img: 40, amount: "text-xl", symbol: "text-base" },
  }), []);
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <Image src={logo} alt={symbol} width={s.img} height={s.img} className="rounded-full" />
      <div>
        {label && <div className="text-base-content/30 text-[10px] uppercase tracking-wider">{label}</div>}
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
  const sizes = useMemo(() => ({
    sm: { img: 20, text: "text-xs" },
    md: { img: 28, text: "text-sm" },
    lg: { img: 36, text: "text-base" },
  }), []);
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
    <span className="text-base-content/30 text-xs uppercase tracking-wider">{label}</span>
    {oldRate && (
      <span className="text-base-content/30 font-mono line-through">{oldRate}</span>
    )}
    <span className={`text-success font-mono font-bold ${size === "lg" ? "text-2xl sm:text-3xl" : "text-xl"}`}>{newRate}</span>
  </div>
);

// Animated arrow for horizontal flow
const FlowArrow = ({ delay = 0, vertical = false }: { delay?: number; vertical?: boolean }) => {
  const transition = useMemo(() => ({ delay, duration: 0.3 }), [delay]);
  const arrowAnimate = useMemo(() =>
    vertical ? FLOW_ARROW_VERTICAL : FLOW_ARROW_HORIZONTAL,
    [vertical]
  );

  return (
    <motion.div
      initial={FLOW_ARROW_INITIAL}
      animate={FLOW_ARROW_ANIMATE}
      transition={transition}
      className={`flex items-center justify-center ${vertical ? "py-2" : "px-4"}`}
    >
      <motion.div
        animate={arrowAnimate}
        transition={FLOW_ARROW_TRANSITION}
      >
        <ArrowRightIcon className={`text-base-content/20 size-5${vertical ? "rotate-90" : ""}`} />
      </motion.div>
    </motion.div>
  );
};

// Action content wrapper - horizontal on desktop, vertical on mobile
const ActionContent = ({ children, description }: { children: React.ReactNode; description: string }) => (
  <div className="mx-auto w-full max-w-4xl">
    <motion.p
      initial={ACTION_CONTENT_INITIAL}
      animate={ACTION_CONTENT_ANIMATE}
      className="text-base-content/40 mb-8 text-center text-sm sm:mb-10 sm:text-base"
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
            <span className="text-success border-success/20 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider">Best</span>
          </div>
          <RateDisplay newRate="3.40%" label="APY" />
        </div>
      </FlowStep>
      <FlowStep delay={0.5}>
        <div className="text-base-content/25 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1"><Image src="/logos/morpho.svg" alt="" width={12} height={12} className="opacity-50" />3.21%</span>
          <span className="flex items-center gap-1"><Image src="/logos/compound.svg" alt="" width={12} height={12} className="opacity-50" />2.89%</span>
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden items-center justify-center gap-0 md:flex">
      <HFlowStep delay={0}>
        <TokenDisplay logo="/logos/usdc.svg" symbol="USDC" amount="5,000" label="Deposit" size="lg" />
      </HFlowStep>
      <FlowArrow delay={0.15} />
      <HFlowStep delay={0.25}>
        <div className="flex flex-col items-center gap-2 px-6">
          <div className="flex items-center gap-3">
            <ProtocolBadge logo="/logos/aave.svg" name="Aave V3" size="lg" />
            <span className="text-success border-success/20 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider">Best rate</span>
          </div>
          <RateDisplay newRate="3.40%" label="Supply APY" />
        </div>
      </HFlowStep>
      <HFlowStep delay={0.4}>
        <div className="text-base-content/25 border-base-content/10 flex flex-col gap-2 border-l pl-8 text-xs">
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
            <span className="text-success border-success/20 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider">Best</span>
          </div>
          <RateDisplay newRate="3.20%" label="APR" />
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden items-center justify-center gap-0 md:flex">
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
            <span className="text-success border-success/20 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider">Best rate</span>
          </div>
          <RateDisplay newRate="3.20%" label="Borrow APR" />
        </div>
      </HFlowStep>
      <HFlowStep delay={0.55}>
        <div className="text-base-content/25 border-base-content/10 flex flex-col gap-2 border-l pl-8 text-xs">
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
          <span className="text-success font-mono text-xl font-bold">+0.8%</span>
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden items-center justify-center gap-0 md:flex">
      <HFlowStep delay={0}>
        <TokenDisplay logo="/logos/weth.svg" symbol="WETH" amount="2.5" label="Current collateral" size="lg" />
      </HFlowStep>
      <HFlowStep delay={0.15}>
        <div className="flex flex-col items-center px-8">
          <motion.div animate={SWAP_ARROW_ANIMATE} transition={SWAP_ARROW_TRANSITION}>
            <ArrowRightIcon className="text-primary size-6" />
          </motion.div>
          <span className="text-base-content/20 mt-1 text-[9px] uppercase tracking-widest">swap</span>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.3}>
        <TokenDisplay logo="/logos/wsteth.svg" symbol="wstETH" amount="2.15" label="New collateral" size="lg" variant="success" />
      </HFlowStep>
      <HFlowStep delay={0.45}>
        <div className="border-base-content/10 ml-6 flex flex-col items-center border-l pl-10">
          <span className="text-base-content/30 text-[10px] uppercase tracking-wider">APY improvement</span>
          <span className="text-success font-mono text-2xl font-bold">+0.8%</span>
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
            <div className="text-base-content/30 text-[10px] uppercase tracking-wider">Deposit</div>
            <span className="font-mono text-lg">5.0 wstETH</span>
          </div>
        </div>
      </FlowStep>
      <FlowStep delay={0.2}>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary rounded px-3 py-1 text-sm font-bold">3x Loop</span>
        </div>
      </FlowStep>
      <FlowStep delay={0.35}>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Image src="/logos/wsteth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Position:</span>
            <span className="text-success font-mono">15.0 wstETH</span>
          </div>
          <div className="flex items-center gap-2">
            <Image src="/logos/weth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Debt:</span>
            <span className="text-error font-mono">-10.0 WETH</span>
          </div>
        </div>
      </FlowStep>
      <FlowStep delay={0.5}>
        <RateDisplay newRate="+4.2%" label="Net APY" />
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden items-center justify-center gap-0 md:flex">
      <HFlowStep delay={0}>
        <div className="flex items-center gap-3">
          <Image src="/logos/wsteth.svg" alt="wstETH" width={40} height={40} className="rounded-full" />
          <div>
            <div className="text-base-content/30 text-[10px] uppercase tracking-wider">You deposit</div>
            <span className="font-mono text-xl">5.0 wstETH</span>
          </div>
        </div>
      </HFlowStep>
      <FlowArrow delay={0.15} />
      <HFlowStep delay={0.25}>
        <div className="flex flex-col items-center px-6">
          <span className="bg-primary/10 text-primary rounded px-4 py-1.5 text-sm font-bold">3x Leverage</span>
          <span className="text-base-content/20 mt-1 text-[9px] uppercase tracking-widest">wstETH / WETH</span>
        </div>
      </HFlowStep>
      <FlowArrow delay={0.35} />
      <HFlowStep delay={0.45}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Image src="/logos/wsteth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Position:</span>
            <span className="text-success font-mono">15.0 wstETH</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Image src="/logos/weth.svg" alt="" width={20} height={20} />
            <span className="text-base-content/40">Debt:</span>
            <span className="text-error font-mono">-10.0 WETH</span>
          </div>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.55}>
        <div className="border-base-content/10 ml-4 flex flex-col items-center border-l pl-8">
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
            <div className="bg-base-100 absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full">
              <Image src="/logos/pendle.png" alt="Pendle" width={14} height={14} />
            </div>
          </div>
          <div>
            <div className="text-base-content/30 text-[10px] uppercase tracking-wider">Pendle PT</div>
            <div className="font-semibold">PT-USDai-19FEB2026</div>
          </div>
        </div>
      </FlowStep>
      <FlowStep delay={0.2}>
        <RateDisplay newRate="8.42%" label="Fixed APY" />
      </FlowStep>
      <FlowStep delay={0.4}>
        <div className="text-base-content/30 flex items-center gap-4 text-xs">
          <span className="uppercase tracking-wider">Leverage</span>
          <span className="text-base-content/10">|</span>
          <span className="uppercase tracking-wider">Swap</span>
          <span className="text-base-content/10">|</span>
          <span className="uppercase tracking-wider">Refinance</span>
        </div>
      </FlowStep>
    </div>

    {/* Desktop: Horizontal */}
    <div className="hidden items-center justify-center gap-0 md:flex">
      <HFlowStep delay={0}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image src="/logos/ptusdai.svg" alt="PT-USDai" width={44} height={44} className="rounded-full" />
            <div className="bg-base-100 border-base-content/10 absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border">
              <Image src="/logos/pendle.png" alt="Pendle" width={16} height={16} />
            </div>
          </div>
          <div>
            <div className="text-base-content/30 text-[10px] uppercase tracking-wider">Pendle PT Token</div>
            <div className="text-lg font-semibold">PT-USDai-19FEB2026</div>
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
        <div className="border-base-content/10 text-base-content/30 flex flex-col gap-2 border-l pl-8 text-xs">
          <span className="hover:text-base-content/60 cursor-default uppercase tracking-wider transition-colors">Leverage</span>
          <span className="hover:text-base-content/60 cursor-default uppercase tracking-wider transition-colors">Swap</span>
          <span className="hover:text-base-content/60 cursor-default uppercase tracking-wider transition-colors">Refinance</span>
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
            <span className="text-error font-mono">-$12K</span>
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
    <div className="hidden items-center justify-center gap-0 md:flex">
      <HFlowStep delay={0}>
        <div className="flex flex-col items-center gap-2">
          <ProtocolBadge logo="/logos/aave.svg" name="Aave V3" size="lg" />
          <span className="text-base-content/25 text-[10px] uppercase tracking-wider">Current</span>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.1}>
        <div className="border-base-content/5 mx-4 flex flex-col items-center gap-3 border-x px-8 py-2">
          <div className="text-base-content/30 text-[10px] uppercase tracking-wider">Position</div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Image src="/logos/wsteth.svg" alt="wstETH" width={24} height={24} />
              <span className="font-mono">5.25 wstETH</span>
            </div>
            <div className="bg-base-content/10 h-6 w-px" />
            <div className="flex items-center gap-2">
              <Image src="/logos/usdc.svg" alt="USDC" width={24} height={24} />
              <span className="text-error font-mono">-$12,000</span>
            </div>
          </div>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.2}>
        <motion.div
          className="px-4"
          animate={SWAP_ARROW_ANIMATE}
          transition={SWAP_ARROW_TRANSITION}
        >
          <ArrowRightIcon className="text-primary size-6" />
        </motion.div>
      </HFlowStep>
      <HFlowStep delay={0.3}>
        <div className="flex flex-col items-center gap-2">
          <ProtocolBadge logo="/logos/morpho.svg" name="Morpho Blue" size="lg" />
          <span className="text-success text-[10px] uppercase tracking-wider">Better rate</span>
        </div>
      </HFlowStep>
      <HFlowStep delay={0.45}>
        <div className="border-base-content/10 ml-4 border-l pl-8">
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

  // Create stable callbacks for each tab
  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  // Render card based on active tab
  const renderCard = useCallback(() => {
    switch (activeTab) {
      case "lend": return <LendCard />;
      case "borrow": return <BorrowCard />;
      case "loop": return <LoopCard />;
      case "swap": return <SwapCard />;
      case "refinance": return <RefinanceCard />;
      case "pendle": return <PendleCard />;
      default: return <LendCard />;
    }
  }, [activeTab]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      {/* Tight tab bar */}
      <div className="mb-8 flex items-center justify-center">
        <div className="border-base-content/10 inline-flex items-center gap-0 border-b">
          {actionTabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={handleTabClick}
            />
          ))}
        </div>
      </div>

      {/* Content area - allows breathing room for animated content */}
      <div className="flex min-h-[320px] items-start justify-center pt-4 sm:min-h-[380px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={ACTION_TAB_CONTENT_INITIAL}
            animate={ACTION_TAB_CONTENT_ANIMATE}
            exit={ACTION_TAB_CONTENT_EXIT}
            transition={ACTION_TAB_CONTENT_TRANSITION}
            className="w-full"
          >
            {renderCard()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

// Separate tab button component for performance
const TabButton = ({
  tab,
  isActive,
  onClick
}: {
  tab: { id: string; label: string };
  isActive: boolean;
  onClick: (id: string) => void;
}) => {
  const handleClick = useCallback(() => {
    onClick(tab.id);
  }, [onClick, tab.id]);

  return (
    <button
      onClick={handleClick}
      className={`
        relative p-3 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors sm:px-5 sm:text-xs
        ${isActive
          ? "text-base-content"
          : "text-base-content/30 hover:text-base-content/60"}
      `}
    >
      {tab.label}
      {isActive && (
        <motion.div
          layoutId="action-underline"
          className="bg-base-content absolute inset-x-0 bottom-0 h-[2px]"
          transition={ACTION_TAB_UNDERLINE_TRANSITION}
        />
      )}
    </button>
  );
};

// Scroll hint opacity hook
const useScrollHintOpacity = (smoothProgress: MotionValue<number>) => {
  return useTransform(smoothProgress, [0, 0.1], [1, 0]);
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
  const springConfig = useMemo(() => ({ stiffness: 50, damping: 20 }), []);
  const gridX = useSpring(mouseX, springConfig);
  const gridY = useSpring(mouseY, springConfig);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    // Map mouse position to -40px to 40px range (inverse: subtract from center)
    const xOffset = ((clientX / innerWidth) - 0.5) * -80;
    const yOffset = ((clientY / innerHeight) - 0.5) * -80;
    mouseX.set(xOffset);
    mouseY.set(yOffset);
  }, [mouseX, mouseY]);

  const sections: SectionData[] = useMemo(() => [
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
  ], []);

  const { scrollYProgress } = useScroll({ container: containerRef });
  const scrollSpringConfig = useMemo(() => ({ stiffness: 100, damping: 30 }), []);
  const smoothProgress = useSpring(scrollYProgress, scrollSpringConfig);

  // Scroll-based parallax: grid shifts up as you scroll down
  const scrollGridY = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const smoothScrollGridY = useSpring(scrollGridY, springConfig);

  // Track current section for header CTA visibility
  useEffect(() => {
    setTotalSections(sections.length);

    const unsubscribe = scrollYProgress.on("change", (progress) => {
      const sectionIndex = Math.round(progress * (sections.length - 1));
      setCurrentSection(sectionIndex);
    });

    return () => unsubscribe();
  }, [scrollYProgress, sections.length, setCurrentSection, setTotalSections]);

  const gridStyle = useMemo(() => ({
    x: gridX,
    y: smoothScrollGridY,
  }), [gridX, smoothScrollGridY]);

  const innerGridStyle = useMemo(() => ({ y: gridY }), [gridY]);

  const scrollProgressStyle = useMemo(() => ({ height: "100%", scaleY: smoothProgress }), [smoothProgress]);

  const containerHeight = useMemo(() => ({ height: `${sections.length * 100}vh` }), [sections.length]);

  const scrollHintOpacity = useScrollHintOpacity(smoothProgress);

  const scrollHintStyle = useMemo(() => ({ opacity: scrollHintOpacity }), [scrollHintOpacity]);

  return (
    <div
      className="bg-base-100 text-base-content fixed inset-0 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Background grid with parallax effect */}
      <motion.div
        className="absolute inset-0"
        style={gridStyle}
      >
        {/* eslint-disable tailwindcss/no-contradicting-classname -- bg-[linear-gradient] and bg-[size] are different CSS properties */}
        <motion.div
          className="absolute -inset-24 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]"
          style={innerGridStyle}
        />
        {/* eslint-enable tailwindcss/no-contradicting-classname */}
      </motion.div>

      {/* Radial glow - fixed position, no parallax */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="hide-scrollbar relative z-10 size-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {/* Total height based on sections */}
        <div style={containerHeight} className="relative">
          {/* Snap targets */}
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {sections.map((_, i) => (
              <div key={i} className="h-screen w-full snap-start" />
            ))}
          </div>

          {/* Sticky viewport */}
          <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
            {/* Scroll progress indicator */}
            <div className="bg-base-content/5 absolute right-6 top-1/2 hidden h-48 w-[1px] -translate-y-1/2 md:right-12 lg:block">
              <motion.div
                className="bg-base-content/40 w-full origin-top"
                style={scrollProgressStyle}
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
              style={scrollHintStyle}
              className="text-base-content/30 absolute bottom-12 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"
            >
              <span className="landing-tag">Scroll to explore</span>
              <ChevronDownIcon className="size-5 animate-bounce" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StickyLanding;
