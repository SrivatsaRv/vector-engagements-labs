import { withDatabase } from "@/db";
import { withObservedRoute } from "@/lib/observability/server";
import { BLOG_POSTS, isBlogSlug } from "@/lib/blog";
import {
  publicApiError,
  PublicApiError,
  readBoundedJson,
  shortString,
} from "@/lib/security/public-api";
import { enforceRateLimit } from "@/lib/security/runtime";

const MAX_BLOG_COMMENT_REQUEST_BYTES = 8 * 1024;

type BlogCommentRow = {
  id: string;
  slug: string;
  display_name: string | null;
  body: string;
  created_at: string | Date;
};

function serializeComment(row: BlogCommentRow) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function optionalDisplayName(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = shortString(value, 80, "display_name").trim();
  return candidate.length === 0 ? null : candidate;
}

function commentBody(value: unknown) {
  const candidate = shortString(value, 2000, "comment_body").trim();
  if (candidate.length < 2) throw new PublicApiError(400, "invalid_comment_body");
  return candidate;
}

export async function GET(request: Request) {
  return withObservedRoute("/api/blog-comments", request, async () => {
    try {
      await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
      const slug = new URL(request.url).searchParams.get("slug");
      if (!slug || !isBlogSlug(slug)) throw new PublicApiError(400, "invalid_blog_slug");
      const rows = await withDatabase((sql) => sql`
        SELECT id, slug, display_name, body, created_at
        FROM blog_post_comments
        WHERE slug = ${slug}
          AND moderation_state = 'published'
        ORDER BY created_at DESC
        LIMIT 100
      `);
      return Response.json({
        post: BLOG_POSTS.find((post) => post.slug === slug)?.title ?? slug,
        comments: rows.map((row) => serializeComment(row as unknown as BlogCommentRow)),
      }, {
        headers: { "cache-control": "private, no-store" },
      });
    } catch (error) {
      return publicApiError(error, 503);
    }
  });
}

export async function POST(request: Request) {
  return withObservedRoute("/api/blog-comments", request, async () => {
    try {
      await enforceRateLimit(request, "PUBLIC_API_RATE_LIMITER");
      const raw = await readBoundedJson(request, MAX_BLOG_COMMENT_REQUEST_BYTES);
      if (!raw || typeof raw !== "object") throw new PublicApiError(400, "invalid_blog_comment");
      const payload = raw as Record<string, unknown>;
      const slug = shortString(payload.slug, 160, "blog_slug");
      if (!isBlogSlug(slug)) throw new PublicApiError(400, "invalid_blog_slug");
      const displayName = optionalDisplayName(payload.displayName);
      const body = commentBody(payload.body);
      const id = crypto.randomUUID();
      const rows = await withDatabase((sql) => sql`
        INSERT INTO blog_post_comments
          (id, slug, display_name, body, moderation_state)
        VALUES
          (${id}, ${slug}, ${displayName}, ${body}, 'published')
        RETURNING id, slug, display_name, body, created_at
      `);
      return Response.json({ comment: serializeComment(rows[0] as unknown as BlogCommentRow) }, {
        status: 201,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return publicApiError(error, 503);
    }
  });
}
