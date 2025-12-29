import type { Metadata, NextPage } from "next";
import { StickyLanding } from "../components/home/StickyLanding";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export async function generateMetadata(): Promise<Metadata> {
  return getMetadata({
    title: "Kapan Finance – DeFi Lending Aggregator",
    description: "Optimize DeFi borrowing costs with Kapan Finance by refinancing across protocols for the best rates.",
  });
}

/**
 * Home Page Component - Sticky scroll landing
 */
const Home: NextPage = () => {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Kapan Finance",
    url: "https://kapan.finance",
    logo: "https://kapan.finance/thumbnail.png",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }}
      />
      <StickyLanding />
    </>
  );
};

export default Home;
