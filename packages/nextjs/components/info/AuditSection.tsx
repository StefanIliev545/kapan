import React from "react";
import { motion } from "framer-motion";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import Button from "~~/components/common/Button";

const AuditSection = () => {
  return (
    <section className="py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <ShieldCheckIcon className="w-5 h-5 text-accent" />
          <h2 className="text-3xl font-bold">Security Audit</h2>
        </div>
        <div className="w-24 h-1 bg-accent mx-auto rounded-full mb-4"></div>
        <p className="text-base-content/80 max-w-2xl mx-auto mb-6">
          Our protocol has undergone a comprehensive review by Codespect.
        </p>
        <Button
          href="/audits/022_CODESPECT_KAPAN_FINANCE.pdf"
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
        >
          View Audit Report
        </Button>
      </motion.div>
    </section>
  );
};

export default AuditSection;
