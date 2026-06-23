import { MetadataRoute } from "next";
import { getSortedPostsData } from "~~/utils/blog";
import { RATES_CHAINS } from "~~/utils/rates";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const posts = getSortedPostsData();
  const postUrls: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : now,
  }));

  // Programmatic rate pages: the /rates index + per-chain hubs. Leaf pages
  // (/rates/[chain]/[token]) are discovered by crawlers via the hubs' internal links — which only
  // link tokens that actually have data — plus a curated leaf subset listed here for fast indexing.
  // When the full token × chain matrix is generated, shard this with generateSitemaps().
  const curatedLeaves = ["arbitrum", "base", "ethereum"].flatMap(chain =>
    ["usdc", "eth", "wbtc"].map(token => `${baseUrl}/rates/${chain}/${token}`),
  );
  const rateUrls: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/rates`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ...RATES_CHAINS.map(c => ({
      url: `${baseUrl}/rates/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...curatedLeaves.map(url => ({ url, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
  ];

  // Only public, indexable content pages belong here.
  // The wallet-gated app (`/app`) and user/order-specific routes (`/orders`) are
  // intentionally excluded — they render an empty shell to crawlers and waste crawl budget.
  // When the programmatic rate/market pages land (the `(rates)` route group), shard this
  // with generateSitemaps() — see the SEO plan.
  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/markets`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/info`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/license`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...rateUrls,
    ...postUrls,
  ];
}
