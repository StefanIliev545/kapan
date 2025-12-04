"use client";

import { motion } from "framer-motion";
import { FiZap, FiCreditCard, FiRefreshCw, FiShield, FiDollarSign } from "react-icons/fi";

interface FeatureItem {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  {
    icon: <FiCreditCard className="w-5 h-5" />,
    title: "Pay with Any Gas Token",
    description: "AVNU Paymaster integration lets you pay gas fees in the token of your choice — no need to hold native tokens.",
  },
  {
    icon: <FiZap className="w-5 h-5" />,
    title: "Cartridge Controller",
    description: "Web2-like experience with Cartridge Controller integration — smooth onboarding without wallet complexity.",
  },
  {
    icon: <FiRefreshCw className="w-5 h-5" />,
    title: "Smart Refinancing",
    description: "Refinance incompatible positions with mid-process swaps. Automatically split isolated collateral when migrating between protocols.",
  },
  {
    icon: <FiShield className="w-5 h-5" />,
    title: "Non-Custodial",
    description: "Your assets always stay yours. Kapan routes instructions but never takes ownership — verify on any protocol's frontend.",
  },
  {
    icon: <FiDollarSign className="w-5 h-5" />,
    title: "Zero Protocol Fees",
    description: "No protocol liquidity needed thanks to flash loans. You only pay network gas and any swap fees in the route.",
  },
];

const BuiltForConvenience = () => {
  return (
    <section className="w-full py-16 md:py-20 bg-gradient-to-b from-base-200 to-base-100 dark:from-base-300 dark:to-base-200">
      <div className="container mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-5xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 mb-4"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">Why Kapan</span>
            </motion.div>
            <h2 className="text-3xl md:text-4xl font-bold text-base-content mb-3">
              Built for Convenience
            </h2>
            <p className="text-base-content/60 max-w-lg mx-auto">
              Everything you need for efficient DeFi lending, without the usual friction.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className="group p-5 rounded-xl bg-base-100/60 dark:bg-base-200/40 border border-base-300/40 hover:border-primary/30 hover:bg-base-100 dark:hover:bg-base-200/60 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-content transition-colors duration-200">
                    {feature.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base-content mb-1.5">{feature.title}</h3>
                    <p className="text-sm text-base-content/60 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BuiltForConvenience;
