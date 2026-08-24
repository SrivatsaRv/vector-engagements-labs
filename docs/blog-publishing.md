# Blog publishing contract

The blog is content-driven. Ops can publish by adding one markdown file under
`content/blog/` and, optionally, a thumbnail asset under `public/blog/thumbnails/`
or another existing public path.

## Source of truth

- File name becomes the slug.
- Markdown frontmatter defines the post metadata.
- Markdown body defines the rendered article.
- The blog index, article page, Open Graph metadata, Twitter metadata, and
  JSON-LD all read from the same post record.

## Frontmatter fields

Required:

- `title`
- `summary`
- `author`
- `publishedAt`
- `category`

Optional:

- `updatedAt`
- `excerpt`
- `readingTimeMinutes`
- `tags`
- `thumbnail`
- `thumbnailAlt`

`thumbnail` should point to a public asset path such as
`/blog/thumbnails/<slug>.webp`. If it is omitted, the site falls back to the
global blog image.

## SEO behavior

- The post page sets a canonical URL for `/blogs/posts/<slug>`.
- Open Graph and Twitter metadata use the post thumbnail when provided.
- JSON-LD `BlogPosting` output uses the same image and canonical URL.
- The blog index remains crawlable because it is server-rendered from the
  content manifest.

## Handoff workflow

1. Add or edit the markdown file.
2. Update the frontmatter.
3. Add or replace the thumbnail asset if the post needs one.
4. Run `make ci-local`.
5. Run `npm run blog:visual:verify` when the article includes editorial diagrams
   or visual assets that changed.

## Content safety

Markdown is not an HTML template language. Raw HTML is displayed as text.
Use standard Markdown for headings, emphasis, lists, tables, code, and links.
Links may use `https`, `http`, `mailto`, a same-origin path, a relative path,
or a fragment. Other schemes, including `javascript:` and `data:`, render as
inert text. Mermaid diagrams use strict mode; do not use HTML labels or
callback links in diagram code.

## Notes

The persisted comment table is declared in `db/schema/blog-comments.ts` and
re-exported by the single aggregate `db/schema.ts` Drizzle facade.

- Comments remain persisted through the blog comments API and are independent
  of article content.
- Comments are still anonymous and public on submission. Moderation, operator
  identity, abuse reporting, and retention are not delivered by this publishing
  contract; #70 owns those remaining security requirements.
- The blog does not require a code change for a new post as long as the file
  is valid and the asset path exists.
