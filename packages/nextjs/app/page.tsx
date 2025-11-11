import type { NextPage } from "next";
import LandingSection from "../components/home/LandingSection";
import EnterAppCTA from "../components/home/EnterAppCTA";
import ExplainerSection from "../components/home/ExplainerSection";
import BuiltForConvenience from "../components/home/BuiltForConvenience";
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
        <EnterAppCTA />
        <ExplainerSection />
        <BuiltForConvenience />
        <RoadmapSection />
      </main>
    </div>
  );
};

export default Home;
