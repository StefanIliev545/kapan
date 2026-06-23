import type { Metadata, NextPage } from "next";
import { StickyLanding } from "../components/home/StickyLanding";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export async function generateMetadata(): Promise<Metadata> {
  return getMetadata({
    title: "Kapan Finance — Manage Your DeFi Positions",
    description:
      "See all your DeFi lending and borrowing positions across Aave, Compound, Morpho, and Venus in one place — compare rates across protocols and chains, and act on them without leaving the page.",
  });
}

// Static structured data - extracted outside component to avoid recreating on each render.
// Organization + WebApplication so search/answer engines understand what Kapan is and does.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://kapan.finance/#organization",
      name: "Kapan Finance",
      url: "https://kapan.finance",
      logo: "https://kapan.finance/thumbnail.png",
    },
    {
      "@type": "WebApplication",
      name: "Kapan Finance",
      url: "https://kapan.finance",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description:
        "View, compare, and manage DeFi lending and borrowing positions across Aave, Compound, Morpho, and Venus on Arbitrum, Base, Ethereum and more.",
      publisher: { "@id": "https://kapan.finance/#organization" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};
const organizationSchemaHtml = { __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") };

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
