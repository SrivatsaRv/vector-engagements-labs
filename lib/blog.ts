export type BlogPostSummary = {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  updatedDate: string;
  author: string;
  tags: string[];
  readingTime: string;
};

export const BLOG_POSTS: BlogPostSummary[] = [
  {
    slug: "engagement-simulators-2026-revised",
    title: "What Engagement Simulators Need to Model in 2026",
    description:
      "A practical design note on world state, sensor truth, mission behaviour, mixed fidelity physics, browser execution, and explainable replay.",
    pubDate: "2026-08-09",
    updatedDate: "2026-08-11",
    author: "Srivatsa RV & Reach Defence",
    tags: ["Simulation", "Architecture", "Mermaid", "Defence", "WebAssembly"],
    readingTime: "6 min read",
  },
];

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}
