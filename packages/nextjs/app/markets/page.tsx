import type { Metadata } from "next";
import MarketsPageContent from "./MarketsPageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...getMetadata({
      title: "Markets",
      description: "Compare DeFi lending and borrowing rates across protocols and networks in real time.",
    }),
    alternates: {
      canonical: "/markets",
    },
  };
}

const MarketsPage = () => {
  return <MarketsPageContent />;
};

export default MarketsPage;
