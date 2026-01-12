"use client";

import React, { useCallback, useState } from "react";
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
import { createTextChangeHandler } from "~~/utils/handlers";

// Categories list
const categories = ["All", "DeFi Strategies", "Market Analysis", "Ecosystem", "Risk Management", "Tutorials"];

// Animation constants - extracted to avoid inline object creation
const FADE_IN_INITIAL = { opacity: 0, y: 20 };
const FADE_IN_ANIMATE = { opacity: 1, y: 0 };
const FADE_IN_UP_INITIAL = { opacity: 0, y: -20 };
const FADE_IN_TRANSITION = { duration: 0.5 };
const FADE_IN_TRANSITION_DELAY_02 = { duration: 0.5, delay: 0.2 };
const FADE_IN_TRANSITION_DELAY_03 = { duration: 0.5, delay: 0.3 };
const FADE_IN_TRANSITION_DELAY_05 = { duration: 0.5, delay: 0.5 };

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
      initial={FADE_IN_INITIAL}
      animate={FADE_IN_ANIMATE}
      transition={FADE_IN_TRANSITION}
      className="card bg-base-200/80 dark:bg-base-300/30 group overflow-hidden shadow-xl transition-all duration-300 hover:shadow-2xl"
    >
      <div className="md:flex">
        <figure className="relative h-80 md:h-auto md:w-2/5">
          <Image
            src={getImageSrc(post.coverImage)}
            alt={getImageAlt(post.coverImage, post.title)}
            fill
            priority
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 40vw, 33vw"
          />
        </figure>
        <div className="card-body flex flex-col justify-between md:w-3/5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="badge badge-primary dark:badge-accent">{post.category}</span>
              <div className="text-base-content/70 flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="size-3" />
                  {post.date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <ClockIcon className="size-3" />
                  {post.readTime}
                </span>
              </div>
            </div>
            <h2 className="card-title group-hover:text-primary dark:group-hover:text-accent mb-3 text-2xl transition-colors md:text-3xl">
              {post.title}
            </h2>
            <p className="text-base-content/80 my-2">{post.excerpt}</p>
          </div>
          <div className="text-primary dark:text-accent flex items-center gap-2 font-medium">
            <span>Read Article</span>
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </motion.div>
  </Link>
);

// Blog post card component
const BlogPostCard = React.memo(function BlogPostCard({ post, index }: { post: BlogPost; index: number }) {
  const transition = React.useMemo(() => ({ duration: 0.5, delay: index * 0.1 }), [index]);

  return (
    <Link href={`/blog/${post.slug}`} className="block h-full">
      <motion.div
        initial={FADE_IN_INITIAL}
        animate={FADE_IN_ANIMATE}
        transition={transition}
        className="card bg-base-200/80 dark:bg-base-300/30 group h-full overflow-hidden shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      >
      <figure className="relative h-56 w-full">
        <Image
          src={getImageSrc(post.coverImage)}
          alt={getImageAlt(post.coverImage, post.title)}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </figure>
      <div className="card-body flex flex-grow flex-col justify-between p-5">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="badge badge-sm badge-primary dark:badge-accent">{post.category}</span>
            <div className="text-base-content/70 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1">
                <CalendarIcon className="size-3" />
                {post.date}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" />
                {post.readTime}
              </span>
            </div>
          </div>
          <h2 className="card-title group-hover:text-primary dark:group-hover:text-accent mb-2 text-lg transition-colors md:text-xl">
            {post.title}
          </h2>
          <p className="text-base-content/80 text-sm">{post.excerpt}</p>
        </div>
        <div className="text-primary dark:text-accent mt-3 flex items-center gap-2 text-sm font-medium">
          <span>Read More</span>
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.div>
  </Link>
  );
});

// Category button component to avoid inline onClick handlers
const CategoryButton = React.memo(function CategoryButton({
  category,
  isSelected,
  onSelect,
}: {
  category: string;
  isSelected: boolean;
  onSelect: (category: string) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(category);
  }, [category, onSelect]);

  return (
    <button
      className={`btn btn-sm ${isSelected ? "btn-primary dark:btn-accent" : "btn-ghost"}`}
      onClick={handleClick}
    >
      <TagIcon className="mr-1 size-4" />
      {category}
    </button>
  );
});

type BlogContentProps = {
  allPosts: BlogPost[];
  featuredPost: BlogPost | undefined;
  regularPosts: BlogPost[];
};

export default function BlogContent({ allPosts, featuredPost }: BlogContentProps) {
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
      <div className="from-base-300/20 dark:from-base-300/10 pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent"></div>

      {/* Hero section with search */}
      <div className="relative py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <motion.div initial={FADE_IN_UP_INITIAL} animate={FADE_IN_ANIMATE} transition={FADE_IN_TRANSITION}>
              <h1 className="from-primary to-secondary dark:from-accent dark:to-primary mb-4 bg-gradient-to-r bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                Kapan Finance Blog
              </h1>
              <p className="text-base-content/80 text-xl">
                Insights, guides, and updates on DeFi lending optimization and the broader ecosystem
              </p>
            </motion.div>

            <motion.div
              initial={FADE_IN_INITIAL}
              animate={FADE_IN_ANIMATE}
              transition={FADE_IN_TRANSITION_DELAY_02}
              className="relative mt-8"
            >
              <div className="relative mx-auto flex w-full max-w-2xl">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <MagnifyingGlassIcon className="text-base-content/50 size-5" />
                </div>
                <input
                  type="text"
                  className="input input-bordered bg-base-100/80 focus:ring-primary/50 dark:focus:ring-accent/50 block w-full p-4 pl-10 backdrop-blur-sm focus:ring-2"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={createTextChangeHandler(setSearchQuery)}
                />
              </div>
            </motion.div>
          </div>

          {/* Categories */}
          <motion.div
            initial={FADE_IN_INITIAL}
            animate={FADE_IN_ANIMATE}
            transition={FADE_IN_TRANSITION_DELAY_03}
            className="mb-12 flex flex-wrap justify-center gap-2"
          >
            {categories.map(category => (
              <CategoryButton
                key={category}
                category={category}
                isSelected={selectedCategory === category}
                onSelect={setSelectedCategory}
              />
            ))}
          </motion.div>
        </div>
      </div>

      {/* Blog content */}
      <div className="container mx-auto px-4 pb-24">
        {/* Featured post */}
        {featuredPost && selectedCategory === "All" && searchQuery === "" && (
          <div className="mb-16">
            <div className="mb-8 flex items-center">
              <div className="from-primary dark:from-accent h-1 flex-grow bg-gradient-to-r to-transparent"></div>
              <h2 className="px-4 text-xl font-bold">Featured Article</h2>
              <div className="from-primary dark:from-accent h-1 flex-grow bg-gradient-to-l to-transparent"></div>
            </div>
            <div className="mx-auto max-w-6xl">
              <FeaturedPost post={featuredPost} />
            </div>
          </div>
        )}

        {/* Latest posts */}
        <div className="mb-12">
          <div className="mb-8 flex items-center">
            <div className="from-primary dark:from-accent h-1 flex-grow bg-gradient-to-r to-transparent"></div>
            <h2 className="px-4 text-xl font-bold">
              {selectedCategory === "All" ? "Latest Articles" : selectedCategory}
            </h2>
            <div className="from-primary dark:from-accent h-1 flex-grow bg-gradient-to-l to-transparent"></div>
          </div>

          {filteredPosts.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredRegularPosts.map((post, index) => (
                <BlogPostCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-base-content/70 text-xl">No articles found. Try adjusting your search criteria.</p>
            </div>
          )}
        </div>

        {/* Newsletter signup */}
        <motion.div
          initial={FADE_IN_INITIAL}
          animate={FADE_IN_ANIMATE}
          transition={FADE_IN_TRANSITION_DELAY_05}
          className="card from-primary/10 to-secondary/10 dark:from-accent/10 dark:to-primary/10 rounded-xl bg-gradient-to-r p-8 shadow-lg"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="mb-4 text-2xl font-bold">Stay Updated</h3>
            <p className="text-base-content/80 mb-6">
              Subscribe to our newsletter for the latest articles, updates, and insights about DeFi optimization.
            </p>
            <div className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row">
              <input type="email" placeholder="Your email" className="input input-bordered flex-grow" />
              <button className="btn btn-primary dark:btn-accent">Subscribe</button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
