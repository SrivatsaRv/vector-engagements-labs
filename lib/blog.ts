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
};

export const BLOG_POSTS: BlogPostRecord[] = [
  {
    slug: "what-engagement-simulators-need-to-model-in-2026",
    title: "What Engagement Simulators Need to Model in 2026",
    summary:
      "Modern engagement simulation is moving away from isolated platform models and toward one coherent synthetic world that preserves physics, information flow, mission logic and replayable evidence.",
    excerpt:
      "This long-form note examines why modern engagement simulators need mixed fidelity, side-specific information pictures, mission-level behaviour, bounded browser delivery and a causal event record instead of a persuasive animation.",
    author: "ReachDefence",
    publishedAt: "2026-08-09",
    updatedAt: "2026-08-09",
    readingTimeMinutes: 18,
    category: "Product Notes",
    tags: [
      "simulation architecture",
      "browser runtime",
      "evidence",
      "reproducibility",
      "mission modelling",
    ],
  },
];

export const BLOG_CATEGORIES: Array<"All" | BlogCategory> = [
  "All",
  "Analysis",
  "Tradecraft",
  "Case Notes",
  "Product Notes",
];

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}

export function isBlogSlug(slug: string) {
  return BLOG_POSTS.some((post) => post.slug === slug);
}

export function formatBlogDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
