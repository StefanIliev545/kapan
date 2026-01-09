import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import BlogPostContent from "./BlogPostContent";
import { getPostData, getSortedPostsData } from "~~/utils/blog";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

// Custom MDX components
const mdxComponents = {
  h1: (props: any) => <h1 className="mb-4 mt-8 text-3xl font-bold" {...props} />,
  h2: (props: any) => <h2 className="mb-4 mt-8 text-2xl font-bold" {...props} />,
  h3: (props: any) => <h3 className="mb-3 mt-6 text-xl font-bold" {...props} />,
  p: (props: any) => <p className="my-4" {...props} />,
  ul: (props: any) => <ul className="my-4 ml-6 list-disc" {...props} />,
  ol: (props: any) => <ol className="my-4 ml-6 list-decimal" {...props} />,
  li: (props: any) => <li className="my-1" {...props} />,
  strong: (props: any) => <strong className="font-bold" {...props} />,
  a: (props: any) => <a className="text-primary dark:text-accent hover:underline" {...props} />,
  img: (props: any) => (
    <Image
      src={props.src}
      alt={props.alt || ""}
      width={props.width ?? 800}
      height={props.height ?? 450}
      sizes="(max-width: 768px) 100vw, 800px"
      style={{ height: "auto", width: "100%" }}
    />
  ),
};

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;

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
      url: `${baseUrl}/blog/${post.slug}`,
      image:
        typeof post.coverImage === "string"
          ? `${baseUrl}${post.coverImage}`
          : post.coverImage?.src
            ? `${baseUrl}${post.coverImage.src}`
            : `${baseUrl}/thumbnail.png`,
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