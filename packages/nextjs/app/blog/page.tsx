import type { Metadata } from "next";
import React from "react";
import BlogContent from "./BlogContent";
import { getSortedPostsData } from "~~/utils/blog";

export const metadata: Metadata = {
  title: "Kapan Finance Blog | DeFi Lending Guides and Updates",
  description: "Read the latest DeFi lending insights, tutorials, and news from the Kapan Finance team.",
  alternates: {
    canonical: "https://kapan.finance/blog",
  },
};

export default function BlogPage() {
  // Get all blog posts using the utility function
  const blogPosts = getSortedPostsData();
  const featuredPost = blogPosts.find(post => post.featured);
  const regularPosts = blogPosts.filter(post => !post.featured);

  return <BlogContent allPosts={blogPosts} featuredPost={featuredPost} regularPosts={regularPosts} />;
}
