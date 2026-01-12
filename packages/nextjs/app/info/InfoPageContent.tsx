"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
// Note: Header is rendered by ScaffoldEthAppWithProviders (LandingHeader for /info route)
import { ChevronDownIcon, ArrowRightIcon, ShieldCheckIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useKapanTheme } from "~~/hooks/useKapanTheme";

// Static animation variants - extracted to module level to avoid recreation
const ACCORDION_ANIMATE_OPEN = { height: "auto", opacity: 1 };
const ACCORDION_ANIMATE_CLOSED = { height: 0, opacity: 0 };
const ACCORDION_TRANSITION = { duration: 0.3, ease: "easeInOut" as const };

// Character set for scramble effect
const CHARS = "@#$%&*!?<>[]{}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const getRandomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

// One-shot text scramble - reveals when isActive becomes true
const ScrambleText = ({ 
  text, 
  isActive,
  duration = 800,
}: { 
  text: string; 
  isActive: boolean;
  duration?: number;
}) => {
  const [displayText, setDisplayText] = useState("");
  const [hasRevealed, setHasRevealed] = useState(false);
  const frameRef = useRef<number | null>(null);

  const scrambleReveal = useCallback(() => {
    const length = text.length;
    const startTime = performance.now();
    const scrambledChars = text.split("").map((char) => 
      char === " " || char === "." ? char : getRandomChar()
    );
    let lastScrambleTime = 0;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const revealedCount = Math.floor(progress * length);
      const revealStartIndex = length - revealedCount;

      if (currentTime - lastScrambleTime > 50) {
        lastScrambleTime = currentTime;
        for (let i = 0; i < revealStartIndex; i++) {
          if (text[i] !== " " && text[i] !== ".") {
            scrambledChars[i] = getRandomChar();
          }
        }
      }

      let result = "";
      for (let i = 0; i < length; i++) {
        if (text[i] === " " || text[i] === ".") {
          result += text[i];
        } else if (i >= revealStartIndex) {
          result += text[i];
        } else {
          result += scrambledChars[i];
        }
      }

      setDisplayText(result);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayText(text);
        setHasRevealed(true);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
  }, [text, duration]);

  useEffect(() => {
    if (isActive && !hasRevealed) {
      scrambleReveal();
    }
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isActive, hasRevealed, scrambleReveal]);

  // Initialize with scrambled text
  useEffect(() => {
    if (!displayText && !hasRevealed) {
      const initial = text.split("").map((char) => 
        char === " " || char === "." ? char : getRandomChar()
      ).join("");
      setDisplayText(initial);
    }
  }, [text, displayText, hasRevealed]);

  return <>{displayText}</>;
};

type FAQItem = {
  question: string;
  answer: string;
};

// Supported networks
const networks = [
  { name: "Ethereum", logo: "/logos/eth.svg" },
  { name: "Base", logo: "/logos/base.svg" },
  { name: "Arbitrum", logo: "/logos/arb.svg" },
  { name: "Optimism", logo: "/logos/optimism.svg" },
  { name: "Linea", logo: "/logos/linea.svg" },
  { name: "Starknet", logo: "/logos/starknet.svg" },
];

// Supported protocols
const protocols = [
  { name: "Aave", logo: "/logos/aave.svg" },
  { name: "Morpho", logo: "/logos/morpho.svg" },
  { name: "Compound", logo: "/logos/compound.svg" },
  { name: "Venus", logo: "/logos/venus.svg" },
  { name: "ZeroLend", logo: "/logos/zerolend.svg" },
  { name: "Vesu", logo: "/logos/vesu.svg" },
  { name: "Nostra", logo: "/logos/nostra.svg" },
];

// Routers/Aggregators
const routers = [
  { name: "1inch", logo: "/logos/1inch.png" },
  { name: "AVNU", logo: "/logos/avnu.png" },
  { name: "Pendle", logo: "/logos/pendle.png" },
];

// Section data
interface SectionData {
  tag: string;
  title: string;
  content: React.ReactNode;
  // Content component that accepts isActive prop
  ContentComponent?: React.FC<{ isActive: boolean }>;
}

// Launch App Button
const LaunchAppButton = () => {
  const getAppUrl = useCallback(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol, hostname, host } = window.location;
    const baseHost = hostname.replace(/^www\./, "");
    if (host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${host}`;
    return `${protocol}//app.${baseHost}`;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    track("To App conversion", { button: "Info Page CTA" });
    window.location.assign(getAppUrl());
  }, [getAppUrl]);

  return (
    <a
      href="/app"
      onClick={handleClick}
      className="bg-primary text-primary-content group relative flex h-14 items-center justify-center overflow-hidden px-8 text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-500 hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] md:h-16 md:px-12 md:text-xs"
    >
      <div className="relative z-10 flex items-center gap-3">
        <span className="translate-x-2 transition-transform duration-500 group-hover:translate-x-0">
          Launch App
        </span>
        <ArrowRightIcon className="size-4 opacity-0 transition-all duration-500 group-hover:translate-x-1 group-hover:opacity-100" />
      </div>
    </a>
  );
};

// Integration item
const IntegrationItem = ({ name, logo }: { name: string; logo: string }) => (
  <div className="flex items-center gap-2 px-3 py-2">
    <div className="relative size-6 flex-shrink-0">
      <Image src={logo} alt={name} fill className="object-contain" />
    </div>
    <span className="text-base-content/50 text-xs">{name}</span>
  </div>
);

// Sticky Section component
const StickySection = ({
  section,
  index,
  total,
  scrollYProgress,
}: {
  section: SectionData;
  index: number;
  total: number;
  scrollYProgress: ReturnType<typeof useSpring>;
}) => {
  // First section starts active
  const [hasBeenActive, setHasBeenActive] = useState(index === 0);
  
  const center = index / (total - 1);
  const neighborDistance = 1 / (total - 1);
  const inputRange = [center - neighborDistance, center, center + neighborDistance];

  const opacity = useTransform(
    scrollYProgress,
    [center - neighborDistance * 0.4, center, center + neighborDistance * 0.4],
    [0, 1, 0]
  );
  const scale = useTransform(scrollYProgress, inputRange, [0.95, 1, 0.95]);
  const y = useTransform(scrollYProgress, inputRange, [40, 0, -40]);
  const pointerEvents = useTransform(opacity, (v) => (v > 0.5 ? "auto" : "none"));

  // Track when section becomes active
  useEffect(() => {
    const unsubscribe = opacity.on("change", (v) => {
      const active = v > 0.8;
      if (active && !hasBeenActive) {
        setHasBeenActive(true);
      }
    });
    return () => unsubscribe();
  }, [opacity, hasBeenActive]);

  // Memoize style object for motion.div to avoid recreation
  const motionStyle = useMemo(() => ({
    opacity,
    scale,
    y,
    zIndex: index,
    pointerEvents
  }), [opacity, scale, y, index, pointerEvents]);

  return (
    <motion.div
      style={motionStyle}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div className="flex w-full max-w-4xl flex-col items-center px-6 text-center md:px-8">
        {/* Tag + Title */}
        <div className="mb-8 flex flex-col items-center gap-3 md:mb-12">
          <div className="bg-base-content/20 h-px w-10" />
          <span className="text-base-content/40 text-[10px] font-medium uppercase tracking-[0.2em]">
            {section.tag}
          </span>
          <h2 className="text-4xl font-black uppercase tracking-tight md:text-5xl lg:text-6xl">
            <ScrambleText text={section.title} isActive={hasBeenActive} duration={600} />
          </h2>
        </div>

        {/* Content */}
        <div className="w-full">
          {section.ContentComponent ? (
            <section.ContentComponent isActive={hasBeenActive} />
          ) : (
            section.content
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Mission content
const MissionContent = ({ isActive }: { isActive: boolean }) => (
  <div className="mx-auto max-w-2xl space-y-6">
    <p className="text-base-content/50 text-lg leading-relaxed md:text-xl">
      <ScrambleText text="Deposit. Borrow. Swap. Refinance. Loop. Close." isActive={isActive} duration={700} />
    </p>
    <p className="text-base-content/50 text-lg leading-relaxed md:text-xl">
      <ScrambleText text="Any combination. Any protocol. One transaction." isActive={isActive} duration={700} />
    </p>
  </div>
);

// Features content - staggered scramble for each feature
const FeaturesContent = ({ isActive }: { isActive: boolean }) => {
  const features = [
    { title: "ATOMIC", desc: "One tx. All actions. Reverts if anything fails." },
    { title: "NON-CUSTODIAL", desc: "Your keys. Your assets. Always." },
    { title: "ZERO FEES", desc: "We don't take a cut. Ever." },
  ];

  // Stagger delays for each feature
  const [feature1Active, setFeature1Active] = useState(false);
  const [feature2Active, setFeature2Active] = useState(false);
  const [feature3Active, setFeature3Active] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Stagger the activation
      const t1 = setTimeout(() => setFeature1Active(true), 0);
      const t2 = setTimeout(() => setFeature2Active(true), 400);
      const t3 = setTimeout(() => setFeature3Active(true), 800);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isActive]);

  const featureStates = [feature1Active, feature2Active, feature3Active];

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
      {features.map((f, i) => (
        <div key={f.title} className="text-center">
          <h3 className="mb-2 text-lg font-bold tracking-tight md:text-xl">
            <ScrambleText text={f.title} isActive={featureStates[i]} duration={500} />
          </h3>
          <p className="text-base-content/40 text-sm">
            <ScrambleText text={f.desc} isActive={featureStates[i]} duration={600} />
          </p>
        </div>
      ))}
    </div>
  );
};

// Integrations content
const IntegrationsContent = ({ isActive }: { isActive: boolean }) => (
  <div className="mx-auto max-w-2xl space-y-6">
    <div>
      <h3 className="text-base-content/30 mb-3 text-[10px] uppercase tracking-[0.15em]">
        <ScrambleText text="Networks" isActive={isActive} duration={400} />
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {networks.map((item) => <IntegrationItem key={item.name} {...item} />)}
      </div>
    </div>
    <div>
      <h3 className="text-base-content/30 mb-3 text-[10px] uppercase tracking-[0.15em]">
        <ScrambleText text="Protocols" isActive={isActive} duration={400} />
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {protocols.map((item) => <IntegrationItem key={item.name} {...item} />)}
      </div>
    </div>
    <div>
      <h3 className="text-base-content/30 mb-3 text-[10px] uppercase tracking-[0.15em]">
        <ScrambleText text="Routers" isActive={isActive} duration={400} />
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {routers.map((item) => <IntegrationItem key={item.name} {...item} />)}
      </div>
    </div>
  </div>
);

// FAQ content
const FAQContent = ({ faqItems, isActive }: { faqItems: FAQItem[]; isActive: boolean }) => {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const handleToggle = useCallback((index: number) => {
    setOpenFAQ(prev => prev === index ? null : index);
  }, []);

  // Create memoized toggle handlers for each FAQ item
  const toggleHandlers = useMemo(() =>
    faqItems.map((_, i) => () => handleToggle(i)),
    [faqItems, handleToggle]
  );

  return (
    <div className="mx-auto max-w-xl text-left">
      {faqItems.map((item, i) => (
        <FAQAccordionScramble
          key={i}
          item={item}
          isOpen={openFAQ === i}
          onToggle={toggleHandlers[i]}
          isActive={isActive}
          delay={i * 150}
        />
      ))}
    </div>
  );
};

// FAQ Accordion with scramble effect
const FAQAccordionScramble = ({
  item,
  isOpen,
  onToggle,
  isActive,
  delay
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
  isActive: boolean;
  delay: number;
}) => {
  const [itemActive, setItemActive] = useState(false);

  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => setItemActive(true), delay);
      return () => clearTimeout(t);
    }
  }, [isActive, delay]);

  return (
    <div className="border-base-content/10 border-b">
      <button
        onClick={onToggle}
        className="group flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-base-content/70 group-hover:text-base-content pr-4 text-sm font-medium transition-colors md:text-base">
          <ScrambleText text={item.question} isActive={itemActive} duration={500} />
        </span>
        <ChevronDownIcon
          className={`text-base-content/40 size-4 flex-shrink-0 transition-transform duration-300${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <motion.div
        initial={false}
        animate={isOpen ? ACCORDION_ANIMATE_OPEN : ACCORDION_ANIMATE_CLOSED}
        transition={ACCORDION_TRANSITION}
        className="overflow-hidden"
      >
        <p className="text-base-content/40 pb-5 text-sm leading-relaxed">
          {item.answer}
        </p>
      </motion.div>
    </div>
  );
};

// Security content
const SecurityContent = ({ isActive }: { isActive: boolean }) => (
  <div className="flex flex-col items-center gap-6">
    <p className="text-base-content/40 max-w-md text-sm">
      <ScrambleText text="Audited. Verified. Open source." isActive={isActive} duration={500} />
    </p>
    <a
      href="/audits/022_CODESPECT_KAPAN_FINANCE.pdf"
      target="_blank"
      rel="noopener noreferrer"
      className="border-base-content/10 hover:border-base-content/20 group flex items-center gap-3 border px-5 py-3 transition-colors"
    >
      <ShieldCheckIcon className="text-success size-6" />
      <div className="text-left">
        <div className="text-base-content/80 group-hover:text-success text-sm font-medium transition-colors">
          <ScrambleText text="Starknet Audit" isActive={isActive} duration={500} />
        </div>
        <div className="text-base-content/40 text-[10px]">
          <ScrambleText text="Codespect" isActive={isActive} duration={400} />
        </div>
      </div>
      <DocumentTextIcon className="text-base-content/30 size-4" />
    </a>
  </div>
);

// CTA content
const CTAContent = ({ isActive }: { isActive: boolean }) => (
  <div className="flex flex-col items-center gap-8">
    <LaunchAppButton />
    <div className="text-base-content/30 flex items-center gap-6 text-xs">
      <a href="https://discord.gg/Vjk6NhkxGv" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">
        <ScrambleText text="Discord" isActive={isActive} duration={300} />
      </a>
      <a href="https://t.me/+vYCKr2TrOXRiODg0" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">
        <ScrambleText text="Telegram" isActive={isActive} duration={300} />
      </a>
      <a href="https://x.com/KapanFinance" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">
        <ScrambleText text="Twitter" isActive={isActive} duration={300} />
      </a>
      <a href="https://github.com/StefanIliev545/kapan" target="_blank" rel="noopener noreferrer" className="hover:text-base-content/60 transition-colors">
        <ScrambleText text="GitHub" isActive={isActive} duration={300} />
      </a>
    </div>
  </div>
);

// Static spring config - extracted to module level
const SMOOTH_PROGRESS_CONFIG = { stiffness: 100, damping: 30 };

// Progress indicator style - extracted to module level
const PROGRESS_STYLE = { height: "100%" };

const InfoPageContent = ({ faqItems }: { faqItems: FAQItem[] }) => {
  useKapanTheme();

  const containerRef = useRef<HTMLDivElement>(null);

  // Memoize FAQContent wrapper component to avoid recreation
  const FAQContentWrapper = useMemo(() => {
    const Component: React.FC<{ isActive: boolean }> = ({ isActive }) => (
      <FAQContent faqItems={faqItems} isActive={isActive} />
    );
    Component.displayName = "FAQContentWrapper";
    return Component;
  }, [faqItems]);

  const sections: SectionData[] = useMemo(() => [
    {
      tag: "01 / MISSION",
      title: "ONE TRANSACTION.",
      content: null,
      ContentComponent: MissionContent,
    },
    {
      tag: "02 / FEATURES",
      title: "NO COMPROMISES.",
      content: null,
      ContentComponent: FeaturesContent,
    },
    {
      tag: "03 / INTEGRATIONS",
      title: "EVERYWHERE.",
      content: null,
      ContentComponent: IntegrationsContent,
    },
    {
      tag: "04 / FAQ",
      title: "QUESTIONS.",
      content: null,
      ContentComponent: FAQContentWrapper,
    },
    {
      tag: "05 / SECURITY",
      title: "AUDITED.",
      content: null,
      ContentComponent: SecurityContent,
    },
    {
      tag: "06 / START",
      title: "TRY IT.",
      content: null,
      ContentComponent: CTAContent,
    },
  ], [FAQContentWrapper]);

  const { scrollYProgress } = useScroll({ container: containerRef });
  const smoothProgress = useSpring(scrollYProgress, SMOOTH_PROGRESS_CONFIG);

  // Memoize scroll container height style
  const scrollContainerStyle = useMemo(() => ({
    height: `${sections.length * 100}vh`
  }), [sections.length]);

  // Memoize scroll hint opacity transform
  const scrollHintOpacity = useTransform(smoothProgress, [0, 0.1], [1, 0]);

  // Memoize scroll hint style object
  const scrollHintStyle = useMemo(() => ({
    opacity: scrollHintOpacity
  }), [scrollHintOpacity]);

  // Memoize progress indicator style with scaleY
  const progressIndicatorStyle = useMemo(() => ({
    ...PROGRESS_STYLE,
    scaleY: smoothProgress
  }), [smoothProgress]);

  return (
    <div className="bg-base-100 text-base-content fixed inset-0 overflow-hidden">
      {/* Background grid */}
      {/* eslint-disable-next-line tailwindcss/no-contradicting-classname -- bg-[linear-gradient] and bg-[size] are different CSS properties */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="hide-scrollbar relative z-10 size-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        <div style={scrollContainerStyle} className="relative">
          {/* Snap targets */}
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {sections.map((_, i) => (
              <div key={i} className="h-screen w-full snap-start" />
            ))}
          </div>

          {/* Sticky viewport */}
          <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
            {/* Progress indicator */}
            <div className="bg-base-content/5 absolute right-6 top-1/2 hidden h-48 w-[1px] -translate-y-1/2 md:right-12 lg:block">
              <motion.div
                className="bg-base-content/40 w-full origin-top"
                style={progressIndicatorStyle}
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

            {/* Scroll hint */}
            <motion.div
              style={scrollHintStyle}
              className="text-base-content/30 absolute bottom-12 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"
            >
              <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
              <ChevronDownIcon className="size-4 animate-bounce" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPageContent;
