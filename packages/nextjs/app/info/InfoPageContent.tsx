"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
// Note: Header is rendered by ScaffoldEthAppWithProviders (LandingHeader for /info route)
import { ChevronDownIcon, ArrowRightIcon, ShieldCheckIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useKapanTheme } from "~~/hooks/useKapanTheme";

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
    let scrambledChars = text.split("").map((char) => 
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

// FAQ Accordion item
const FAQAccordion = ({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) => (
  <div className="border-b border-base-content/10">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-5 text-left group"
    >
      <span className="text-sm md:text-base font-medium text-base-content/70 group-hover:text-base-content transition-colors pr-4">
        {item.question}
      </span>
      <ChevronDownIcon 
        className={`w-4 h-4 text-base-content/40 flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} 
      />
    </button>
    <motion.div
      initial={false}
      animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <p className="pb-5 text-base-content/40 text-sm leading-relaxed">
        {item.answer}
      </p>
    </motion.div>
  </div>
);

// Launch App Button
const LaunchAppButton = () => {
  const getAppUrl = () => {
    if (typeof window === "undefined") return "/app";
    const { protocol, hostname, host } = window.location;
    const baseHost = hostname.replace(/^www\./, "");
    if (host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${host}`;
    return `${protocol}//app.${baseHost}`;
  };

  return (
    <a
      href="/app"
      onClick={e => {
        e.preventDefault();
        track("To App conversion", { button: "Info Page CTA" });
        window.location.assign(getAppUrl());
      }}
      className="group relative h-14 md:h-16 px-8 md:px-12 bg-primary text-primary-content font-bold uppercase tracking-[0.2em] text-[11px] md:text-xs hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-500 overflow-hidden flex items-center justify-center"
    >
      <div className="relative z-10 flex items-center gap-3">
        <span className="translate-x-2 group-hover:translate-x-0 transition-transform duration-500">
          Launch App
        </span>
        <ArrowRightIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-500" />
      </div>
    </a>
  );
};

// Integration item
const IntegrationItem = ({ name, logo }: { name: string; logo: string }) => (
  <div className="flex items-center gap-2 px-3 py-2">
    <div className="w-6 h-6 relative flex-shrink-0">
      <Image src={logo} alt={name} fill className="object-contain" />
    </div>
    <span className="text-xs text-base-content/50">{name}</span>
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

  return (
    <motion.div
      style={{ opacity, scale, y, zIndex: index, pointerEvents }}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div className="w-full max-w-4xl px-6 md:px-8 flex flex-col items-center text-center">
        {/* Tag + Title */}
        <div className="flex flex-col items-center gap-3 mb-8 md:mb-12">
          <div className="h-px w-10 bg-base-content/20" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-base-content/40 font-medium">
            {section.tag}
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight">
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
  <div className="max-w-2xl mx-auto space-y-6">
    <p className="text-lg md:text-xl text-base-content/50 leading-relaxed">
      <ScrambleText text="Deposit. Borrow. Swap. Refinance. Loop. Close." isActive={isActive} duration={700} />
    </p>
    <p className="text-lg md:text-xl text-base-content/50 leading-relaxed">
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 max-w-3xl mx-auto">
      {features.map((f, i) => (
        <div key={f.title} className="text-center">
          <h3 className="text-lg md:text-xl font-bold tracking-tight mb-2">
            <ScrambleText text={f.title} isActive={featureStates[i]} duration={500} />
          </h3>
          <p className="text-sm text-base-content/40">
            <ScrambleText text={f.desc} isActive={featureStates[i]} duration={600} />
          </p>
        </div>
      ))}
    </div>
  );
};

// Integrations content
const IntegrationsContent = ({ isActive }: { isActive: boolean }) => (
  <div className="space-y-6 max-w-2xl mx-auto">
    <div>
      <h3 className="text-[10px] uppercase tracking-[0.15em] text-base-content/30 mb-3">
        <ScrambleText text="Networks" isActive={isActive} duration={400} />
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {networks.map((item) => <IntegrationItem key={item.name} {...item} />)}
      </div>
    </div>
    <div>
      <h3 className="text-[10px] uppercase tracking-[0.15em] text-base-content/30 mb-3">
        <ScrambleText text="Protocols" isActive={isActive} duration={400} />
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {protocols.map((item) => <IntegrationItem key={item.name} {...item} />)}
      </div>
    </div>
    <div>
      <h3 className="text-[10px] uppercase tracking-[0.15em] text-base-content/30 mb-3">
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
  
  return (
    <div className="max-w-xl mx-auto text-left">
      {faqItems.map((item, i) => (
        <FAQAccordionScramble
          key={i}
          item={item}
          isOpen={openFAQ === i}
          onToggle={() => setOpenFAQ(openFAQ === i ? null : i)}
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
    <div className="border-b border-base-content/10">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-sm md:text-base font-medium text-base-content/70 group-hover:text-base-content transition-colors pr-4">
          <ScrambleText text={item.question} isActive={itemActive} duration={500} />
        </span>
        <ChevronDownIcon 
          className={`w-4 h-4 text-base-content/40 flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} 
        />
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <p className="pb-5 text-base-content/40 text-sm leading-relaxed">
          {item.answer}
        </p>
      </motion.div>
    </div>
  );
};

// Security content
const SecurityContent = ({ isActive }: { isActive: boolean }) => (
  <div className="flex flex-col items-center gap-6">
    <p className="text-base-content/40 text-sm max-w-md">
      <ScrambleText text="Audited. Verified. Open source." isActive={isActive} duration={500} />
    </p>
    <a
      href="/audits/022_CODESPECT_KAPAN_FINANCE.pdf"
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 px-5 py-3 border border-base-content/10 hover:border-base-content/20 transition-colors"
    >
      <ShieldCheckIcon className="w-6 h-6 text-success" />
      <div className="text-left">
        <div className="text-sm font-medium text-base-content/80 group-hover:text-success transition-colors">
          <ScrambleText text="Starknet Audit" isActive={isActive} duration={500} />
        </div>
        <div className="text-[10px] text-base-content/40">
          <ScrambleText text="Codespect" isActive={isActive} duration={400} />
        </div>
      </div>
      <DocumentTextIcon className="w-4 h-4 text-base-content/30" />
    </a>
  </div>
);

// CTA content
const CTAContent = ({ isActive }: { isActive: boolean }) => (
  <div className="flex flex-col items-center gap-8">
    <LaunchAppButton />
    <div className="flex items-center gap-6 text-xs text-base-content/30">
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

const InfoPageContent = ({ faqItems }: { faqItems: FAQItem[] }) => {
  useKapanTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  const sections: SectionData[] = [
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
      ContentComponent: ({ isActive }) => <FAQContent faqItems={faqItems} isActive={isActive} />,
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
  ];

  const { scrollYProgress } = useScroll({ container: containerRef });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="fixed inset-0 bg-base-100 text-base-content overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="h-full w-full hide-scrollbar relative z-10 overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        <div style={{ height: `${sections.length * 100}vh` }} className="relative">
          {/* Snap targets */}
          <div className="absolute inset-0 flex flex-col pointer-events-none">
            {sections.map((_, i) => (
              <div key={i} className="h-screen w-full snap-start" />
            ))}
          </div>

          {/* Sticky viewport */}
          <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
            {/* Progress indicator */}
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

            {/* Scroll hint */}
            <motion.div
              style={{ opacity: useTransform(smoothProgress, [0, 0.1], [1, 0]) }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-base-content/30"
            >
              <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
              <ChevronDownIcon className="w-4 h-4 animate-bounce" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPageContent;
