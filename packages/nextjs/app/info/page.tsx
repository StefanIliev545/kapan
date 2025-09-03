"use client";

import React from "react";
import BenefitsSection from "~~/components/info/BenefitsSection";
import ContractsSection from "~~/components/info/ContractsSection";
import FeaturesSection from "~~/components/info/FeaturesSection";
import Footer from "~~/components/info/Footer";
import Header from "~~/components/info/Header";
import HowItWorksSection from "~~/components/info/HowItWorksSection";
import RevolutionSection from "~~/components/info/RevolutionSection";
import RoadmapSection from "~~/components/info/RoadmapSection";
import AuditSection from "~~/components/info/AuditSection";

const InfoPage = () => {
  return (
    <div className="container mx-auto px-5 py-8">
      <Header />
      <FeaturesSection />
      <HowItWorksSection />
      <BenefitsSection />
      <RoadmapSection />
      <ContractsSection />
      <AuditSection />
      <RevolutionSection />
      <Footer />
    </div>
  );
};

export default InfoPage;
