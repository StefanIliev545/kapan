import type { NextPage } from "next";
import HeroSection from "../components/home/HeroSection";
import HowItWorks from "../components/home/HowItWorks";
import LandingSection from "../components/home/LandingSection";
import ExplainerSection from "../components/home/ExplainerSection";
import BuiltForConvenience from "../components/home/BuiltForConvenience";
import BenefitsSection from "../components/info/BenefitsSection";
import RoadmapSection from "../components/info/RoadmapSection";

/**
 * Home Page Component
 */
const Home: NextPage = () => {
  return (
    <div className="flex-grow">
      {/* Main content */}
      <main className="relative z-10">
        <LandingSection />
        <ExplainerSection />
        <BuiltForConvenience />
        <RoadmapSection />
      </main>
    </div>
  );
};

export default Home;
