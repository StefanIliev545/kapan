import type { NextPage } from "next";
import HeroSection from "../components/home/HeroSection";
import HowItWorks from "../components/home/HowItWorks";
import ProtocolStats from "../components/home/ProtocolStats";
import TransactionFeed from "../components/TransactionFeed.client";
import BenefitsSection from "../components/info/BenefitsSection";
import RoadmapSection from "../components/info/RoadmapSection";

/**
 * Home Page Component
 */
const Home: NextPage = () => {
  return (
    <div className="flex-grow">
      {/* Background transaction feed */}
      <TransactionFeed />

      {/* Main content */}
      <main className="relative z-10">
        {/* Hero section */}
        <HeroSection />

        {/* How it works */}
        <HowItWorks />

        {/* Protocol stats */}
        <ProtocolStats />

        {/* Benefits and roadmap */}
        <BenefitsSection />
        <RoadmapSection />
      </main>
    </div>
  );
};

export default Home;
