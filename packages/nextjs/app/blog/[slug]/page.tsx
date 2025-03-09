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

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  // Get post data on the server
  try {
    const post = getPostData(params.slug);
    const allPosts = getSortedPostsData();
    const relatedPosts = allPosts
      .filter(p => p.slug !== params.slug)
      .slice(0, 3);
    
    // Render the MDX content on the server
    const content = post.content ? (
      <MDXRemote source={post.content} components={mdxComponents} />
    ) : null;
    
    // Pass the data to the client component
    return <BlogPostContent post={post} relatedPosts={relatedPosts} content={content} />;
  } catch (error) {
    console.error("Error loading post:", error);
    return notFound();
  }
} 