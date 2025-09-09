import React, { useRef } from "react";
import Image from "next/image";
import { type TargetAndTransition, type Variants, motion, useInView } from "framer-motion";
import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ArrowsPointingOutIcon,
  BanknotesIcon,
  BoltIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  ChevronDoubleRightIcon,
  CubeTransparentIcon,
  DocumentChartBarIcon,
  GlobeAltIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

interface RoadmapPhase {
  phase: number;
  title: string;
  description: string;
  features: string[];
  isActive?: boolean;
  icon: React.ReactNode;
}

// Animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, type: "spring", stiffness: 100 } },
} as const;

const featureVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number): TargetAndTransition => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.3 + i * 0.1, duration: 0.4, type: "spring" },
  }),
};

// Helper to render protocol logos within text when mentioned
const enhanceWithProtocolLogos = (text: string) => {
  // Check for mentions of protocols and wrap them with their logos
  const protocolMatches = {
    "Aave V3": "aave.svg",
    Aave: "aave.svg",
    "Compound V3": "compound.svg",
    Compound: "compound.svg",
    "Euler Finance": "balancer.svg", // Using balancer for now
    "Morpho Labs": "morpho.svg", // Using ETH for now
    "Spark Protocol": "spark.svg", // Using DAI for now
    "Venus Protocol": "venus.svg", // Using USDC for now
    Vesu: "vesu.svg",
    Nostra: "nostra.svg",
    Arbitrum: "arb.svg",
    Optimism: "optimism.svg", // Using ETH for now as placeholder
    Polygon: "eth.svg", // Using ETH for now as placeholder
    Base: "base.svg", // Using ETH for now as placeholder
  };

  // Split the text by protocol mentions and create an array of React components
  const parts: React.ReactNode[] = [];
  let remainingText = text;
  let lastIndex = 0;

  // Sort protocols by length (longest first) to handle overlapping names correctly
  const sortedProtocols = Object.keys(protocolMatches).sort((a, b) => b.length - a.length);

  while (remainingText.length > 0) {
    let earliestMatch: { protocol: string; index: number } | null = null;

    // Find the earliest protocol mention
    for (const protocol of sortedProtocols) {
      const index = remainingText.indexOf(protocol);
      if (index !== -1 && (earliestMatch === null || index < earliestMatch.index)) {
        earliestMatch = { protocol, index };
      }
    }

    if (earliestMatch === null) {
      // No more protocols found, add remaining text
      parts.push(remainingText);
      break;
    }

    // Add text before the protocol mention
    if (earliestMatch.index > 0) {
      parts.push(remainingText.substring(0, earliestMatch.index));
    }

    // Add the protocol mention with logo
    const protocol = earliestMatch.protocol;
    const logo = protocolMatches[protocol as keyof typeof protocolMatches];

    parts.push(
      <span key={`${protocol}-${lastIndex}`} className="inline-flex items-center align-baseline">
        <span className="inline-flex items-center justify-center w-4 h-4 mr-1 relative align-middle">
          <Image src={`/logos/${logo}`} alt={protocol} width={16} height={16} className="object-contain" />
        </span>
        <span className="align-baseline">{protocol}</span>
      </span>,
    );

    // Update remaining text and lastIndex
    remainingText = remainingText.substring(earliestMatch.index + protocol.length);
    lastIndex++;
  }

  return <>{parts}</>;
};

const Feature = ({ text, index, icon }: { text: string; index: number; icon?: React.ReactNode }) => (
  <motion.li custom={index} variants={featureVariants} initial="hidden" animate="visible" className="py-2">
    <div className="flex items-center gap-3">
      <div className="p-1.5 rounded-lg bg-accent/10">
        {icon || <ChevronDoubleRightIcon className="w-3.5 h-3.5 text-accent" />}
      </div>
      <span className="text-base-content/90">{enhanceWithProtocolLogos(text)}</span>
    </div>
  </motion.li>
);

const PhaseCard = ({ phase, index }: { phase: RoadmapPhase; index: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  const iconMap: { [key: string]: React.ReactNode } = {
    "Supply Assets": <BanknotesIcon className="w-3.5 h-3.5 text-accent" />,
    "Repay Loans": <ArrowPathIcon className="w-3.5 h-3.5 text-accent" />,
    "Atomic Debt Migration": <BoltIcon className="w-3.5 h-3.5 text-accent" />,
    "Cross-Protocol Rate Comparison": <DocumentChartBarIcon className="w-3.5 h-3.5 text-accent" />,
    "Collateral Switching": <ArrowPathIcon className="w-3.5 h-3.5 text-accent" />,
    "Smart Debt Migration Routing": <CubeTransparentIcon className="w-3.5 h-3.5 text-accent" />,
    "Cross-Protocol Collateral Detection": <ShieldCheckIcon className="w-3.5 h-3.5 text-accent" />,
    "Multi-step Position Refinancing": <ArrowsPointingOutIcon className="w-3.5 h-3.5 text-accent" />,
    "Interest Rate Predictions": <ChartBarIcon className="w-3.5 h-3.5 text-accent" />,
    "Automated Debt Rebalancing": <ArrowPathIcon className="w-3.5 h-3.5 text-accent" />,
    "Gas-optimized Migration Routes": <BoltIcon className="w-3.5 h-3.5 text-accent" />,
    "Yield Optimization Strategies": <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-accent" />,
    "Loan Health Notifications": <DocumentChartBarIcon className="w-3.5 h-3.5 text-accent" />,
    "DeFi Risk Analytics": <ShieldCheckIcon className="w-3.5 h-3.5 text-accent" />,
    "Rate Change Alerts": <BoltIcon className="w-3.5 h-3.5 text-accent" />,
  };

  return (
    <motion.div
      ref={ref}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={`relative z-10 overflow-hidden ${phase.isActive ? "bg-base-200/80 shadow-xl" : "bg-base-200/50"}`}
      style={{
        borderRadius: "24px",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Tech-style border */}
      <div className="absolute inset-0 border border-accent/10 rounded-[24px] pointer-events-none z-20"></div>

      {/* Tech-pattern background */}
      <div className="absolute inset-0 z-0 opacity-5">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <pattern id={`tech-pattern-${index}`} width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="1" fill="currentColor" />
            <path d="M0,15 L30,15" stroke="currentColor" strokeWidth="0.5" />
            <path d="M15,0 L15,30" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#tech-pattern-${index})`} />
        </svg>
      </div>

      {/* Glow effect for active phase */}
      {phase.isActive && (
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 via-accent/30 to-primary/30 rounded-[24px] z-0 animate-pulse-slow"></div>
      )}

      <div className="p-6 relative z-10">
        {/* Phase header with icon */}
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${phase.isActive ? "bg-gradient-to-br from-primary to-accent text-base-100" : "bg-base-300/50 text-base-content/70"}`}
            >
              {phase.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`text-xs font-medium uppercase tracking-widest ${phase.isActive ? "text-accent" : "text-base-content/60"}`}
                >
                  Phase {phase.phase}
                </div>
                {phase.isActive && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent/20 text-accent">
                    Current
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold leading-tight">{phase.title}</h3>
            </div>
          </div>
        </div>

        {/* Description with enhanced text */}
        <div className="mb-5 text-base-content/80 text-sm">{enhanceWithProtocolLogos(phase.description)}</div>

        {/* Features with icons */}
        <motion.ul className="space-y-0.5 text-sm">
          {phase.features.map((feature, idx) => (
            <Feature key={idx} text={feature} index={idx} icon={iconMap[feature] || undefined} />
          ))}
        </motion.ul>
      </div>

      {/* Bottom tech corner accent */}
      <div className="absolute -bottom-2 -right-2 w-16 h-16 overflow-hidden z-20">
        <div
          className={`absolute bottom-0 right-0 w-8 h-8 border-t border-l ${phase.isActive ? "border-accent/40" : "border-base-300"} transform rotate-45 translate-y-[5px]`}
        ></div>
      </div>
    </motion.div>
  );
};

const RoadmapSection = () => {
  const titleRef = useRef(null);
  const isInViewTitle = useInView(titleRef, { once: true });

  const roadmapPhases = [
    {
      phase: 1,
      title: "Initial Web3 Lending Platform Launch",
      description:
        "Core features supporting basic lending operations and atomic debt migration across Aave V3, Compound V3, and Venus Protocol.",
      features: ["Supply Assets", "Repay Loans", "Atomic Debt Migration", "Cross-Protocol Rate Comparison"],
      icon: <RocketLaunchIcon className="w-5 h-5" />,
    },
    {
      phase: 2,
      title: "Starknet Deployment",
      description: "Deployment on Starknet with full support for Vesu and Nostra lending protocols.",
      features: [
        "Starknet Contracts",
        "Vesu Support",
        "Nostra Support",
        "Cross-Protocol Rate Comparison",
      ],
      isActive: true,
      icon: <GlobeAltIcon className="w-5 h-5" />,
    },
    {
      phase: 3,
      title: "Additional Protocol Integrations",
      description:
        "Expanding our atomic debt migration to support additional DeFi lending protocols for more refinancing options and better rates.",
      features: ["Euler Finance", "Morpho Labs"],
      icon: <BuildingLibraryIcon className="w-5 h-5" />,
    },
    {
      phase: 4,
      title: "Advanced DeFi Loan Management",
      description: "Enhanced debt management with smart routing and cross-protocol collateral operations.",
      features: [
        "Collateral Switching",
        "Smart Debt Migration Routing",
        "Cross-Protocol Collateral Detection",
        "Multi-step Position Refinancing",
      ],
      icon: <ArrowsPointingOutIcon className="w-5 h-5" />,
    },
    {
      phase: 5,
      title: "DeFi Loan Rate Optimization",
      description:
        "Implementing sophisticated algorithms for finding and automatically executing the most profitable Web3 loan refinancing strategies.",
      features: [
        "Interest Rate Predictions",
        "Automated Debt Rebalancing",
        "Gas-optimized Migration Routes",
        "Yield Optimization Strategies",
      ],
      icon: <ChartBarIcon className="w-5 h-5" />,
    },
    {
      phase: 6,
      title: "Cross-chain Web3 Debt Migration & Advanced Features",
      description:
        "Expanding atomic debt migration to multiple blockchain networks and implementing advanced DeFi portfolio management features.",
      features: [
        "Arbitrum",
        "Optimism",
        "Base",
        "Loan Health Notifications",
        "DeFi Risk Analytics",
        "Rate Change Alerts",
      ],
      icon: <GlobeAltIcon className="w-5 h-5" />,
    },
  ];

  return (
    <section className="py-16 relative">
      {/* Tech-inspired background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        {/* Circuit board style gradient background */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/5 via-transparent to-accent/5"></div>

        {/* Abstract tech shapes */}
        <svg
          className="absolute top-0 left-0 w-full h-full opacity-10"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 800 800"
        >
          <circle cx="400" cy="400" r="200" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="10,10" />
          <path d="M100,400 L700,400" stroke="currentColor" strokeWidth="1" strokeDasharray="15,15" />
          <path d="M400,100 L400,700" stroke="currentColor" strokeWidth="1" strokeDasharray="15,15" />
        </svg>
      </div>

      {/* Section Title with tech-styled accent */}
      <motion.div
        ref={titleRef}
        initial={{ opacity: 0, y: 20 }}
        animate={isInViewTitle ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-20 relative"
      >
        <motion.div
          initial={{ width: 0 }}
          animate={isInViewTitle ? { width: "100px" } : { width: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="h-0.5 bg-accent/50 mx-auto mb-8"
        ></motion.div>

        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={isInViewTitle ? { y: 0, opacity: 1 } : { y: -20, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-block px-4 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium uppercase tracking-wider mb-3"
        >
          Development Timeline
        </motion.div>

        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={isInViewTitle ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl font-bold mb-4"
        >
          DeFi Lending Aggregation Roadmap
        </motion.h2>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={isInViewTitle ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base-content/80 max-w-2xl mx-auto"
        >
          Our strategic development path outlines how we&apos;re building the future of cross-protocol Web3 lending and
          debt refinancing solutions.
        </motion.p>

        <motion.div
          initial={{ width: 0 }}
          animate={isInViewTitle ? { width: "100px" } : { width: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="h-0.5 bg-accent/50 mx-auto mt-8"
        ></motion.div>
      </motion.div>

      {/* Phases Grid */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {roadmapPhases.map((phase, index) => (
            <PhaseCard key={index} phase={phase} index={index} />
          ))}
        </div>
      </div>

      {/* Tech-styled Note Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex justify-center mt-16"
      >
        <div className="bg-base-200/60 backdrop-blur-md p-4 max-w-md rounded-lg border border-base-300 relative overflow-hidden">
          {/* Tech corner accent */}
          <div className="absolute -top-1 -right-1 w-8 h-8 border-b border-r border-accent/30 transform rotate-45 translate-y-[-5px]"></div>

          <p className="text-center text-sm text-base-content/80">
            <span className="text-accent font-medium">Note:</span> This roadmap is subject to change based on market
            conditions, technological advancements, and community feedback.
          </p>
        </div>
      </motion.div>

      {/* Mobile Navigation Hint */}
      {roadmapPhases.length > 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="mt-8 text-center md:hidden"
        >
          <p className="text-xs text-base-content/60">Swipe to explore all phases</p>
          <div className="flex justify-center gap-1 mt-2">
            {roadmapPhases.map((_, idx) => (
              <motion.div
                key={idx}
                animate={{
                  opacity: [0.3, 1, 0.3],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  repeatType: "loop",
                  delay: idx * 0.2,
                }}
                className="w-1.5 h-1.5 rounded-full bg-accent/60"
              />
            ))}
          </div>
        </motion.div>
      )}
    </section>
  );
};

export default RoadmapSection;
