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
  thumbnail?: string;
  thumbnailAlt?: string;
};

export const BLOG_POSTS: BlogPostRecord[] = [
  {
    slug: "what-engagement-simulators-need-to-model-in-2026",
    title: "What Engagement Simulators Need to Model in 2026",
    summary:
      "A credible engagement simulator has to preserve physics, information state, mission logic, and a replayable evidence record rather than presenting geometry alone.",
    excerpt:
      "Vector Engagement Labs publishes practical notes on what makes a browser-delivered engagement workbench worth trusting: bounded models, observer-picture separation, deterministic replay, explainable operational results, and readable long-form analysis inside the product shell.",
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
    thumbnail: "/blog/diagrams/causal-simulation-loop.webp",
    thumbnailAlt:
      "Causal simulation loop showing world state, observation, bounded decisions, actions, effects, and model-time ordering.",
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
