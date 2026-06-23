import type { Metadata } from "next";
import Link from "next/link";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { RATES_CHAINS, RATES_TOKENS, SITE_URL } from "~~/utils/rates";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return getMetadata({
    title: "DeFi Lending & Borrowing Rates by Chain and Token",
    description:
      "Compare live supply and borrow rates across Aave, Compound, Morpho and Venus on Arbitrum, Base, Ethereum, Optimism and Linea — then act on them with Kapan.",
    canonicalPath: "/rates",
  });
}

export default function RatesIndexPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Rates", item: `${SITE_URL}/rates` }],
  };
  const jsonLdHtml = { __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml} />

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">DeFi lending &amp; borrowing rates</h1>
      <p className="text-base-content/80 mt-3 leading-relaxed">
        Live supply and borrow rates across Aave, Compound and Venus — compare across chains and tokens, then move your
        position to a cheaper rate in one transaction.
      </p>

      {/* Per-chain hubs */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {RATES_CHAINS.map(chain => (
          <div key={chain.slug} className="card-surface p-4">
            <Link href={`/rates/${chain.slug}`} className="text-base font-semibold hover:underline">
              {chain.label}
            </Link>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {RATES_TOKENS.map(token => (
                <Link
                  key={token.slug}
                  href={`/rates/${chain.slug}/${token.slug}`}
                  className="text-primary hover:underline"
                >
                  {token.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
