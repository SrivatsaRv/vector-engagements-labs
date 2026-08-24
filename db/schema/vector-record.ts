import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { studyAreas } from "./geospatial.ts";

export const savedRunSnapshots = pgTable("saved_run_snapshots", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  scenarioVersion: text("scenario_version").notNull(),
  engineVersion: text("engine_version").notNull(),
  intendedUseId: text("intended_use_id").notNull(),
  intendedUseVersion: text("intended_use_version").notNull(),
  modelPackId: text("model_pack_id").notNull(),
  modelPackVersion: text("model_pack_version").notNull(),
  modelPackDigest: text("model_pack_digest").notNull(),
  scenarioSchemaVersion: text("scenario_schema_version").notNull(),
  scenarioContentHash: text("scenario_content_hash").notNull(),
  compiledScenario: jsonb("compiled_scenario").notNull(),
  frameHash: text("frame_hash").notNull(),
  draftRevision: integer("draft_revision").notNull(),
  blueForce: jsonb("blue_force").notNull(),
  redForce: jsonb("red_force").notNull(),
  initialState: jsonb("initial_state").notNull(),
  environment: jsonb("environment").notNull(),
  modelAssumptions: jsonb("model_assumptions").notNull(),
  studyAreaId: text("study_area_id").references(() => studyAreas.id),
  spatialContext: jsonb("spatial_context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
