import type { Metadata } from "next";
import AutomatePageContent from "./AutomatePageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...getMetadata({
      title: "Automate",
      description:
        "Automate DeFi lending strategies with Kapan Finance. Move debt between protocols, rebalance collateral, and stay protected from liquidations.",
    }),
    alternates: {
      canonical: "https://kapan.finance/automate",
    },
  };
}

const AutomatePage = () => {
  return <AutomatePageContent />;
};

export default AutomatePage;
