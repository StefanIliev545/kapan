import { MetadataRoute } from "next";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep crawlers on the public content surface. `/app` and `/orders` are wallet-gated
        // client routes that render an empty shell (no SEO value, soft-404 risk); `/api` and
        // `/_next/data` are internal.
        disallow: ["/api/", "/app", "/orders", "/_next/data/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
