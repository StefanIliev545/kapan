import React from "react";
import { motion } from "framer-motion";
import { ArrowTopRightOnSquareIcon, DocumentTextIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import Button from "~~/components/common/Button";

const InfoCTAFooter = () => {
  return (
    <section className="py-16 relative">
      <div className="absolute inset-0 bg-base-200/50 -z-10 rounded-t-3xl"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10 max-w-xl mx-auto"
      >
        <h2 className="text-2xl font-bold mb-4">Ready to Optimize Your DeFi Lending?</h2>
        <p className="text-base-content/80">
          Explore Kapan Finance further through our documentation and GitHub repository, or start using our platform today
          to take advantage of atomic debt migration technology.
        </p>
      </motion.div>
      
      <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          whileHover={{ scale: 1.05 }}
          className="w-full max-w-xs"
        >
          <Button
            href="https://github.com/StefanIliev545/kapan"
            target="_blank"
            className="w-full group flex items-center justify-center gap-2"
            variant="primary"
          >
            <CodeBracketIcon className="h-5 w-5 transition-transform group-hover:rotate-12" />
            <span>View on GitHub</span>
            <ArrowTopRightOnSquareIcon className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
          </Button>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          whileHover={{ scale: 1.05 }}
          className="w-full max-w-xs"
        >
          <Button
            href="/docs"
            className="w-full group flex items-center justify-center gap-2"
            variant="outline"
          >
            <DocumentTextIcon className="h-5 w-5 transition-transform group-hover:rotate-12" />
            <span>DeFi Debt Migration Documentation</span>
          </Button>
        </motion.div>
      </div>
      
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="text-center mt-16 text-sm text-base-content/60"
      >
        <p>© {new Date().getFullYear()} Kapan Finance. All rights reserved.</p>
        <p className="mt-1">Built for better DeFi lending & borrowing experiences.</p>
      </motion.div>
    </section>
  );
};

export default InfoCTAFooter; 