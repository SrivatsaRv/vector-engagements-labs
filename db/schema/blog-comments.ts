import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const blogPostComments = pgTable("blog_post_comments", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  displayName: text("display_name"),
  body: text("body").notNull(),
  moderationState: text("moderation_state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("blog_post_comments_slug_created_idx").on(table.slug, table.createdAt)]);
