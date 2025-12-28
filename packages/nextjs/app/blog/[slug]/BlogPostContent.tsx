"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeftIcon, CalendarIcon, ClockIcon, ShareIcon } from "@heroicons/react/24/outline";
import { BlogPost } from "~~/utils/blog";

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

// Related posts component
const RelatedPosts = ({ relatedPosts }: { relatedPosts: BlogPost[] }) => {
  return (
    <div className="mt-16">
      <div className="flex items-center mb-8">
        <div className="h-1 flex-grow bg-gradient-to-r from-primary to-transparent dark:from-accent"></div>
        <h2 className="px-4 text-xl font-bold">Related Articles</h2>
        <div className="h-1 flex-grow bg-gradient-to-l from-primary to-transparent dark:from-accent"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {relatedPosts.map((post, index) => (
          <Link href={`/blog/${post.slug}`} key={post.slug} className="block h-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="card bg-base-200/80 dark:bg-base-300/30 shadow-xl h-full overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 group"
            >
              <figure className="relative h-48 w-full">
                <Image
                  src={getImageSrc(post.coverImage)}
                  alt={getImageAlt(post.coverImage, post.title)}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
                />
              </figure>
              <div className="card-body p-4">
                <h3 className="card-title text-lg group-hover:text-primary dark:group-hover:text-accent transition-colors">
                  {post.title}
                </h3>
                <div className="flex items-center text-xs text-base-content/70 gap-2 mt-2">
                  <CalendarIcon className="h-3 w-3" />
                  <span>{post.date}</span>
                </div>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
};

interface BlogPostContentProps {
  post: BlogPost;
  relatedPosts: BlogPost[];
  content: React.ReactNode;
}

export default function BlogPostContent({ post, relatedPosts, content }: BlogPostContentProps) {
  return (
    <div className="min-h-screen">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-300/20 to-transparent dark:from-base-300/10 pointer-events-none"></div>

      {/* Hero section with cover image */}
      <div className="relative">
        <div className="h-80 md:h-[400px] w-full relative">
          <Image
            src={getImageSrc(post.coverImage)}
            alt={getImageAlt(post.coverImage, post.title)}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/60 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 relative -mt-40 md:-mt-56">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="card bg-base-100/95 dark:bg-base-200/95 backdrop-blur-md shadow-xl p-6 md:p-8"
          >
            <div className="max-w-3xl mx-auto">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm text-primary dark:text-accent mb-4 hover:underline"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to all articles
              </Link>

              {/* Post header */}
              <div className="mb-8">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="badge badge-primary dark:badge-accent">{post.category}</span>
                  <div className="flex items-center text-sm text-base-content/70 gap-2">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-4 w-4" />
                      {post.date}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-4 w-4" />
                      {post.readTime}
                    </span>
                  </div>
                </div>

                <h1 className="text-3xl md:text-4xl font-bold mb-4">{post.title}</h1>
                <p className="text-xl text-base-content/80">{post.excerpt}</p>
              </div>

              {/* Social sharing */}
              <div className="flex justify-end mb-8">
                <div className="flex gap-2">
                  <button className="btn btn-circle btn-sm btn-ghost" aria-label="Share this post">
                    <ShareIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Article content */}
              <div className="prose dark:prose-invert prose-lg max-w-none">{content}</div>

              {/* Article footer */}
              <div className="mt-12 pt-6 border-t border-base-300/50 dark:border-base-content/10">
                <div className="flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <span className="font-bold">Category:</span> {post.category}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-primary dark:btn-accent" aria-label="Share this post">
                      <ShareIcon className="mr-2 h-4 w-4" />
                      Share
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Related posts */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <RelatedPosts relatedPosts={relatedPosts} />
        </div>
      </div>
    </div>
  );
}
