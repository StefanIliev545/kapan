import { MetadataRoute } from "next";
import { getSortedPostsData } from "~~/utils/blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://kapan.finance";
  const now = new Date();

  const posts = getSortedPostsData();
  const postUrls: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : now,
  }));

  return [
    { url: `${baseUrl}/`, lastModified: now },
    { url: `${baseUrl}/app`, lastModified: now },
    { url: `${baseUrl}/markets`, lastModified: now },
    { url: `${baseUrl}/automate`, lastModified: now },
    { url: `${baseUrl}/info`, lastModified: now },
    { url: `${baseUrl}/blog`, lastModified: now },
    { url: `${baseUrl}/privacy`, lastModified: now },
    ...postUrls,
  ];
}
