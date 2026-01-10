import type { Metadata, NextPage } from "next";
import { StickyLanding } from "../components/home/StickyLanding";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export async function generateMetadata(): Promise<Metadata> {
  return getMetadata({
    title: "Kapan Finance – DeFi Lending Aggregator",
    description: "Optimize DeFi borrowing costs with Kapan Finance by refinancing across protocols for the best rates.",
  });
}

// Static organization schema and HTML - extracted outside component to avoid recreating on each render
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Kapan Finance",
  url: "https://kapan.finance",
  logo: "https://kapan.finance/thumbnail.png",
};
const organizationSchemaHtml = { __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") };

/**
 * Home Page Component - Sticky scroll landing
 */
const Home: NextPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={organizationSchemaHtml}
      />
      <StickyLanding />
    </>
  );
};

export default Home;
