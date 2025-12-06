import type { Metadata } from "next";
import MarketsPageContent from "./MarketsPageContent";

export const metadata: Metadata = {
  title: "Kapan Markets – Compare DeFi Lending Rates | Kapan Finance",
  description: "Explore DeFi lending and borrowing markets across protocols to find optimal rates with Kapan Finance.",
  alternates: {
    canonical: "https://kapan.finance/markets",
  },
};

const MarketsPage = () => {
  return <MarketsPageContent />;
};

export default MarketsPage;
