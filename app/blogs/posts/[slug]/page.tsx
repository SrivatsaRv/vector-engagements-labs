import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { marked, type Tokens } from "marked";
import articleMarkdown from "@/content/blog/what-engagement-simulators-need-to-model-in-2026.md?raw";
import { BlogEditorialDiagram } from "@/components/BlogEditorialDiagram";
import { BlogShareAndComments } from "@/components/BlogShareAndComments";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { ProductHeader } from "@/components/ProductHeader";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function toAbsoluteUrl(path: string) {
  return new URL(path, "https://labs.reachdefence.com").toString();
}

function renderInline(tokens: Tokens.Generic[] | undefined, fallback = "") {
  const source = tokens?.map((token) => token.raw).join("") ?? fallback;
  return { __html: marked.parseInline(source) };
}

function renderTableCell(cell: { text?: string; tokens?: Tokens.Generic[] }, key: string) {
  return <span key={key} dangerouslySetInnerHTML={renderInline(cell.tokens, cell.text ?? "")} />;
}

type ListItemToken = {
  text: string;
  tokens?: Tokens.Generic[];
};

type TableCellToken = {
  text?: string;
  tokens?: Tokens.Generic[];
};

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
      case "space":
        return [];
      case "hr":
        return [<hr key={`hr-${index}`} />];
      case "heading": {
        if (token.depth === 1) return [];
        if (token.depth === 2) {
          return [
            <h2 key={`h2-${index}`} dangerouslySetInnerHTML={renderInline(token.tokens, token.text)} />,
          ];
        }
        return [
          <h3 key={`h3-${index}`} dangerouslySetInnerHTML={renderInline(token.tokens, token.text)} />,
        ];
      }
      case "paragraph":
        return [
          <p key={`p-${index}`} dangerouslySetInnerHTML={renderInline(token.tokens, token.text)} />,
        ];
      case "list":
        if (token.ordered) {
          return [
            <ol key={`ol-${index}`}>
              {token.items.map((item: ListItemToken, itemIndex: number) => (
                <li key={`oli-${index}-${itemIndex}`}>
                  <span
                    dangerouslySetInnerHTML={renderInline(
                      item.tokens as Tokens.Generic[] | undefined,
                      item.text,
                    )}
                  />
                </li>
              ))}
            </ol>,
          ];
        }
        return [
          <ul key={`ul-${index}`}>
            {token.items.map((item: ListItemToken, itemIndex: number) => (
              <li key={`uli-${index}-${itemIndex}`}>
                <span
                  dangerouslySetInnerHTML={renderInline(
                    item.tokens as Tokens.Generic[] | undefined,
                    item.text,
                  )}
                />
              </li>
            ))}
          </ul>,
        ];
      case "table":
        return [
          <div key={`table-wrap-${index}`} className="blog-post-table-wrap">
            <table className="blog-post-table">
              <thead>
                <tr>
                  {token.header.map((cell: TableCellToken, cellIndex: number) => (
                    <th key={`th-${index}-${cellIndex}`}>{renderTableCell(cell, `thc-${cellIndex}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {token.rows.map((row: TableCellToken[], rowIndex: number) => (
                  <tr key={`row-${index}-${rowIndex}`}>
                    {row.map((cell: TableCellToken, cellIndex: number) => (
                      <td key={`td-${index}-${rowIndex}-${cellIndex}`}>
                        {renderTableCell(cell, `tdc-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        ];
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
      case "text":
        return [
          <p key={`text-${index}`} dangerouslySetInnerHTML={renderInline(token.tokens, token.text)} />,
        ];
      default:
        return [];
    }
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const image = post.thumbnail ? toAbsoluteUrl(post.thumbnail) : "https://labs.reachdefence.com/og.png";

  return {
    title: `${post.title} | Vector Engagement Labs`,
    description: post.summary,
    openGraph: {
      title: `${post.title} | Vector Engagement Labs`,
      description: post.summary,
      url: `https://labs.reachdefence.com/blogs/posts/${post.slug}`,
      siteName: "Vector Engagement Labs",
      images: [{ url: image }],
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

  const image = post.thumbnail ? toAbsoluteUrl(post.thumbnail) : "https://labs.reachdefence.com/og.png";
  const tokens = marked.lexer(articleMarkdown) as Tokens.Generic[];

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
    url: `https://labs.reachdefence.com/blogs/posts/${post.slug}`,
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

          {post.thumbnail ? (
            <figure className="blog-post-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="blog-post-cover-image"
                src={post.thumbnail}
                alt={post.thumbnailAlt ?? post.title}
                width={1536}
                height={1024}
                loading="eager"
                decoding="async"
              />
            </figure>
          ) : null}

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
