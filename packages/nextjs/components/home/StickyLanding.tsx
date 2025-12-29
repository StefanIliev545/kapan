"use client";

import { useRef, useMemo, useEffect } from "react";
import Image from "next/image";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { ChevronDownIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { StickySection, SectionData } from "./StickySection";
import LandingExplainer from "./LandingExplainer";
import DashboardPreview from "./DashboardPreview";

// Force kapan theme on mount and restore on unmount
const useKapanTheme = () => {
  useEffect(() => {
    const html = document.documentElement;
    const previousTheme = html.getAttribute("data-theme");
    
    // Force kapan theme
    html.setAttribute("data-theme", "kapan");
    
    return () => {
      // Restore previous theme on unmount (navigation away)
      if (previousTheme) {
        html.setAttribute("data-theme", previousTheme);
      }
    };
  }, []);
};

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

const FeatureList = () => {
  const features = [
    { title: "Non-Custodial", desc: "Your assets stay yours. Verify on any protocol's frontend." },
    { title: "Atomic Transactions", desc: "All operations execute in a single transaction using flash loans." },
    { title: "Zero Protocol Fees", desc: "You only pay network gas and swap fees. No Kapan fees." },
    { title: "Any Gas Token", desc: "Pay gas in any token with AVNU Paymaster integration." },
  ];

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {features.map((f, i) => (
          <div key={i} className="text-left border-l border-base-content/10 pl-4">
            <div className="text-sm font-semibold text-base-content/90 mb-1">{f.title}</div>
            <div className="text-sm text-base-content/50">{f.desc}</div>
          </div>
        ))}
      </div>
      <LaunchAppButton />
    </div>
  );
};

export const StickyLanding = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Force kapan dark theme on landing page
  useKapanTheme();

  const sections: SectionData[] = [
    {
      tag: "00 / KAPAN",
      title: "ONE DASHBOARD.",
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
      content: <LandingExplainer />,
      compactHeader: true,
    },
    {
      tag: "03 / WHY",
      title: "BUILT FOR YOU.",
      description: "Everything you need for efficient DeFi lending, without the usual friction.",
      content: <FeatureList />,
    },
  ];

  const { scrollYProgress } = useScroll({ container: containerRef });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="fixed inset-0 bg-base-100 text-base-content overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_70%)]" />
      </div>

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
