CREATE TABLE IF NOT EXISTS blog_post_comments (
  id text PRIMARY KEY,
  slug text NOT NULL,
  display_name text,
  body text NOT NULL,
  moderation_state text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(slug) BETWEEN 3 AND 160),
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80),
  CHECK (char_length(body) BETWEEN 2 AND 2000),
  CHECK (moderation_state IN ('published'))
);

CREATE INDEX IF NOT EXISTS blog_post_comments_slug_created_idx
  ON blog_post_comments(slug, created_at DESC);
