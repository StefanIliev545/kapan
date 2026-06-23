import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { TrustStrip } from "~~/components/common/TrustStrip";
import {
  CHAIN_LABELS,
  PROTOCOL_LABELS,
  RATES_CHAINS,
  RATES_TOKENS,
  SITE_URL,
  SLUG_TO_CHAIN_ID,
  fmtPct,
  isValidChainSlug,
  isValidTokenSlug,
  tokenLabel,
} from "~~/utils/rates";
import { getTokenRates, type ProtocolRateRow } from "~~/utils/server/protocolRates.server";

// Server-rendered with ISR. Prebuild a curated set; the rest render on first request.
export const revalidate = 300;
export const dynamicParams = true;

/** Best supply = highest APY; best borrow = lowest APR among borrowable rows. */
function summarize(rows: ProtocolRateRow[]) {
  const supplyRows = rows.filter(r => r.supplyApy > 0);
  const borrowRows = rows.filter(r => r.borrowApy > 0);
  return {
    bestSupply: supplyRows.length ? supplyRows.reduce((a, b) => (b.supplyApy > a.supplyApy ? b : a)) : undefined,
    bestBorrow: borrowRows.length ? borrowRows.reduce((a, b) => (b.borrowApy < a.borrowApy ? b : a)) : undefined,
  };
}

export function generateStaticParams() {
  // Curated PoC set; everything else renders on demand via dynamicParams + ISR.
  const chains = ["arbitrum", "base", "ethereum"];
  const tokens = ["usdc", "eth", "wbtc"];
  return chains.flatMap(chain => tokens.map(token => ({ chain, token })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string; token: string }>;
}): Promise<Metadata> {
  const { chain, token } = await params;
  if (!isValidChainSlug(chain) || !isValidTokenSlug(token)) {
    return getMetadata({ title: "Lending Rates", description: "Compare DeFi lending and borrowing rates." });
  }
  const chainLabel = CHAIN_LABELS[chain] ?? chain;
  const sym = tokenLabel(token);
  const { bestSupply, bestBorrow } = summarize(await getTokenRates(SLUG_TO_CHAIN_ID[chain], token));

  const title = `${sym} Lending & Borrowing Rates on ${chainLabel}`;
  const numbers = bestBorrow
    ? ` Borrow ${sym} from ${fmtPct(bestBorrow.borrowApy)} APR${bestSupply ? `, or supply for up to ${fmtPct(bestSupply.supplyApy)} APY` : ""}.`
    : "";
  return getMetadata({
    title,
    description: `Compare ${sym} supply and borrow rates across Aave, Compound and Venus on ${chainLabel}.${numbers} Then act on it with Kapan.`,
    canonicalPath: `/rates/${chain}/${token}`,
  });
}

export default async function RatesPage({
  params,
}: {
  params: Promise<{ chain: string; token: string }>;
}) {
  const { chain, token } = await params;
  // Validate against the allowlist so arbitrary slugs 404 immediately (no wasted RPC fan-out).
  if (!isValidChainSlug(chain) || !isValidTokenSlug(token)) notFound();

  const chainId = SLUG_TO_CHAIN_ID[chain];
  const chainLabel = CHAIN_LABELS[chain] ?? chain;
  const sym = tokenLabel(token);
  const rows = await getTokenRates(chainId, token);
  // Real 404 for tokens not available on this chain — avoids thin/soft-404 pages.
  if (!rows.length) notFound();

  const { bestSupply, bestBorrow } = summarize(rows);
  const sorted = [...rows].sort((a, b) => b.supplyApy - a.supplyApy);
  const icon = tokenNameToLogo(sym);

  // Carry the chain into the app so the CTA doesn't dump the visitor on the app's default chain.
  const appHref = `/app?network=${chain}`;
  // Rate spread = the actual product value. Only surfaced when there's a genuine, >0 gap.
  const borrowable = rows.filter(r => r.borrowApy > 0);
  const maxBorrow = borrowable.length ? Math.max(...borrowable.map(r => r.borrowApy)) : undefined;
  const borrowSpread = bestBorrow && maxBorrow !== undefined ? maxBorrow - bestBorrow.borrowApy : 0;
  const showSpread = borrowable.length >= 2 && borrowSpread > 0.01;

  const siblingTokens = RATES_TOKENS.filter(t => t.slug !== token);
  const siblingChains = RATES_CHAINS.filter(c => c.slug !== chain);

  const faq = [
    {
      q: `What is the cheapest place to borrow ${sym} on ${chainLabel}?`,
      a: bestBorrow
        ? `${PROTOCOL_LABELS[bestBorrow.protocol]} currently has the lowest ${sym} borrow rate on ${chainLabel} at ${fmtPct(bestBorrow.borrowApy)} APR. Rates update continuously.`
        : `No active ${sym} borrow market was found on ${chainLabel}.`,
    },
    {
      q: `What is the best ${sym} supply rate on ${chainLabel}?`,
      a: bestSupply
        ? `${PROTOCOL_LABELS[bestSupply.protocol]} currently offers the highest ${sym} supply rate on ${chainLabel} at ${fmtPct(bestSupply.supplyApy)} APY.`
        : `No active ${sym} supply market was found on ${chainLabel}.`,
    },
    {
      q: `Can I move my ${sym} position to a cheaper rate?`,
      a: `Yes. Kapan lets you move a ${sym} position to a cheaper market in a single transaction — non-custodially, without unwinding it first.`,
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Rates", item: `${SITE_URL}/rates` },
          { "@type": "ListItem", position: 2, name: chainLabel, item: `${SITE_URL}/rates/${chain}` },
          { "@type": "ListItem", position: 3, name: sym, item: `${SITE_URL}/rates/${chain}/${token}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  const jsonLdHtml = { __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml} />

      {/* Breadcrumb */}
      <nav className="text-base-content/60 mb-6 text-xs" aria-label="Breadcrumb">
        <Link href="/rates" className="hover:text-base-content transition-colors">Rates</Link>
        <span className="px-1.5">/</span>
        <Link href={`/rates/${chain}`} className="hover:text-base-content transition-colors">{chainLabel}</Link>
        <span className="px-1.5">/</span>
        <span className="text-base-content/80">{sym}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt={`${sym} logo`} width={36} height={36} className="size-9 rounded-full" />
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {sym} lending &amp; borrowing rates on {chainLabel}
        </h1>
      </div>

      {/* Answer block — concise, machine-extractable for answer engines */}
      <p className="text-base-content/80 mb-3 leading-relaxed">
        {bestBorrow ? (
          <>
            The cheapest place to borrow <strong>{sym}</strong> on {chainLabel} right now is{" "}
            <strong>{PROTOCOL_LABELS[bestBorrow.protocol]}</strong> at{" "}
            <strong className="text-success">{fmtPct(bestBorrow.borrowApy)} APR</strong>.
          </>
        ) : (
          <>No active {sym} borrow market on {chainLabel}.</>
        )}{" "}
        {bestSupply && (
          <>
            The best supply rate is <strong>{PROTOCOL_LABELS[bestSupply.protocol]}</strong> at{" "}
            <strong className="text-success">{fmtPct(bestSupply.supplyApy)} APY</strong>.
          </>
        )}
      </p>

      {/* Rate-spread hook — the actual product value (only when there's a real gap) */}
      {showSpread && (
        <p className="text-base-content/70 mb-6 text-sm leading-relaxed">
          That&apos;s a <strong className="text-base-content">{fmtPct(borrowSpread)}</strong> gap between the cheapest
          and priciest {sym} market here — Kapan moves a whole position to the cheaper one in a single transaction, no
          unwinding. <span className="text-base-content/50">Rates shown are current and variable.</span>
        </p>
      )}

      {/* Single, outcome-led CTA — one obvious next step, framed as the benefit */}
      <div className="mb-6">
        {bestBorrow ? (
          <Link
            href={appHref}
            className="bg-primary text-primary-content inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            See if you can borrow {sym} cheaper →
          </Link>
        ) : bestSupply ? (
          <Link
            href={appHref}
            className="bg-primary text-primary-content inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Supply {sym} on Kapan →
          </Link>
        ) : null}
        {bestBorrow && bestSupply && (
          <p className="text-base-content/60 mt-3 text-sm">
            Or compare {sym} supply rates —{" "}
            <Link href={appHref} className="text-primary hover:underline">open Kapan</Link>.
          </p>
        )}
      </div>

      {/* Trust signals at the decision point */}
      <TrustStrip className="mb-10 justify-start" />

      {/* Rate table (evidence — no per-row actions) */}
      <div className="card-surface overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="market-th px-4">Protocol</th>
              <th scope="col" className="market-th px-4 text-right">Supply APY</th>
              <th scope="col" className="market-th px-4 text-right">Borrow APR</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={`${row.protocol}-${row.tokenAddress}`} className="market-row">
                <td className="market-td px-4 font-medium">{PROTOCOL_LABELS[row.protocol]}</td>
                <td className="market-td px-4 text-right font-mono tabular-nums">
                  {row.supplyApy > 0 ? fmtPct(row.supplyApy) : "—"}
                </td>
                <td className="market-td px-4 text-right font-mono tabular-nums">
                  {row.borrowApy > 0 ? fmtPct(row.borrowApy) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Frequently asked</h2>
        <div className="space-y-4">
          {faq.map(({ q, a }) => (
            <div key={q}>
              <h3 className="text-base-content/90 text-sm font-semibold">{q}</h3>
              <p className="text-base-content/70 mt-1 text-sm leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Internal links — the crawl graph that makes the long tail discoverable */}
      <nav className="border-base-300/50 mt-12 space-y-4 border-t pt-6 text-sm" aria-label="Related rate pages">
        <div>
          <span className="text-base-content/60">{sym} on other chains: </span>
          {siblingChains.map(c => (
            <Link key={c.slug} href={`/rates/${c.slug}/${token}`} className="text-primary mr-3 hover:underline">
              {c.label}
            </Link>
          ))}
        </div>
        <div>
          <span className="text-base-content/60">Other tokens on {chainLabel}: </span>
          {siblingTokens.map(t => (
            <Link key={t.slug} href={`/rates/${chain}/${t.slug}`} className="text-primary mr-3 hover:underline">
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <p className="text-base-content/50 mt-10 text-xs">
        Live on-chain rates, refreshed continuously. Not financial advice. Always verify on the protocol&apos;s own
        frontend before acting.
      </p>
    </div>
  );
}
