'use client';

import Link from "next/link";
import { useMemo, useState } from "react";
import { Grid2X2, List, Search } from "lucide-react";
import { formatBlogDate, type BlogCategory, type BlogPostRecord } from "@/lib/blog";

type ViewMode = "list" | "grid";

export function BlogsIndexClient({
  posts,
  categories,
}: {
  posts: BlogPostRecord[];
  categories: Array<"All" | BlogCategory>;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | BlogCategory>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return posts.filter((post) => {
      const categoryMatch = activeCategory === "All" || post.category === activeCategory;
      const queryMatch =
        lowered.length === 0 ||
        post.title.toLowerCase().includes(lowered) ||
        post.summary.toLowerCase().includes(lowered) ||
        post.excerpt.toLowerCase().includes(lowered) ||
        post.tags.some((tag) => tag.toLowerCase().includes(lowered));
      return categoryMatch && queryMatch;
    });
  }, [activeCategory, posts, query]);

  return (
    <>
      <div className="blogs-toolbar">
        <label className="blogs-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search simulation architecture, evidence, runtime..."
            aria-label="Search blog posts"
          />
        </label>
        <div className="blogs-view-toggle" aria-label="Blog layout">
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
          >
            <List size={14} />
            List
          </button>
          <button
            type="button"
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => setViewMode("grid")}
          >
            <Grid2X2 size={14} />
            Grid
          </button>
        </div>
      </div>

      <div className="blogs-filters" role="tablist" aria-label="Blog categories">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={activeCategory === category}
            className={activeCategory === category ? "active" : ""}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <section className="blogs-empty">
          <strong>No articles match this search.</strong>
          <p>Try a broader term or switch back to all categories.</p>
        </section>
      ) : (
        <section className={`blogs-results ${viewMode === "grid" ? "grid" : "list"}`}>
          {filtered.map((post) => (
            <article key={post.slug} className="blog-card">
              <header>
                <span className="blog-card-category">{post.category}</span>
                <div className="blog-card-meta">
                  <span>{post.author}</span>
                  <span>{formatBlogDate(post.publishedAt)}</span>
                  <span>{post.readingTimeMinutes} min read</span>
                </div>
              </header>
              <div className="blog-card-body">
                <h2>
                  <Link href={`/blogs/posts/${post.slug}`}>{post.title}</Link>
                </h2>
                <p>{post.summary}</p>
                <div className="blog-card-tags">
                  {post.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </div>
              <footer>
                <p>{post.excerpt}</p>
                <Link href={`/blogs/posts/${post.slug}`}>Read article →</Link>
              </footer>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
