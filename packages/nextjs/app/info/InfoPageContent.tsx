"use client";

import React from "react";
import BenefitsSection from "~~/components/info/BenefitsSection";
import ContractsSection from "~~/components/info/ContractsSection";
import FeaturesSection from "~~/components/info/FeaturesSection";
import InfoCTAFooter from "~~/components/info/InfoCTAFooter";
import Header from "~~/components/info/Header";
import HowItWorksSection from "~~/components/info/HowItWorksSection";
import RevolutionSection from "~~/components/info/RevolutionSection";
import RoadmapSection from "~~/components/info/RoadmapSection";
import AuditSection from "~~/components/info/AuditSection";
import KeyFeaturesSection from "~~/components/info/KeyFeaturesSection";

type FAQItem = {
  question: string;
  answer: string;
};

const InfoPageContent = ({ faqItems }: { faqItems: FAQItem[] }) => {
  return (
    <div className="container mx-auto px-5 py-8">
      <Header />
      <KeyFeaturesSection />
      <FeaturesSection />
      <HowItWorksSection />
      <BenefitsSection />
      <section className="my-16" aria-labelledby="faq-heading">
        <div className="text-center mb-8">
          <p className="text-accent font-semibold tracking-wide uppercase">FAQs</p>
          <h2 id="faq-heading" className="text-3xl font-bold text-base-content">
            Frequently Asked Questions
          </h2>
          <p className="text-base-content/80 mt-2">
            Answers to common questions about how Kapan optimizes and protects your DeFi positions.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {faqItems.map(item => (
            <div key={item.question} className="p-6 rounded-xl border border-base-300 bg-base-200/60 dark:bg-base-300/20">
              <h3 className="text-xl font-semibold text-base-content mb-3">{item.question}</h3>
              <p className="text-base-content/80 leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <RoadmapSection />
      <ContractsSection />
      <AuditSection />
      <RevolutionSection />
      <InfoCTAFooter />
    </div>
  );
};

export default InfoPageContent;
