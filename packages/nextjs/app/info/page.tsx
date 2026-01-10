import type { Metadata } from "next";
import InfoPageContent from "./InfoPageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const faqItems = [
  {
    question: "How does it work?",
    answer:
      "Flash loans + atomic execution. Bundle any operation—deposit, borrow, swap, refinance—into one transaction. Succeeds completely or reverts entirely. No extra capital required.",
  },
  {
    question: "Is it safe?",
    answer:
      "Fully non-custodial. Our contracts don't hold positions—yours do. Every action shows up on the underlying protocol under your address. Check Aave, check Morpho, check the block explorer. It's all you. We're just the remote control.",
  },
  {
    question: "What does it cost?",
    answer:
      "Zero protocol fees. You pay gas and swap fees. We auto-select the cheapest flash loan source and route swaps through the lowest slippage provider. You get the best execution. We get nothing.",
  },
  {
    question: "Why use Kapan?",
    answer:
      "One transaction for everything. No extra capital needed. No exposure during migrations. Atomic execution—all or nothing. Best rates auto-selected. Just works.",
  },
  {
    question: "What can I do?",
    answer:
      "Refinance debt to better rates. Loop positions for leverage. Swap collateral without closing. Move entire positions across protocols. All in one click.",
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
        "Learn how Kapan Finance optimizes DeFi lending with atomic debt migration, automation, and cross-protocol refinancing tools.",
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
