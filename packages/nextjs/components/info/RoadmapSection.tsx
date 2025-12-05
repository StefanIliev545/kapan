"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import {
  FiCheck,
  FiClock,
  FiZap,
  FiGlobe,
  FiLayers,
  FiTrendingUp,
  FiActivity,
} from "react-icons/fi";

interface RoadmapPhase {
  phase: number;
  title: string;
  description: string;
  features: string[];
  status: "completed" | "current" | "upcoming";
  icon: React.ReactNode;
  protocols?: string[];
}

const protocolLogos: Record<string, string> = {
  "Aave V3": "aave.svg",
  "Compound V3": "compound.svg",
  "Venus": "venus.svg",
  "Vesu": "vesu.svg",
  "Nostra": "nostra.svg",
  "Euler": "balancer.svg",
  "Morpho": "morpho.svg",
  "Arbitrum": "arb.svg",
  "Optimism": "optimism.svg",
  "Base": "base.svg",
  "Starknet": "starknet.svg",
};

const PhaseCard = ({ phase, index }: { phase: RoadmapPhase; index: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  const isCompleted = phase.status === "completed";
  const isCurrent = phase.status === "current";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="relative"
    >
      {/* Timeline connector (hidden on last item) */}
      {index < 5 && (
        <div className="hidden md:block absolute left-1/2 top-full w-px h-8 bg-gradient-to-b from-base-300 to-transparent" />
      )}

      {/* Card */}
      <div
        className={`relative rounded-2xl p-6 transition-all duration-300 h-full flex flex-col ${
          isCurrent
            ? "bg-gradient-to-br from-primary/10 via-base-200 to-accent/10 border-2 border-primary/30 shadow-lg shadow-primary/5"
            : isCompleted
            ? "bg-base-200/60 border border-base-300/50"
            : "bg-base-200/30 border border-base-300/30"
        }`}
      >
        {/* Status badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isCurrent
                  ? "bg-primary text-primary-content"
                  : isCompleted
                  ? "bg-success/20 text-success"
                  : "bg-base-300/50 text-base-content/50"
              }`}
            >
              {phase.icon}
            </div>
            <div>
              <span className={`text-[10px] uppercase tracking-widest font-semibold ${
                isCurrent ? "text-primary" : isCompleted ? "text-success" : "text-base-content/40"
              }`}>
                Phase {phase.phase}
              </span>
              <h3 className="text-lg font-bold text-base-content leading-tight">{phase.title}</h3>
            </div>
          </div>
          
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold ${
            isCurrent
              ? "bg-primary/20 text-primary"
              : isCompleted
              ? "bg-success/20 text-success"
              : "bg-base-300/50 text-base-content/50"
          }`}>
            {isCompleted && <FiCheck className="w-3 h-3" />}
            {isCurrent && <FiZap className="w-3 h-3" />}
            {!isCompleted && !isCurrent && <FiClock className="w-3 h-3" />}
            <span>{isCompleted ? "Done" : isCurrent ? "Active" : "Soon"}</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-base-content/70 mb-4 leading-relaxed">
          {phase.description}
        </p>

        {/* Features */}
        <div className="space-y-2 flex-1">
          {phase.features.map((feature, idx) => (
            <div 
              key={idx} 
              className={`flex items-center gap-2 text-sm ${
                isCompleted || isCurrent ? "text-base-content/80" : "text-base-content/50"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isCompleted ? "bg-success" : isCurrent ? "bg-primary" : "bg-base-300"
              }`} />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* Protocol logos if any */}
        {phase.protocols && phase.protocols.length > 0 && (
          <div className="flex items-center gap-2 pt-3 mt-auto border-t border-base-300/50">
            <span className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium">Protocols:</span>
            <div className="flex -space-x-1">
              {phase.protocols.map((protocol) => (
                <div
                  key={protocol}
                  className="w-6 h-6 rounded-lg bg-base-100 dark:bg-base-300 border border-base-300/50 p-1 relative"
                  title={protocol}
                >
                  <Image
                    src={`/logos/${protocolLogos[protocol] || "eth.svg"}`}
                    alt={protocol}
                    width={16}
                    height={16}
                    className="object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const RoadmapSection = () => {
  const titleRef = useRef(null);
  const isInViewTitle = useInView(titleRef, { once: true });

  const roadmapPhases: RoadmapPhase[] = [
    {
      phase: 1,
      title: "Core Platform Launch",
      description:
        "Foundation for multi-protocol lending with atomic debt migration and real-time rate comparison.",
      features: [
        "Supply & withdraw assets",
        "Borrow & repay loans",
        "Atomic debt migration",
        "Cross-protocol rate comparison",
      ],
      status: "completed",
      icon: <FiZap className="w-5 h-5" />,
      protocols: ["Aave V3", "Compound V3", "Venus"],
    },
    {
      phase: 2,
      title: "Starknet Deployment",
      description: "Full Starknet support with native protocol integrations and gasless transactions.",
      features: [
        "Starknet mainnet contracts",
        "Vesu integration",
        "Nostra integration",
        "Paymaster support",
      ],
      status: "completed",
      icon: <FiGlobe className="w-5 h-5" />,
      protocols: ["Vesu", "Nostra", "Starknet"],
    },
    {
      phase: 3,
      title: "Advanced Position Management",
      description: "Enhanced DeFi operations including collateral swaps and smart routing.",
      features: [
        "Collateral switching",
        "Smart debt routing",
        "Multi-step refinancing",
        "Position health monitoring",
      ],
      status: "current",
      icon: <FiLayers className="w-5 h-5" />,
    },
    {
      phase: 4,
      title: "Protocol Expansion",
      description:
        "Integrating additional lending protocols to provide more refinancing options and better rates.",
      features: [
        "Euler Finance integration",
        "Morpho Labs integration",
        "Additional L2 networks",
      ],
      status: "upcoming",
      icon: <FiGlobe className="w-5 h-5" />,
      protocols: ["Euler", "Morpho"],
    },
    {
      phase: 5,
      title: "Rate Optimization Engine",
      description:
        "AI-powered rate predictions and automated rebalancing for optimal yield strategies.",
      features: [
        "Interest rate predictions",
        "Automated debt rebalancing",
        "Gas-optimized routes",
        "Yield optimization",
      ],
      status: "upcoming",
      icon: <FiTrendingUp className="w-5 h-5" />,
    },
    {
      phase: 6,
      title: "Cross-chain & Analytics",
      description:
        "Unified cross-chain experience with comprehensive risk analytics and alerts.",
      features: [
        "Cross-chain migration",
        "Loan health notifications",
        "DeFi risk analytics",
        "Rate change alerts",
      ],
      status: "upcoming",
      icon: <FiActivity className="w-5 h-5" />,
      protocols: ["Arbitrum", "Optimism", "Base"],
    },
  ];

  return (
    <section className="py-20 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-100 to-base-200 dark:from-base-200 dark:to-base-300" />

      {/* Section Header */}
      <motion.div
        ref={titleRef}
        initial={{ opacity: 0, y: 20 }}
        animate={isInViewTitle ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16 relative z-10 px-5"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={isInViewTitle ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-4"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">Development Roadmap</span>
        </motion.div>

        <h2 className="text-3xl md:text-4xl font-bold text-base-content mb-4">
          Building the Future of DeFi Lending
        </h2>

        <p className="text-base-content/70 max-w-2xl mx-auto text-base md:text-lg">
          Our strategic path to becoming the unified lending layer across all major protocols and chains.
        </p>
      </motion.div>

      {/* Phases Grid */}
      <div className="max-w-6xl mx-auto px-5 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {roadmapPhases.map((phase, index) => (
            <PhaseCard key={index} phase={phase} index={index} />
          ))}
        </div>

        {/* Note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-base-content/50 max-w-md mx-auto">
            <span className="text-accent font-medium">Note:</span> Roadmap subject to change based on market conditions and community feedback.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default RoadmapSection;
