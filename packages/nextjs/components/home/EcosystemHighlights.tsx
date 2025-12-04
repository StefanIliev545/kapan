"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const ecosystems = [
  { name: "Arbitrum", caption: "Deep liquidity markets", logo: "/logos/arb.svg" },
  { name: "Base", caption: "Low fees, L2 native", logo: "/logos/base.svg" },
  { name: "Optimism", caption: "Sequencer fast finality", logo: "/logos/optimism.svg" },
  { name: "Starknet", caption: "Account abstraction ready", logo: "/logos/starknet.svg" },
  { name: "Aave", caption: "Battle tested collateral", logo: "/logos/aave.svg" },
  { name: "Vesu", caption: "Native Starknet lending", logo: "/logos/vesu.svg" },
];

const EcosystemHighlights = () => {
  return (
    <section className="w-full py-12 md:py-16 bg-gradient-to-b from-base-200 to-base-100 dark:from-base-300 dark:to-base-200">
      <div className="container mx-auto px-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div>
            <p className="text-sm uppercase tracking-[0.5em] text-base-content/60">Ecosystem ready</p>
            <h2 className="text-3xl font-semibold text-base-content mt-3">
              Highlighted chains & partners
            </h2>
            <p className="text-base text-base-content/70 mt-3 max-w-2xl">
              Kapan routes liquidity to the environments where users already are. Each integration brings its own execution
              advantages—speed, deep books or smart account UX.
            </p>
          </div>
          <div className="text-base-content/70 text-sm">
            New partners are added frequently. Want to collaborate? Reach out via <a className="link" href="mailto:gm@kapan.finance">gm@kapan.finance</a>.
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ecosystems.map(({ name, caption, logo }) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-base-content/10 bg-base-100/80 dark:bg-base-300/50 p-5 flex items-center gap-4"
            >
              <div className="h-12 w-12 rounded-xl bg-base-200 dark:bg-base-100 flex items-center justify-center">
                <Image src={logo} alt={name} width={32} height={32} />
              </div>
              <div>
                <p className="text-lg font-semibold text-base-content">{name}</p>
                <p className="text-sm text-base-content/70">{caption}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EcosystemHighlights;
