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
- The article renderer builds one ordered, typed React-node sequence from the
  parsed Markdown lines. Rendering does not depend on `flatMap` inference or a
  client-only repair step, so the production server build and source order are
  deterministic.
- The landing-page mini simulation is not blog content authority. It consumes
  the same admitted scenario definition, canonical result, authored-profile
  binding, and read-only presentation selector as the Lab; it cannot derive a
  profile from article text, display names, or rendered motion.

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

The typed-node renderer preserves this boundary. It emits only the repository's
approved Markdown components and treats raw HTML and disallowed link schemes as
inert text; changing the array construction does not create an HTML execution
path.

Scenario/profile labels shown by the landing mini simulation come only from
typed in-repository scenario definitions, and result statements come only from
canonical recorded state. Imported article or comment prose cannot select a
scenario, profile, model, event, effect, or report explanation, and profile
presentation never enables raw HTML or callback execution.

## Notes

Migration `013_air_mission_contract.sql` updates only existing scenario-template
packages and hashes. It does not read, rewrite, default, or otherwise change
anonymous blog-comment rows or their admission/lifecycle contract.
Migration `018_three_air_combat_studies.sql` is separated by the same boundary:
it forward-publishes scenario-package rows and their authored profile text, but
does not read or write blog posts or comments. A scenario title, summary,
profile label, leg label, limitation, or model-result explanation is declarative
simulation-catalogue content; none of it is comment content and none can be
promoted into a comment row by migration, seeding, or rendering.
Issue #61 adds governed environment/runway records only to the simulation
catalog. It does not promote those records into publishable blog comments or
change comment admission, moderation, storage, or rendering semantics.

The persisted comment table is declared in `db/schema/blog-comments.ts` and
re-exported by the single aggregate `db/schema.ts` Drizzle facade.

- Comments remain persisted through the blog comments API and are independent
  of article content and scenario-profile text.
- Comments are still anonymous and public on submission. Moderation, operator
  identity, abuse reporting, and retention are not delivered by this publishing
  contract; #70 owns those remaining security requirements.
- The blog does not require a code change for a new post as long as the file
  is valid and the asset path exists.
