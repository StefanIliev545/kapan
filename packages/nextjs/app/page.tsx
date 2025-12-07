import type { Metadata, NextPage } from "next";
import LandingSection from "../components/home/LandingSection";
import EnterAppCTA from "../components/home/EnterAppCTA";
import ExplainerSection from "../components/home/ExplainerSection";
import BuiltForConvenience from "../components/home/BuiltForConvenience";
import RoadmapSection from "../components/info/RoadmapSection";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;

export async function generateMetadata(): Promise<Metadata> {
  return getMetadata({
    title: "Kapan Finance – DeFi Lending Aggregator",
    description: "Optimize DeFi borrowing costs with Kapan Finance by refinancing across protocols for the best rates.",
  });
}

/**
 * Home Page Component
 */
const Home: NextPage = () => {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Kapan Finance",
    url: baseUrl,
    logo: `${baseUrl}/thumbnail.png`,
  };

  return (
    <div className="flex-grow">
      {/* Main content */}
      <main className="relative z-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }}
        />
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
