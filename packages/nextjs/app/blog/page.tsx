import type { Metadata } from "next";
import React from "react";
import BlogContent from "./BlogContent";
import { getSortedPostsData } from "~~/utils/blog";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...getMetadata({
      title: "Blog",
      description:
        "DeFi lending insights and Kapan Finance updates. Explore articles on optimizing borrowing costs, interest rates, and more.",
    }),
    alternates: {
      canonical: "https://kapan.finance/blog",
    },
  };
}

export default function BlogPage() {
  // Get all blog posts using the utility function
  const blogPosts = getSortedPostsData();
  const featuredPost = blogPosts.find(post => post.featured);
  const regularPosts = blogPosts.filter(post => !post.featured);

  return <BlogContent allPosts={blogPosts} featuredPost={featuredPost} regularPosts={regularPosts} />;
}
