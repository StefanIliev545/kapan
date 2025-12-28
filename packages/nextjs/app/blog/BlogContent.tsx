"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { BlogPost } from "~~/utils/blog";

// Categories list
const categories = ["All", "DeFi Strategies", "Market Analysis", "Ecosystem", "Risk Management", "Tutorials"];

// Helper function to get image src from coverImage field
const getImageSrc = (coverImage: BlogPost['coverImage']): string => {
  if (typeof coverImage === 'string') {
    return coverImage;
  }
  return coverImage.src;
};

// Helper function to get image alt from coverImage field
const getImageAlt = (coverImage: BlogPost['coverImage'], title: string): string => {
  if (typeof coverImage === 'string') {
    return title;
  }
  return coverImage.alt;
};

// Featured post component
const FeaturedPost = ({ post }: { post: BlogPost }) => (
  <Link href={`/blog/${post.slug}`} className="block">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="card bg-base-200/80 dark:bg-base-300/30 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300 group"
    >
      <div className="md:flex">
        <figure className="relative md:w-2/5 h-80 md:h-auto">
          <Image
            src={getImageSrc(post.coverImage)}
            alt={getImageAlt(post.coverImage, post.title)}
            fill
            priority
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 40vw, 33vw"
          />
        </figure>
        <div className="card-body md:w-3/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge badge-primary dark:badge-accent">{post.category}</span>
              <div className="flex items-center text-xs text-base-content/70 gap-2">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {post.date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  {post.readTime}
                </span>
              </div>
            </div>
            <h2 className="card-title text-2xl md:text-3xl mb-3 group-hover:text-primary dark:group-hover:text-accent transition-colors">
              {post.title}
            </h2>
            <p className="text-base-content/80 my-2">{post.excerpt}</p>
          </div>
          <div className="flex items-center gap-2 text-primary dark:text-accent font-medium">
            <span>Read Article</span>
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </motion.div>
  </Link>
);

// Blog post card component
const BlogPostCard = ({ post, index }: { post: BlogPost; index: number }) => (
  <Link href={`/blog/${post.slug}`} className="block h-full">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="card bg-base-200/80 dark:bg-base-300/30 shadow-xl h-full overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 group"
    >
      <figure className="relative h-56 w-full">
        <Image
          src={getImageSrc(post.coverImage)}
          alt={getImageAlt(post.coverImage, post.title)}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </figure>
      <div className="card-body flex-grow flex flex-col justify-between p-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="badge badge-sm badge-primary dark:badge-accent">{post.category}</span>
            <div className="flex items-center text-xs text-base-content/70 gap-2">
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {post.date}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                {post.readTime}
              </span>
            </div>
          </div>
          <h2 className="card-title text-lg md:text-xl mb-2 group-hover:text-primary dark:group-hover:text-accent transition-colors">
            {post.title}
          </h2>
          <p className="text-base-content/80 text-sm">{post.excerpt}</p>
        </div>
        <div className="mt-3 flex items-center gap-2 text-primary dark:text-accent text-sm font-medium">
          <span>Read More</span>
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.div>
  </Link>
);

type BlogContentProps = {
  allPosts: BlogPost[];
  featuredPost: BlogPost | undefined;
  regularPosts: BlogPost[];
};

export default function BlogContent({ allPosts, featuredPost, regularPosts }: BlogContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Filter posts based on search and category
  const filteredPosts = allPosts.filter(post => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Get non-featured posts that match filters
  const filteredRegularPosts = filteredPosts.filter(post => !post.featured);

  return (
    <div className="min-h-screen">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-300/20 to-transparent dark:from-base-300/10 pointer-events-none"></div>

      {/* Hero section with search */}
      <div className="relative py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary dark:from-accent dark:to-primary bg-clip-text text-transparent">
                Kapan Finance Blog
              </h1>
              <p className="text-xl text-base-content/80">
                Insights, guides, and updates on DeFi lending optimization and the broader ecosystem
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-8 relative"
            >
              <div className="relative flex w-full max-w-2xl mx-auto">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <MagnifyingGlassIcon className="w-5 h-5 text-base-content/50" />
                </div>
                <input
                  type="text"
                  className="block w-full p-4 pl-10 input input-bordered bg-base-100/80 backdrop-blur-sm focus:ring-2 focus:ring-primary/50 dark:focus:ring-accent/50"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </motion.div>
          </div>

          {/* Categories */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap justify-center gap-2 mb-12"
          >
            {categories.map(category => (
              <button
                key={category}
                className={`btn btn-sm ${selectedCategory === category ? "btn-primary dark:btn-accent" : "btn-ghost"}`}
                onClick={() => setSelectedCategory(category)}
              >
                <TagIcon className="h-4 w-4 mr-1" />
                {category}
              </button>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Blog content */}
      <div className="container mx-auto px-4 pb-24">
        {/* Featured post */}
        {featuredPost && selectedCategory === "All" && searchQuery === "" && (
          <div className="mb-16">
            <div className="flex items-center mb-8">
              <div className="h-1 flex-grow bg-gradient-to-r from-primary to-transparent dark:from-accent"></div>
              <h2 className="px-4 text-xl font-bold">Featured Article</h2>
              <div className="h-1 flex-grow bg-gradient-to-l from-primary to-transparent dark:from-accent"></div>
            </div>
            <div className="max-w-6xl mx-auto">
              <FeaturedPost post={featuredPost} />
            </div>
          </div>
        )}

        {/* Latest posts */}
        <div className="mb-12">
          <div className="flex items-center mb-8">
            <div className="h-1 flex-grow bg-gradient-to-r from-primary to-transparent dark:from-accent"></div>
            <h2 className="px-4 text-xl font-bold">
              {selectedCategory === "All" ? "Latest Articles" : selectedCategory}
            </h2>
            <div className="h-1 flex-grow bg-gradient-to-l from-primary to-transparent dark:from-accent"></div>
          </div>

          {filteredPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRegularPosts.map((post, index) => (
                <BlogPostCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-xl text-base-content/70">No articles found. Try adjusting your search criteria.</p>
            </div>
          )}
        </div>

        {/* Newsletter signup */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="card bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-accent/10 dark:to-primary/10 p-8 rounded-xl shadow-lg"
        >
          <div className="text-center max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold mb-4">Stay Updated</h3>
            <p className="mb-6 text-base-content/80">
              Subscribe to our newsletter for the latest articles, updates, and insights about DeFi optimization.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input type="email" placeholder="Your email" className="input input-bordered flex-grow" />
              <button className="btn btn-primary dark:btn-accent">Subscribe</button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
