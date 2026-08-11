import matter from "gray-matter";
import {
  BLOG_CATEGORIES,
  type BlogCategory,
  type BlogPostRecord,
} from "@/lib/blog";

type BlogFrontmatter = {
  title?: unknown;
  summary?: unknown;
  excerpt?: unknown;
  author?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  readingTimeMinutes?: unknown;
  category?: unknown;
  tags?: unknown;
  thumbnail?: unknown;
  thumbnailAlt?: unknown;
};

const BLOG_POST_SOURCES = import.meta.glob("../content/blog/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`blog_post_missing_${field}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`blog_post_empty_${field}`);
  }
  return trimmed;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCategory(value: unknown): BlogCategory {
  const category = stringValue(value, "category") as BlogCategory;
  if (!BLOG_CATEGORIES.includes(category)) {
    throw new Error(`blog_post_invalid_category_${category}`);
  }
  return category;
}

function parseTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag): tag is string => tag.length > 0);
}

function firstParagraph(markdown: string) {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (block.startsWith("#")) {
      continue;
    }
    const stripped = block.replace(/\s+/g, " ").trim();
    if (stripped) return stripped;
  }

  return "";
}

function readingTimeMinutes(markdown: string, fallback = 1) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return fallback;
  return Math.max(fallback, Math.ceil(words / 220));
}

function toIsoDate(value: unknown, field: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const date = stringValue(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`blog_post_invalid_${field}`);
  }
  return date;
}

function parsePost(filePath: string, source: string): BlogPostRecord {
  const slug = filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
  if (!slug) {
    throw new Error("blog_post_missing_slug");
  }

  const { data, content } = matter(source);
  const frontmatter = data as BlogFrontmatter;
  const markdown = content.trimStart();
  const summary = stringValue(frontmatter.summary, "summary");
  const excerpt = optionalString(frontmatter.excerpt) ?? firstParagraph(markdown) ?? summary;

  return {
    slug,
    title: stringValue(frontmatter.title, "title"),
    summary,
    excerpt,
    author: stringValue(frontmatter.author, "author"),
    publishedAt: toIsoDate(frontmatter.publishedAt, "published_at"),
    updatedAt: toIsoDate(frontmatter.updatedAt ?? frontmatter.publishedAt, "updated_at"),
    readingTimeMinutes:
      typeof frontmatter.readingTimeMinutes === "number" &&
      Number.isFinite(frontmatter.readingTimeMinutes)
        ? Math.max(1, Math.round(frontmatter.readingTimeMinutes))
        : readingTimeMinutes(markdown),
    category: parseCategory(frontmatter.category),
    tags: parseTags(frontmatter.tags),
    thumbnail: optionalString(frontmatter.thumbnail),
    thumbnailAlt: optionalString(frontmatter.thumbnailAlt),
    markdown,
  };
}

export const BLOG_POSTS = Object.entries(BLOG_POST_SOURCES)
  .map(([filePath, source]) => parsePost(filePath, source))
  .sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime() ||
      right.slug.localeCompare(left.slug),
  );

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}

export function isBlogSlug(slug: string) {
  return BLOG_POSTS.some((post) => post.slug === slug);
}

export function blogCanonicalUrl(slug: string) {
  return `/blogs/posts/${slug}`;
}

export function blogAbsoluteUrl(slug: string) {
  return new URL(
    blogCanonicalUrl(slug),
    process.env.SITE_URL || "https://labs.reachdefence.com",
  ).toString();
}
