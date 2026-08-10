# Blog publishing flow

Vector Engagement Labs blog content is published as a small content registry plus
Markdown body files.

## Authoring model

- Add or update the blog record in `lib/blog.ts`.
- Keep the article body in `content/blog/*.md` so the route can render the same
  text in the app shell and in tests.
- Set `thumbnail` and `thumbnailAlt` on the blog record when the post needs a
  custom preview image.
- Keep public image assets under `public/blog/diagrams/` or a similarly
  versioned subdirectory.

## Route behavior

- `/blog` remains a legacy redirect.
- `/blogs` is the browsable index with search, category filters, and list/grid
  views.
- `/blogs/posts/[slug]` renders the long-form article, cover image, editorial
  diagrams, Mermaid diagrams, share links, and persisted anonymous comments.

## Publishing steps

1. Update the blog record and article body.
2. Add or update the thumbnail asset.
3. Run the blog rendering and release checks.
4. Commit and push through the release branch.
5. Deploy the merged `main` SHA through the deployment workflow.

## Operational notes

- Anonymous comments are persisted through the blog comments API.
- The article page should not depend on runtime-only local state for content.
- Thumbnails are part of the public metadata contract and should always be
  treated as versioned assets.
