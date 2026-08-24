import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const publicApiRateWindows = pgTable("public_api_rate_windows", {
  policyId: text("policy_id").notNull(),
  actorHash: text("actor_hash").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull(),
}, (table) => [primaryKey({ columns: [table.policyId, table.actorHash, table.windowStartedAt] })]);
