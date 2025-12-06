import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/debug"],
      },
    ],
    sitemap: "https://kapan.finance/sitemap.xml",
  };
}
