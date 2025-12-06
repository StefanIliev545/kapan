import type { Metadata } from "next";
import InfoPageContent from "./InfoPageContent";

export const metadata: Metadata = {
  title: "Kapan Info – DeFi Lending Aggregator Overview | Kapan Finance",
  description:
    "Learn how Kapan Finance optimizes DeFi lending with atomic debt migration, automation, and cross-protocol refinancing tools.",
  alternates: {
    canonical: "https://kapan.finance/info",
  },
};

const InfoPage = () => {
  return <InfoPageContent />;
};

export default InfoPage;
