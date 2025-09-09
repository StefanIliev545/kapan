import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";

const Header = () => {
  return (
    <div className="relative mb-16">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-base-200 to-base-300 dark:from-accent/5 dark:via-base-300/20 dark:to-base-300/30 rounded-xl -z-10" />
      
      {/* Content */}
      <div className="relative py-12 px-6 md:px-10 rounded-xl overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 dark:bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-accent/5 dark:bg-accent/10 rounded-full translate-y-1/2 -translate-x-1/4" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-1 w-12 bg-accent"></div>
            <h3 className="text-sm md:text-base uppercase tracking-wider text-accent font-semibold">Web3 Finance Platform</h3>
            <div className="h-1 w-12 bg-accent"></div>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-6 bg-gradient-to-r from-primary via-accent to-primary dark:from-accent dark:via-accent/80 dark:to-accent bg-clip-text text-transparent">
            Kapan Finance: Lending Aggregator
          </h1>
          
          <div className="flex justify-center mb-8">
            <div className="h-1 w-24 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>
          
          <div className="prose prose-lg max-w-none dark:prose-invert">
            <p className="text-xl text-center mb-8 text-base-content">
              Kapan is a decentralized lending aggregator enabling seamless interaction with multiple lending protocols
              through a single interface. Our revolutionary <strong className="text-accent">atomic debt migration</strong> technology
              allows borrowers to efficiently move loans between protocols like <strong className="text-primary dark:text-accent">Vesu</strong>, <strong className="text-primary dark:text-accent">Nostra</strong>, <strong className="text-primary dark:text-accent">Aave</strong>, and <strong className="text-primary dark:text-accent">Compound</strong> to
              optimize interest rates and improve capital efficiency.
            </p>

            <div className="flex flex-wrap justify-center gap-6 mt-8">
              <div className="flex items-center gap-2 bg-base-300/50 dark:bg-base-300/30 px-4 py-2 rounded-lg">
                <Image src="/logos/vesu.svg" alt="Vesu Protocol" width={24} height={24} className="rounded-full" />
                <span className="font-medium text-base-content">Vesu Support</span>
              </div>
              <div className="flex items-center gap-2 bg-base-300/50 dark:bg-base-300/30 px-4 py-2 rounded-lg">
                <Image src="/logos/nostra.svg" alt="Nostra Protocol" width={24} height={24} className="rounded-full" />
                <span className="font-medium text-base-content">Nostra Support</span>
              </div>
              <div className="flex items-center gap-2 bg-base-300/50 dark:bg-base-300/30 px-4 py-2 rounded-lg">
                <Image src="/logos/aave.svg" alt="Aave Protocol" width={24} height={24} className="rounded-full" />
                <span className="font-medium text-base-content">Aave Support</span>
              </div>
              <div className="flex items-center gap-2 bg-base-300/50 dark:bg-base-300/30 px-4 py-2 rounded-lg">
                <Image src="/logos/compound.svg" alt="Compound Protocol" width={24} height={24} className="rounded-full" />
                <span className="font-medium text-base-content">Compound Support</span>
              </div>
              <div className="flex items-center gap-2 bg-base-300/50 dark:bg-base-300/30 px-4 py-2 rounded-lg">
                <Image src="/logos/balancer.svg" alt="Balancer Protocol" width={24} height={24} className="rounded-full" />
                <span className="font-medium text-base-content">Flash Loans</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Header; 