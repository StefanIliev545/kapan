import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { BoltIcon, ShieldCheckIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

const StepItem = ({ number, text }: { number: number; text: string }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay: 0.1 * number }}
    className="flex items-center gap-3"
  >
    <div className="bg-gradient-to-r from-primary to-accent p-3 rounded-full w-10 h-10 flex items-center justify-center text-base-100 font-medium">
      {number}
    </div>
    <span className="text-base-content/90">{text}</span>
  </motion.div>
);

const HowItWorksSection = () => {
  return (
    <section className="py-16 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-base-200/50 -z-10 skew-y-3 rounded-3xl transform origin-top-left"></div>
    
      <div className="container mx-auto px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-px w-8 bg-accent"></div>
            <span className="text-accent text-sm font-medium uppercase tracking-wider">Seamless Process</span>
            <div className="h-px w-8 bg-accent"></div>
          </div>
          <h2 className="text-3xl font-bold mb-4">How Web3 Atomic Debt Migration Works</h2>
          <p className="text-base-content/80 max-w-xl mx-auto">
            Our revolutionary process enables borrowers to move debt positions across DeFi protocols 
            without requiring additional capital, all in a single atomic transaction.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="card bg-base-100 shadow-sm overflow-hidden border border-base-300/50"
          >
            <div className="card-body">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <ShieldCheckIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">Cross-Protocol DeFi Integration</h3>
              </div>
            
              <p className="mb-6 text-base-content/80">
                Kapan seamlessly integrates with leading DeFi lending protocols through specialized gateways. 
                Our platform currently supports:
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-base-200 rounded-xl transition-all hover:shadow-md">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-base-300 p-1 flex items-center justify-center">
                    <Image
                      src="/logos/aave.svg"
                      alt="Aave V3 lending protocol"
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-base-content">Aave V3</h4>
                    <p className="text-sm text-base-content/70">Leading DeFi lending protocol</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 bg-base-200 rounded-xl transition-all hover:shadow-md">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-base-300 p-1 flex items-center justify-center">
                    <Image
                      src="/logos/compound.svg"
                      alt="Compound V3 lending protocol"
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-base-content">Compound V3</h4>
                    <p className="text-sm text-base-content/70">Efficient DeFi borrowing platform</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 bg-base-200 rounded-xl transition-all hover:shadow-md">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-base-300 p-1 flex items-center justify-center">
                    <Image
                      src="/logos/venus.svg"
                      alt="Venus Protocol"
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-base-content">Venus Protocol</h4>
                    <p className="text-sm text-base-content/70">BNB Chain&apos;s leading lending platform</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-6 text-sm text-base-content/70 border-t border-base-300 pt-4">
                <ArrowPathIcon className="h-5 w-5 text-accent" />
                <span>Each protocol gateway implements a standardized interface, making it easy to add new DeFi lending platforms in the future.</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="card bg-base-100 shadow-sm overflow-hidden border border-base-300/50"
          >
            <div className="card-body">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <BoltIcon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">Flash Loan-Powered Debt Refinancing</h3>
              </div>
              
              <p className="mb-6 text-base-content/80">
                Our <span className="text-accent font-medium">atomic debt migration</span> technology lets you move loan positions between protocols 
                like <span className="text-primary">Aave</span> and <span className="text-primary">Compound</span> without requiring upfront capital, powered by flash loans:
              </p>
              
              <div className="space-y-4">
                <StepItem number={1} text="Flash loan obtains the required debt repayment amount" />
                <StepItem number={2} text="Existing loan is repaid in the source protocol (e.g., Aave)" />
                <StepItem number={3} text="Collateral is transferred to the target protocol (e.g., Compound)" />
                <StepItem number={4} text="New loan is opened in the target protocol at better rates" />
                <StepItem number={5} text="Flash loan is repaid from the new position" />
              </div>
              
              <div className="flex items-center gap-2 mt-6 text-sm text-base-content/70 border-t border-base-300 pt-4">
                <ArrowPathIcon className="h-5 w-5 text-accent" />
                <span>All steps execute in a single atomic transaction - 100% secure with zero risk of partial execution</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection; 