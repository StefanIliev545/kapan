import type { Metadata } from "next";
import InfoPageContent from "./InfoPageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const faqItems = [
  {
    question: "How does Kapan optimize DeFi lending rates?",
    answer:
      "Kapan continuously monitors multiple lending protocols and automates refinancing so your debt moves to the lowest available rate without manual intervention.",
  },
  {
    question: "Is Kapan Finance non-custodial?",
    answer:
      "Yes. You stay in control of your assets via smart contracts, and Kapan only automates interactions across supported protocols.",
  },
  {
    question: "Which networks and protocols are supported?",
    answer:
      "Kapan integrates leading protocols like Aave, Compound, Vesu, and Nostra across multiple networks, with new markets added regularly.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...getMetadata({
      title: "About Kapan",
      description:
        "Learn how Kapan Finance optimizes DeFi lending with atomic debt migration, automation, and cross-protocol refinancing tools.",
    }),
    alternates: {
      canonical: "https://kapan.finance/info",
    },
  };
}

const InfoPage = () => {
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }}
      />
      <InfoPageContent faqItems={faqItems} />
    </>
  );
};

export default InfoPage;
