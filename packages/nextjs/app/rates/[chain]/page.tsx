import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { canonicalizeTokenName } from "~~/utils/tokenSymbols";
import {
  CHAIN_LABELS,
  RATES_CHAINS,
  RATES_TOKENS,
  SITE_URL,
  SLUG_TO_CHAIN_ID,
  fmtPct,
  isValidChainSlug,
} from "~~/utils/rates";
import { getChainRates } from "~~/utils/server/protocolRates.server";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return RATES_CHAINS.map(c => ({ chain: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string }>;
}): Promise<Metadata> {
  const { chain } = await params;
  if (!isValidChainSlug(chain)) {
    return getMetadata({ title: "Lending Rates", description: "Compare DeFi lending and borrowing rates." });
  }
  const chainLabel = CHAIN_LABELS[chain] ?? chain;
  return getMetadata({
    title: `${chainLabel} Lending & Borrowing Rates`,
    description: `Compare live supply and borrow rates across Aave, Compound and Venus on ${chainLabel}, by token. Then act on them with Kapan.`,
    canonicalPath: `/rates/${chain}`,
  });
}

export default async function ChainRatesPage({
  params,
}: {
  params: Promise<{ chain: string }>;
}) {
  const { chain } = await params;
  if (!isValidChainSlug(chain)) notFound();

  const chainLabel = CHAIN_LABELS[chain] ?? chain;
  const rows = await getChainRates(SLUG_TO_CHAIN_ID[chain]);
  if (!rows.length) notFound();

  // Only link to tokens that actually have data on this chain (no links to 404s).
  const present = new Set(rows.filter(r => r.symbol).map(r => canonicalizeTokenName(r.symbol).toLowerCase()));
  const tokens = RATES_TOKENS.filter(t => present.has(t.slug));

  // Best borrow per token, for a useful at-a-glance hub.
  const bestBorrowFor = (slug: string) => {
    const borrowable = rows.filter(
      r => r.symbol && canonicalizeTokenName(r.symbol).toLowerCase() === slug && r.borrowApy > 0,
    );
    return borrowable.length ? Math.min(...borrowable.map(r => r.borrowApy)) : undefined;
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Rates", item: `${SITE_URL}/rates` },
      { "@type": "ListItem", position: 2, name: chainLabel, item: `${SITE_URL}/rates/${chain}` },
    ],
  };
  const jsonLdHtml = { __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml} />

      <nav className="text-base-content/60 mb-6 text-xs" aria-label="Breadcrumb">
        <Link href="/rates" className="hover:text-base-content transition-colors">Rates</Link>
        <span className="px-1.5">/</span>
        <span className="text-base-content/80">{chainLabel}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{chainLabel} lending &amp; borrowing rates</h1>
      <p className="text-base-content/80 mt-3 leading-relaxed">
        Compare {chainLabel} supply and borrow rates across Aave, Compound and Venus, by token.
      </p>

      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {tokens.map(token => {
          const best = bestBorrowFor(token.slug);
          return (
            <Link
              key={token.slug}
              href={`/rates/${chain}/${token.slug}`}
              className="card-surface hover:bg-base-200/60 flex items-center justify-between px-4 py-3 transition-colors"
            >
              <span className="font-medium">{token.label}</span>
              {best !== undefined && (
                <span className="text-base-content/60 text-sm">
                  borrow from <span className="text-success font-mono">{fmtPct(best)}</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
