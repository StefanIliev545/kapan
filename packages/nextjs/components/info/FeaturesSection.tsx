import React from "react";
import { motion } from "framer-motion";
import { BoltIcon, CubeTransparentIcon, ScaleIcon, ShieldCheckIcon, CircleStackIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

const FeatureCard = ({ 
  icon, 
  title, 
  items, 
  highlight, 
  delay = 0 
}: { 
  icon: React.ReactNode; 
  title: string; 
  items: string[]; 
  highlight?: string;
  delay?: number;
}) => {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3 + delay,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="card bg-base-200 hover:bg-base-200/80 transition-colors duration-300 shadow-sm"
    >
      <div className="card-body">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-primary/10 p-3 rounded-full text-primary">
            {icon}
          </div>
          <h3 className="card-title text-lg sm:text-xl">{title}</h3>
        </div>
        
        <motion.ul 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="list-none space-y-3 mt-3"
        >
          {items.map((text, index) => (
            <motion.li 
              key={index} 
              variants={item}
              className="flex items-start gap-2"
            >
              <div className="mt-1 text-accent">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>
                {text.includes(highlight || "") && highlight ? (
                  <span dangerouslySetInnerHTML={{ 
                    __html: text.replace(
                      highlight, 
                      `<strong class="text-accent">${highlight}</strong>`
                    ) 
                  }} />
                ) : text}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </motion.div>
  );
};

const FeaturesSection = () => {
  return (
    <div className="py-10">
      <div className="text-center mb-12">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4">DeFi Lending Optimization Features</h2>
        <div className="w-24 h-1 bg-accent mx-auto rounded-full mb-4"></div>
        <p className="text-base-content/80 max-w-2xl mx-auto">
          Our platform combines cutting-edge DeFi protocols with innovative atomic debt migration 
          technology to deliver an unparalleled lending experience.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <FeatureCard
          icon={<ShieldCheckIcon className="h-6 w-6" />}
          title="Key Features of Web3 Lending Optimization"
          highlight="Flash loan-powered atomic debt migration"
          items={[
            "Single interface for multiple DeFi lending protocols",
            "Non-custodial - your funds remain under your control",
            "Find optimal loan rates across multiple DeFi protocols",
            "Flash loan-powered atomic debt migration",
            "Unified cross-protocol collateral management",
            "Zero additional capital required for loan refinancing"
          ]}
        />

        <FeatureCard
          icon={<CubeTransparentIcon className="h-6 w-6" />}
          title="Supported DeFi Operations"
          highlight="Migrate debt positions between protocols"
          delay={0.2}
          items={[
            "Supply assets as collateral across multiple lending protocols",
            "Borrow against your collateral at optimal rates",
            "Repay existing loans efficiently",
            "Migrate debt positions between protocols in one transaction",
            "Compare lending and borrowing rates across DeFi platforms",
            "Refinance Web3 loans to reduce interest costs"
          ]}
        />
      </div>
    </div>
  );
};

export default FeaturesSection; 