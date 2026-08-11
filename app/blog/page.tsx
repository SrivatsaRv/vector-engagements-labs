import type { Metadata } from "next";
import { BlogIndexClient } from "@/components/BlogIndexClient";
import { BLOG_POSTS } from "@/lib/blog";
import { ProductHeader } from "@/components/ProductHeader";

export const metadata: Metadata = {
  title: "Blog | Vector Engagement Labs",
  description:
    "Long-form design notes, architecture analysis, and simulation research for Vector Engagement Labs.",
};

export default function BlogIndexPage() {
  return (
    <main className="min-h-screen bg-[#050811] text-slate-200">
      <ProductHeader current="blog" />
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <div className="max-w-4xl space-y-5">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Engineering blog
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
            Design notes, analysis, and simulation architecture
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-slate-400">
            This section is part of the main site again. Use it for long-form
            technical analysis and follow the article that is currently
            published.
          </p>
        </div>

        <div className="mt-12">
          <BlogIndexClient posts={BLOG_POSTS} />
        </div>
      </section>
    </main>
  );
}
