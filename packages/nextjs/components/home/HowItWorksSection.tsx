"use client";

import { motion } from "framer-motion";
import { ArrowPathIcon, BoltIcon, ShieldCheckIcon, Squares2X2Icon } from "@heroicons/react/24/outline";

const steps = [
  {
    title: "Connect once",
    description: "Link your Starknet or EVM wallet and Kapan automatically detects supported accounts across every chain.",
    icon: Squares2X2Icon,
  },
  {
    title: "Choose a strategy",
    description: "Browse best rates, bundles and refinance paths from Arbitrum, Base, Optimism, Starknet and more.",
    icon: ArrowPathIcon,
  },
  {
    title: "Execute in one click",
    description: "Smart routing batches swaps, lending actions and repayments so you never re-enter a transaction manually.",
    icon: BoltIcon,
  },
  {
    title: "Stay protected",
    description: "Non-custodial middleware + audit-backed automation means assets always settle on the underlying protocol.",
    icon: ShieldCheckIcon,
  },
];

const HowItWorksSection = () => {
  return (
    <section className="w-full py-12 md:py-20 bg-base-100 dark:bg-base-200">
      <div className="container mx-auto px-5">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <p className="text-sm uppercase tracking-[0.5em] text-base-content/60">How it works</p>
          <h2 className="text-3xl md:text-4xl font-semibold text-base-content mt-3">From idea to execution in a few taps</h2>
          <p className="mt-4 text-base text-base-content/70">
            Every workflow in Kapan follows the same pattern: connect, compose, confirm. No chain switching or manual math
            required.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {steps.map(({ title, description, icon: Icon }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="h-full rounded-2xl border border-base-content/10 bg-base-100/70 dark:bg-base-300/40 p-6 shadow-lg shadow-black/5"
            >
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center text-primary mb-4">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-base-content">{title}</h3>
              <p className="mt-2 text-base text-base-content/70">{description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
