import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/BlogArticle";
import { BlogComments } from "@/components/BlogComments";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = getBlogPost(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} | Vector Engagement Labs`,
    description: post.description,
  };
}

export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  const articleUrl = `https://labs.reachdefence.com/blog/${post.slug}`;

  return (
    <main className="min-h-screen bg-[#050811] text-slate-200">
      <BlogArticle
        title={post.title}
        description={post.description}
        published={post.pubDate}
        updated={post.updatedDate}
        readingTime={post.readingTime}
        author={post.author}
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
        <BlogComments slug={post.slug} title={post.title} url={articleUrl} />
      </div>
    </main>
  );
}

