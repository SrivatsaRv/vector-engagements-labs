import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { CompiledModelPack, CredibilityManifest, IntendedUseContract, ModelPackSource } from "../../lib/model-pack.ts";

export const intendedUseContracts = pgTable("intended_use_contracts", {
  id: text("id").notNull(),
  version: text("version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  definition: jsonb("definition").$type<IntendedUseContract>().notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const modelPackSources = pgTable("model_pack_sources", {
  id: text("id").notNull(),
  version: text("version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  definition: jsonb("definition").$type<ModelPackSource>().notNull(),
  contentHash: text("content_hash").notNull(),
  lifecycleStatus: text("lifecycle_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const credibilityManifests = pgTable("credibility_manifests", {
  id: text("id").notNull(),
  version: text("version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  subjectKind: text("subject_kind").notNull(),
  subjectId: text("subject_id").notNull(),
  subjectDigest: text("subject_digest").notNull(),
  manifest: jsonb("manifest").$type<CredibilityManifest>().notNull(),
  contentHash: text("content_hash").notNull(),
  approvalState: text("approval_state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const compiledModelPacks = pgTable("compiled_model_packs", {
  id: text("id").notNull(),
  version: text("version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  sourceId: text("source_id").notNull(),
  sourceVersion: text("source_version").notNull(),
  sourceHash: text("source_hash").notNull(),
  digest: text("digest").notNull(),
  payload: jsonb("payload").$type<CompiledModelPack>().notNull(),
  credibilityManifestId: text("credibility_manifest_id").notNull(),
  credibilityManifestVersion: text("credibility_manifest_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.id, table.version] }),
  index("compiled_model_packs_digest_idx").on(table.digest),
]);
