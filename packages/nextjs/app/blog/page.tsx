import React from "react";
import BlogContent from "./BlogContent";
import { getSortedPostsData } from "~~/utils/blog";

export default function BlogPage() {
  // Get all blog posts using the utility function
  const blogPosts = getSortedPostsData();
  const featuredPost = blogPosts.find(post => post.featured);
  const regularPosts = blogPosts.filter(post => !post.featured);

  return <BlogContent allPosts={blogPosts} featuredPost={featuredPost} regularPosts={regularPosts} />;
}
