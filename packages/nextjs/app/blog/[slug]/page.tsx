import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import BlogPostContent from "./BlogPostContent";
import { getPostData, getSortedPostsData } from "~~/utils/blog";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await params;
    const post = getPostData(slug);
    const description =
      post.excerpt || post.content?.slice(0, 155) || "Read the latest insights from Kapan Finance.";
    const imageRelativePath =
      typeof post.coverImage === "string" ? post.coverImage : post.coverImage?.src ?? "/thumbnail.png";
    const baseMetadata = getMetadata({
      title: post.title || "Kapan Finance Blog Post",
      description,
      imageRelativePath,
    });

    return {
      ...baseMetadata,
      alternates: {
        canonical: `/blog/${slug}`,
      },
      openGraph: {
        ...baseMetadata.openGraph,
        url: `/blog/${slug}`,
        type: "article",
      },
    };
  } catch {
    return {};
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  try {
    const { slug } = await params;
    const post = getPostData(slug);
    const allPosts = getSortedPostsData();
    const relatedPosts = allPosts
      .filter(p => p.slug !== slug)
      .slice(0, 3);

    const content = post.content ? (
      <MDXRemote source={post.content} components={mdxComponents} />
    ) : null;

    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      datePublished: post.date,
      description: post.excerpt,
      url: `https://kapan.finance/blog/${post.slug}`,
      image:
        typeof post.coverImage === "string"
          ? post.coverImage
          : post.coverImage?.src ?? "https://kapan.finance/thumbnail.png",
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, "\\u003c") }}
        />
        <BlogPostContent post={post} relatedPosts={relatedPosts} content={content} />
      </>
    );
  } catch (error) {
    console.error("Error loading post:", error);
    return notFound();
  }
} 