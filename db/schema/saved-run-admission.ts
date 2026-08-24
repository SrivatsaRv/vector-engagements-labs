import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const savedRunAdmissionSlots = pgTable("saved_run_admission_slots", {
  slot: integer("slot").primaryKey(),
  leaseId: text("lease_id"),
  leasedUntil: timestamp("leased_until", { withTimezone: true }),
});

export const anonymousSavedRunUsage = pgTable("anonymous_saved_run_usage", {
  actorHash: text("actor_hash").notNull(),
  usageDay: timestamp("usage_day", { withTimezone: false, mode: "date" }).notNull(),
  acceptedRuns: integer("accepted_runs").notNull(),
}, (table) => [primaryKey({ columns: [table.actorHash, table.usageDay] })]);
