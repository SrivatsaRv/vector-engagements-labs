import type { ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { marked, type Tokens } from "marked";
import { BlogEditorialDiagram } from "@/components/BlogEditorialDiagram";
import { BlogShareAndComments } from "@/components/BlogShareAndComments";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { ProductHeader } from "@/components/ProductHeader";
import { formatBlogDate } from "@/lib/blog";
import { renderBlogMarkdown } from "@/lib/blog-markdown";
import {
  blogAbsoluteUrl,
  blogCanonicalUrl,
  BLOG_POSTS,
  getBlogPost,
} from "@/lib/blog.server";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function absoluteAssetUrl(path: string) {
  return new URL(path, process.env.SITE_URL || "https://labs.reachdefence.com").toString();
}

const EDITORIAL_DIAGRAMS = {
  "causal-simulation-loop": {
    src: "/blog/diagrams/causal-simulation-loop.webp",
    alt: "Causal simulation loop showing world state, observation, bounded decisions, actions, effects, and model-time ordering.",
    title: "Causal simulation loop",
    caption:
      "One evolving physical state produces bounded observations and decisions; actions return as recorded effects on that same world.",
  },
  "one-record-many-views": {
    src: "/blog/diagrams/one-record-many-views.webp",
    alt: "One record, six synchronized views: 2D command, 3D spatial, event timeline, information picture, telemetry, and report.",
    title: "One record, six synchronized views",
    caption:
      "Every analytical surface reads the same frames, events, tracks, and provenance, so disagreement is a release failure rather than a visual detail.",
  },
} as const;

type EditorialDiagramId = keyof typeof EDITORIAL_DIAGRAMS;

function renderMarkdown(tokens: Tokens.Generic[]): ReactNode[] {
  return tokens.flatMap((token, index) => {
    switch (token.type) {
      case "code":
        if (token.lang === "editorial-diagram") {
          const diagramId = token.text.trim() as EditorialDiagramId;
          const diagram = EDITORIAL_DIAGRAMS[diagramId];
          if (diagram) {
            return [
              <BlogEditorialDiagram
                key={`editorial-diagram-${index}`}
                {...diagram}
              />,
            ];
          }
        }
        if (token.lang === "mermaid") {
          return [<MermaidDiagram key={`mermaid-${index}`} code={token.text} />];
        }
        return [
          <pre key={`pre-${index}`} className="blog-post-code">
            <code>{token.text}</code>
          </pre>,
        ];
      default:
        return renderBlogMarkdown([token]);
    }
  });
}

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const image = post.thumbnail ? absoluteAssetUrl(post.thumbnail) : "https://labs.reachdefence.com/og.png";

  return {
    title: `${post.title} | Vector Engagement Labs`,
    description: post.summary,
    keywords: post.tags,
    alternates: {
      canonical: blogCanonicalUrl(post.slug),
    },
    openGraph: {
      title: `${post.title} | Vector Engagement Labs`,
      description: post.summary,
      url: blogAbsoluteUrl(post.slug),
      siteName: "Vector Engagement Labs",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: post.thumbnailAlt ?? post.title,
        },
      ],
      type: "article",
      publishedTime: `${post.publishedAt}T00:00:00.000Z`,
      modifiedTime: `${post.updatedAt}T00:00:00.000Z`,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | Vector Engagement Labs`,
      description: post.summary,
      images: [image],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const image = post.thumbnail ? absoluteAssetUrl(post.thumbnail) : "https://labs.reachdefence.com/og.png";
  const tokens = marked.lexer(post.markdown) as Tokens.Generic[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    image,
    datePublished: `${post.publishedAt}T00:00:00.000Z`,
    dateModified: `${post.updatedAt}T00:00:00.000Z`,
    author: {
      "@type": "Organization",
      name: post.author,
      url: "https://reachdefence.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Vector Engagement Labs",
      url: "https://labs.reachdefence.com",
    },
    url: blogAbsoluteUrl(post.slug),
  };

  return (
    <main className="blog-post-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductHeader current="blog" />

      <article className="blog-post-shell">
        <Link href="/blogs" className="blog-post-back">
          <ArrowLeft size={14} />
          Back to blogs
        </Link>

        <header className="blog-post-header">
          <span className="blog-post-category">{post.category}</span>
          <h1>{post.title}</h1>
          <p>{post.summary}</p>

          <figure className="blog-post-cover">
            <Image
              src={post.thumbnail ?? "/og.png"}
              alt={post.thumbnailAlt ?? post.title}
              width={1200}
              height={630}
              className="blog-post-cover-image"
              sizes="(max-width: 900px) 100vw, 820px"
              priority
            />
          </figure>

          <dl className="blog-post-meta">
            <div>
              <dt>Written by</dt>
              <dd>{post.author}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatBlogDate(post.publishedAt)}</dd>
            </div>
            <div>
              <dt>Reading time</dt>
              <dd>{post.readingTimeMinutes} minutes</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatBlogDate(post.updatedAt)}</dd>
            </div>
          </dl>

          <ul className="blog-post-tags" aria-label="Article tags">
            {post.tags.map((tag) => (
              <li key={tag}>#{tag}</li>
            ))}
          </ul>
        </header>

        <section className="blog-post-content">{renderMarkdown(tokens)}</section>

        <BlogShareAndComments title={post.title} slug={post.slug} />
      </article>
    </main>
  );
}
