import type { NextPage } from "next";
import dynamic from "next/dynamic";
import LandingSection from "../components/home/LandingSection";
import EnterAppCTA from "../components/home/EnterAppCTA";

const ExplainerSection = dynamic(() => import("../components/home/ExplainerSection"), {
  loading: () => <div className="min-h-screen" />,
});
const BuiltForConvenience = dynamic(() => import("../components/home/BuiltForConvenience"), {
  loading: () => <div className="min-h-[50vh]" />,
});
const RoadmapSection = dynamic(() => import("../components/info/RoadmapSection"), {
  loading: () => <div className="min-h-[50vh]" />,
});

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
