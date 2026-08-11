export type BlogCategory =
  | "Analysis"
  | "Tradecraft"
  | "Case Notes"
  | "Product Notes";

export type BlogPostRecord = {
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  readingTimeMinutes: number;
  category: BlogCategory;
  tags: string[];
  thumbnail: string | null;
  thumbnailAlt: string | null;
  markdown: string;
};
export const BLOG_CATEGORIES: Array<"All" | BlogCategory> = [
  "All",
  "Analysis",
  "Tradecraft",
  "Case Notes",
  "Product Notes",
];

export function formatBlogDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
