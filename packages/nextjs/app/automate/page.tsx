import type { Metadata } from "next";
import AutomatePageContent from "./AutomatePageContent";

export const metadata: Metadata = {
  title: "Kapan Automate – DeFi Loan Automation | Kapan Finance",
  description:
    "Automate DeFi lending strategies with Kapan Finance. Move debt between protocols, rebalance collateral, and stay protected from liquidations.",
  alternates: {
    canonical: "https://kapan.finance/automate",
  },
};

const AutomatePage = () => {
  return <AutomatePageContent />;
};

export default AutomatePage;
