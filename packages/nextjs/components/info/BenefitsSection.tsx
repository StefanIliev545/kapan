import React from "react";
import { motion } from "framer-motion";
import { ChartBarIcon, CurrencyDollarIcon } from "@heroicons/react/24/outline";

interface BenefitItemProps {
  text: string;
  index: number;
}

const BenefitItem = ({ text, index }: BenefitItemProps) => {
  const [title, description] = text.split(" by ");
  
  return (
    <motion.li 
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 * index, duration: 0.4 }}
      className="flex gap-3 items-start"
    >
      <div className="min-w-6 mt-1">
        <div className="w-3 h-3 bg-accent rounded-full"></div>
      </div>
      <div>
        <span className="font-semibold text-base-content">{title}</span>
        {description && (
          <> by <span className="text-base-content/80">{description}</span></>
        )}
      </div>
    </motion.li>
  );
};

const BenefitsSection = () => {
  const financialBenefits = [
    "Lower interest rates by moving debt to the most competitive protocol",
    "Zero additional capital required for refinancing existing loans",
    "Reduced gas costs compared to manual migration methods",
    "Improved capital efficiency across your DeFi lending portfolio",
    "No liquidation risk during the migration process"
  ];

  const technicalBenefits = [
    "Atomic execution guarantees complete success or full reversion",
    "Smart contract orchestration coordinates complex multi-step processes",
    "Cross-protocol compatibility between major lending platforms",
    "Balancer flash loan integration for efficient capital sourcing",
    "Automated rate optimization identifies the best lending terms"
  ];
  
  return (
    <section className="py-16">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-px w-8 bg-accent"></div>
          <span className="text-accent text-sm font-medium uppercase tracking-wider">Advantages</span>
          <div className="h-px w-8 bg-accent"></div>
        </div>
        <h2 className="text-3xl font-bold mb-4">Benefits of Web3 Loan Refinancing</h2>
        <p className="text-base-content/80 max-w-xl mx-auto">
          Our atomic debt migration technology offers significant advantages over traditional
          DeFi lending approaches, saving you time, money, and complexity.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="card bg-base-100 shadow-sm overflow-hidden border border-base-300/50"
        >
          <div className="card-body">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-full bg-gradient-to-br from-accent/20 to-primary/10 text-accent">
                <CurrencyDollarIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold">Financial Advantages</h3>
            </div>
            
            <ul className="space-y-4">
              {financialBenefits.map((benefit, index) => (
                <BenefitItem key={index} text={benefit} index={index} />
              ))}
            </ul>
            
            <div className="mt-6 pt-4 border-t border-base-300">
              <div className="bg-primary/5 p-3 rounded-lg text-sm text-base-content/80">
                <strong className="text-accent">Pro tip:</strong> Use our rate comparison tool to identify the best protocol for your specific asset pair before migrating your debt position.
              </div>
            </div>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card bg-base-100 shadow-sm overflow-hidden border border-base-300/50"
        >
          <div className="card-body">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-full bg-gradient-to-br from-accent/20 to-primary/10 text-accent">
                <ChartBarIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold">Technical Innovations</h3>
            </div>
            
            <ul className="space-y-4">
              {technicalBenefits.map((benefit, index) => (
                <BenefitItem key={index} text={benefit} index={index} />
              ))}
            </ul>
            
            <div className="mt-6 pt-4 border-t border-base-300">
              <div className="bg-primary/5 p-3 rounded-lg text-sm text-base-content/80">
                <strong className="text-accent">Security:</strong> Our smart contracts are thoroughly tested and utilize battle-tested flash loan providers.
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BenefitsSection; 