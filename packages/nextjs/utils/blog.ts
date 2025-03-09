import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Make sure this file is only executed on the server
if (typeof window !== 'undefined') {
  throw new Error('This file should only be imported on the server');
}

// Fix the path to avoid duplication of packages/nextjs
const postsDirectory = path.join(process.cwd(), 'data/blog');

// Type for cover image with flexible options
export type CoverImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string | CoverImage;  // Support both string and object formats for backward compatibility
  date: string;
  readTime: string;
  category: string;
  featured?: boolean;
  content?: string;
};

export function getSortedPostsData(): BlogPost[] {
  // Get file names under /data/blog
  const fileNames = fs.readdirSync(postsDirectory);
  const allPostsData = fileNames.map(fileName => {
    // Remove ".mdx" from file name to get slug
    const slug = fileName.replace(/\.mdx$/, '');

    // Read MDX file as string
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, 'utf8');

    // Use gray-matter to parse the post metadata section
    const { data } = matter(fileContents);

    // Combine the data with the slug
    return {
      slug,
      ...(data as Omit<BlogPost, 'slug'>)
    };
  });

  // Sort posts by date
  return allPostsData.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
}

export function getAllPostSlugs() {
  const fileNames = fs.readdirSync(postsDirectory);
  return fileNames.map(fileName => {
    return {
      params: {
        slug: fileName.replace(/\.mdx$/, '')
      }
    };
  });
}

export function getPostData(slug: string): BlogPost {
  const fullPath = path.join(postsDirectory, `${slug}.mdx`);
  const fileContents = fs.readFileSync(fullPath, 'utf8');

  // Use gray-matter to parse the post metadata section
  const { data, content } = matter(fileContents);

  // Combine the data with the id and content
  return {
    slug,
    ...(data as Omit<BlogPost, 'slug'>),
    content
  };
} 