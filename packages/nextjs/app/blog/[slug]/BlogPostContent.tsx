"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeftIcon, CalendarIcon, ClockIcon, ShareIcon } from "@heroicons/react/24/outline";
import type { BlogPost } from "~~/utils/blog";

// Animation constants - extracted to avoid inline object creation
const FADE_IN_INITIAL = { opacity: 0, y: 20 };
const FADE_IN_ANIMATE = { opacity: 1, y: 0 };
const FADE_IN_TRANSITION = { duration: 0.5 };

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

// Related post card component to avoid inline objects
const RelatedPostCard = React.memo(function RelatedPostCard({
  post,
  index,
}: {
  post: BlogPost;
  index: number;
}) {
  const transition = React.useMemo(() => ({ duration: 0.5, delay: index * 0.1 }), [index]);

  return (
    <Link href={`/blog/${post.slug}`} className="block h-full">
      <motion.div
        initial={FADE_IN_INITIAL}
        animate={FADE_IN_ANIMATE}
        transition={transition}
        className="card bg-base-200/80 dark:bg-base-300/30 group h-full overflow-hidden shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      >
        <figure className="relative h-48 w-full">
          <Image
            src={getImageSrc(post.coverImage)}
            alt={getImageAlt(post.coverImage, post.title)}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
          />
        </figure>
        <div className="card-body p-4">
          <h3 className="card-title group-hover:text-primary dark:group-hover:text-accent text-lg transition-colors">
            {post.title}
          </h3>
          <div className="text-base-content/70 mt-2 flex items-center gap-2 text-xs">
            <CalendarIcon className="size-3" />
            <span>{post.date}</span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
});

// Related posts component
const RelatedPosts = ({ relatedPosts }: { relatedPosts: BlogPost[] }) => {
  return (
    <div className="mt-16">
      <div className="mb-8 flex items-center">
        <div className="from-primary dark:from-accent h-1 flex-grow bg-gradient-to-r to-transparent" />
        <h2 className="px-4 text-xl font-bold">Related Articles</h2>
        <div className="from-primary dark:from-accent h-1 flex-grow bg-gradient-to-l to-transparent" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {relatedPosts.map((post, index) => (
          <RelatedPostCard key={post.slug} post={post} index={index} />
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
      <div className="from-base-300/20 dark:from-base-300/10 pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent" />

      {/* Hero section with cover image */}
      <div className="relative">
        <div className="relative h-80 w-full md:h-[400px]">
          <Image
            src={getImageSrc(post.coverImage)}
            alt={getImageAlt(post.coverImage, post.title)}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="from-base-100 via-base-100/60 absolute inset-0 bg-gradient-to-t to-transparent" />
        </div>

        <div className="container relative mx-auto -mt-40 px-4 md:-mt-56">
          <motion.div
            initial={FADE_IN_INITIAL}
            animate={FADE_IN_ANIMATE}
            transition={FADE_IN_TRANSITION}
            className="card bg-base-100/95 dark:bg-base-200/95 p-6 shadow-xl backdrop-blur-md md:p-8"
          >
            <div className="mx-auto max-w-3xl">
              <Link
                href="/blog"
                className="text-primary dark:text-accent mb-4 inline-flex items-center gap-2 text-sm hover:underline"
              >
                <ArrowLeftIcon className="size-4" />
                Back to all articles
              </Link>

              {/* Post header */}
              <div className="mb-8">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="badge badge-primary dark:badge-accent">{post.category}</span>
                  <div className="text-base-content/70 flex items-center gap-2 text-sm">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="size-4" />
                      {post.date}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-4" />
                      {post.readTime}
                    </span>
                  </div>
                </div>

                <h1 className="mb-4 text-3xl font-bold md:text-4xl">{post.title}</h1>
                <p className="text-base-content/80 text-xl">{post.excerpt}</p>
              </div>

              {/* Social sharing */}
              <div className="mb-8 flex justify-end">
                <div className="flex gap-2">
                  <button className="btn btn-circle btn-sm btn-ghost" aria-label="Share this post">
                    <ShareIcon className="size-4" />
                  </button>
                </div>
              </div>

              {/* Article content */}
              <div className="prose dark:prose-invert prose-lg max-w-none">{content}</div>

              {/* Article footer */}
              <div className="border-base-300/50 dark:border-base-content/10 mt-12 border-t pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="font-bold">Category:</span> {post.category}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-primary dark:btn-accent" aria-label="Share this post">
                      <ShareIcon className="mr-2 size-4" />
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
        <div className="mx-auto max-w-5xl">
          <RelatedPosts relatedPosts={relatedPosts} />
        </div>
      </div>
    </div>
  );
}
