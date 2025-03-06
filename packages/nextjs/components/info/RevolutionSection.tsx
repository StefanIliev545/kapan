import React from "react";
import { motion } from "framer-motion";
import { SparklesIcon, ArrowPathIcon, BanknotesIcon, ShieldCheckIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}

const FeatureCard = ({ icon, title, description, delay = 0 }: FeatureCardProps) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className="bg-base-200/70 hover:bg-base-200 transition-all duration-300 rounded-xl p-5 flex flex-col items-center"
  >
    <div className="bg-gradient-to-r from-primary/20 to-accent/20 p-3 rounded-full text-accent mb-4">
      {icon}
    </div>
    <h3 className="text-lg font-medium mb-2 text-center text-base-content">{title}</h3>
    <p className="text-center text-sm text-base-content/80">{description}</p>
  </motion.div>
);

const RevolutionSection = () => {
  const features = [
    {
      icon: <BanknotesIcon className="h-6 w-6" />,
      title: "No Additional Capital Required",
      description: "Move between lending protocols without needing upfront capital to close existing positions"
    },
    {
      icon: <ShieldCheckIcon className="h-6 w-6" />,
      title: "Eliminate Market Exposure Risks",
      description: "Atomic transactions guarantee complete protection during the migration process"
    },
    {
      icon: <ArrowPathIcon className="h-6 w-6" />,
      title: "Save on Gas Fees",
      description: "Single-transaction refinancing minimizes blockchain gas costs compared to manual approaches"
    },
    {
      icon: <ArrowTrendingUpIcon className="h-6 w-6" />,
      title: "Optimize Interest Rates",
      description: "Access the most competitive borrowing rates across the entire DeFi ecosystem"
    },
    {
      icon: <SparklesIcon className="h-6 w-6" />,
      title: "Maintain Collateral Positions",
      description: "Keep your collateral working for you while efficiently moving your debt"
    }
  ];
  
  return (
    <section className="py-16 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 -z-10"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-3xl mx-auto mb-12"
      >
        <span className="text-accent text-sm font-medium uppercase tracking-wider">The Future is Here</span>
        <h2 className="text-3xl font-bold mb-6 mt-2 text-base-content">The Web3 Lending Revolution</h2>
        
        <p className="text-xl mb-6 text-base-content">
          Kapan Finance is at the forefront of the <span className="text-accent font-medium">DeFi lending revolution</span>, 
          making it easier than ever to manage borrowing positions across multiple protocols.
        </p>
        
        <p className="text-base-content/80">
          Our <span className="text-primary font-medium dark:text-accent">atomic debt migration</span> technology eliminates the traditional barriers to refinancing in Web3, 
          allowing you to seamlessly move between lending platforms for optimal rates and terms.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {features.map((feature, index) => (
          <FeatureCard 
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            delay={0.1 * index}
          />
        ))}
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-12 text-center max-w-3xl mx-auto bg-base-100 p-6 rounded-lg shadow-sm border border-base-300/50"
      >
        <p className="text-lg text-base-content">
          Whether you&apos;re looking to move your <span className="text-accent font-medium">Aave debt position</span> to <span className="text-accent font-medium">Compound</span> for 
          better rates, or optimize your borrowing strategy across multiple protocols, Kapan&apos;s atomic debt migration 
          provides a seamless, secure solution for Web3 lending optimization.
        </p>
      </motion.div>
    </section>
  );
};

export default RevolutionSection; 