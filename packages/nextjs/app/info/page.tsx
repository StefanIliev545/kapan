import type { Metadata } from "next";
import InfoPageContent from "./InfoPageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const faqItems = [
  {
    question: "What can I do with my positions?",
    answer:
      "Refinance debt, increase leverage, repay with collateral, or swap collateral and debt. Available actions depend on your protocol, chain, assets and liquidity. Refinancing moves supported positions between markets on the same chain.",
  },
  {
    question: "How does execution work?",
    answer:
      "Kapan bundles the steps of a supported action into an atomic transaction: execution succeeds together or reverts. Flash loans can provide temporary funds for the move. Token approvals and protocol permissions may need separate wallet confirmations before execution.",
  },
  {
    question: "What can I automate?",
    answer:
      "Set recurring leverage or deleverage with your own loan-to-value (LTV) triggers and targets. You can also place price-based conditional orders for collateral or debt swaps, closing, and increasing leverage where supported. Availability and execution depend on the market, chain and order conditions.",
  },
  {
    question: "What does it cost?",
    answer:
      "Kapan charges no service fee. Network gas, swap costs and any flash-loan fees still apply. Review the available route and its costs before signing.",
  },
  {
    question: "Who controls my positions?",
    answer:
      "Your positions remain in the underlying lending protocols, under your wallet or protocol account. You grant permissions for Kapan to act. The linked CODESPECT audit covers the Starknet contracts specified in its report, not every chain or current deployment; protocol and liquidation risks remain.",
  },
];

// Static FAQ schema and HTML - extracted outside component to avoid recreating on each render
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map(item => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};
const faqSchemaHtml = { __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") };

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...getMetadata({
      title: "About Kapan",
      description:
        "Manage DeFi lending positions with refinancing, collateral and debt swaps, recurring LTV automation, and conditional orders on supported protocols and chains.",
    }),
    alternates: {
      canonical: "/info",
    },
  };
}

const InfoPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={faqSchemaHtml}
      />
      <InfoPageContent faqItems={faqItems} />
    </>
  );
};

export default InfoPage;
