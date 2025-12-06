import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import BlogPostContent from "./BlogPostContent";
import { getPostData, getSortedPostsData } from "~~/utils/blog";

// Custom MDX components
const mdxComponents = {
  h1: (props: any) => <h1 className="text-3xl font-bold mt-8 mb-4" {...props} />,
  h2: (props: any) => <h2 className="text-2xl font-bold mt-8 mb-4" {...props} />,
  h3: (props: any) => <h3 className="text-xl font-bold mt-6 mb-3" {...props} />,
  p: (props: any) => <p className="my-4" {...props} />,
  ul: (props: any) => <ul className="list-disc ml-6 my-4" {...props} />,
  ol: (props: any) => <ol className="list-decimal ml-6 my-4" {...props} />,
  li: (props: any) => <li className="my-1" {...props} />,
  strong: (props: any) => <strong className="font-bold" {...props} />,
  a: (props: any) => <a className="text-primary dark:text-accent hover:underline" {...props} />,
};

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const { slug } = params;
    const post = getPostData(slug);

    return {
      title: `${post.title} | Kapan Finance Blog`,
      description: post.excerpt,
      alternates: {
        canonical: `https://kapan.finance/blog/${slug}`,
      },
      openGraph: {
        title: `${post.title} | Kapan Finance Blog`,
        description: post.excerpt,
        url: `https://kapan.finance/blog/${slug}`,
        type: "article",
      },
    };
  } catch {
    return {};
  }
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  try {
    const { slug } = params;
    const post = getPostData(slug);
    const allPosts = getSortedPostsData();
    const relatedPosts = allPosts
      .filter(p => p.slug !== slug)
      .slice(0, 3);
    
    const content = post.content ? (
      <MDXRemote source={post.content} components={mdxComponents} />
    ) : null;
    
    return <BlogPostContent post={post} relatedPosts={relatedPosts} content={content} />;
  } catch (error) {
    console.error("Error loading post:", error);
    return notFound();
  }
} 