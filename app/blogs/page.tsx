import type { Metadata } from "next";
import { ProductHeader } from "@/components/ProductHeader";
import { BlogsIndexClient } from "@/components/BlogsIndexClient";
import { BLOG_CATEGORIES, BLOG_POSTS } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Engineering Blogs | Vector Engagement Labs",
  description:
    "Search and browse Vector Engagement Labs engineering notes on simulation architecture, runtime design, evidence, and reproducible analysis.",
};

export default function BlogsPage() {
  return (
    <main className="blogs-page">
      <ProductHeader current="blog" />
      <section className="blogs-hero">
        <span>Blogs</span>
        <h1>Engineering analysis, product notes, and simulation tradecraft.</h1>
        <p>
          ReachDefence publishes practical writing on how Vector Engagement Labs
          handles deterministic simulation, evidence, information state, and
          explainable operational results.
        </p>
      </section>
      <section className="blogs-shell">
        <BlogsIndexClient posts={BLOG_POSTS} categories={BLOG_CATEGORIES} />
      </section>
    </main>
  );
}
