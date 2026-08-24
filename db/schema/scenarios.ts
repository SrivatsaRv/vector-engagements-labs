import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { studyAreas } from "./geospatial.ts";

export const scenarioTemplates = pgTable("scenario_templates", {
  id: text("id").notNull(),
  version: text("version").notNull(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  package: jsonb("package").notNull(),
  schemaVersion: text("schema_version").notNull(),
  contentHash: text("content_hash").notNull(),
  engineVersion: text("engine_version").notNull(),
  intendedUseId: text("intended_use_id").notNull(),
  intendedUseVersion: text("intended_use_version").notNull(),
  modelPackId: text("model_pack_id").notNull(),
  modelPackVersion: text("model_pack_version").notNull(),
  modelPackDigest: text("model_pack_digest").notNull(),
  studyAreaId: text("study_area_id").references(() => studyAreas.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);
