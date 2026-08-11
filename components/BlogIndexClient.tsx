"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Grid2x2,
  List,
  Search,
  Tag,
} from "lucide-react";
import type { BlogPostSummary } from "@/lib/blog";

type ViewMode = "grid" | "list";

export function BlogIndexClient({ posts }: { posts: BlogPostSummary[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [view, setView] = useState<ViewMode>("grid");

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const post of posts) {
      for (const tag of post.tags) set.add(tag);
    }
    return ["All", ...Array.from(set)];
  }, [posts]);

  const visible = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesTag = activeTag === "All" || post.tags.includes(activeTag);
      const matchesQuery =
        lowerQuery.length === 0 ||
        [post.title, post.description, post.author, post.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(lowerQuery);
      return matchesTag && matchesQuery;
    });
  }, [activeTag, posts, query]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300 md:min-w-[320px]">
          <Search size={16} className="text-cyan-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, tag, or author"
            className="w-full bg-transparent outline-none placeholder:text-slate-500"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              view === "grid"
                ? "bg-cyan-500 text-slate-950"
                : "border border-slate-800 bg-slate-900 text-slate-300 hover:border-cyan-800 hover:text-cyan-300"
            }`}
          >
            <Grid2x2 size={14} />
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              view === "list"
                ? "bg-cyan-500 text-slate-950"
                : "border border-slate-800 bg-slate-900 text-slate-300 hover:border-cyan-800 hover:text-cyan-300"
            }`}
          >
            <List size={14} />
            List
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tagName) => (
          <button
            key={tagName}
            type="button"
            onClick={() => setActiveTag(tagName)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTag === tagName
                ? "border-cyan-500 bg-cyan-500/15 text-cyan-300"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:border-cyan-800 hover:text-cyan-300"
            }`}
          >
            <Tag size={12} />
            {tagName}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div
          className={
            view === "grid"
              ? "grid gap-6 md:grid-cols-2"
              : "grid gap-4"
          }
        >
          {visible.map((post) => (
            <article
              key={post.slug}
              className={`group rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 transition-colors hover:border-cyan-500/40 ${
                view === "list" ? "md:flex md:items-center md:justify-between md:gap-8" : ""
              }`}
            >
              <div className={view === "list" ? "md:max-w-3xl" : ""}>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} />
                    {new Date(post.pubDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={12} />
                    {post.readingTime}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-slate-100 group-hover:text-cyan-300">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {post.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((tagName) => (
                    <span
                      key={tagName}
                      className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] text-cyan-300"
                    >
                      #{tagName}
                    </span>
                  ))}
                </div>
              </div>

              <Link
                href={`/blog/${post.slug}`}
                className="mt-5 inline-flex items-center gap-2 self-start rounded-xl border border-cyan-800/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-200 md:mt-0"
              >
                Open article
                <ArrowRight size={14} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-sm text-slate-400">
          No posts matched the current filter.
        </div>
      )}
    </div>
  );
}

