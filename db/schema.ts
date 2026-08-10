import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  CompiledModelPack,
  CredibilityManifest,
  IntendedUseContract,
  ModelPackSource,
} from "../lib/model-pack.ts";

const geometryPoint = customType<{ data: string }>({
  dataType() {
    return "geometry(Point,4326)";
  },
});

const geometryPolygon = customType<{ data: string }>({
  dataType() {
    return "geometry(Polygon,4326)";
  },
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  sourceClass: text("source_class").notNull(),
  notes: text("notes"),
});

export const subsystems = pgTable("subsystems", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  designation: text("designation").notNull(),
  manufacturer: text("manufacturer"),
  description: text("description").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  dataStatus: text("data_status").notNull(),
});

export const platformVariants = pgTable("platform_variants", {
  id: text("id").primaryKey(),
  service: text("service").notNull(),
  country: text("country").notNull(),
  family: text("family").notNull(),
  variant: text("variant").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  crew: integer("crew"),
  engineIds: jsonb("engine_ids").$type<string[]>().notNull(),
  radarId: text("radar_id"),
  ewId: text("ew_id"),
  datalinkId: text("datalink_id"),
  rwrId: text("rwr_id"),
  countermeasureId: text("countermeasure_id"),
  domains: jsonb("domains").$type<string[]>().notNull(),
  defaultLoadout: jsonb("default_loadout").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  dataStatus: text("data_status").notNull(),
});

export const weapons = pgTable("weapons", {
  id: text("id").primaryKey(),
  country: text("country").notNull(),
  family: text("family").notNull(),
  variant: text("variant").notNull(),
  displayName: text("display_name").notNull(),
  category: text("category").notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  seekerType: text("seeker_type"),
  guidanceStages: jsonb("guidance_stages").$type<string[]>().notNull(),
  launchSupport: text("launch_support").notNull(),
  publishedRangeKm: doublePrecision("published_range_km"),
  rangeCondition: text("range_condition"),
  publishedSpeedMach: doublePrecision("published_speed_mach"),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  dataStatus: text("data_status").notNull(),
});

export const simulationModels = pgTable("simulation_models", {
  id: text("id").primaryKey(),
  weaponId: text("weapon_id").notNull().references(() => weapons.id),
  version: text("version").notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  propulsionKind: text("propulsion_kind").notNull(),
  launchMassKg: doublePrecision("launch_mass_kg").notNull(),
  dryMassKg: doublePrecision("dry_mass_kg").notNull(),
  poweredFlightSeconds: doublePrecision("powered_flight_seconds").notNull(),
  thrustNewtons: doublePrecision("thrust_newtons").notNull(),
  thrustTaperSpeedMps: doublePrecision("thrust_taper_speed_mps").notNull(),
  referenceAreaM2: doublePrecision("reference_area_m2").notNull(),
  dragCoefficient: doublePrecision("drag_coefficient").notNull(),
  navigationConstant: doublePrecision("navigation_constant").notNull(),
  maximumCommandG: doublePrecision("maximum_command_g").notNull(),
  seekerActivationRangeM: doublePrecision("seeker_activation_range_m").notNull(),
  datalinkUpdateSeconds: doublePrecision("datalink_update_seconds").notNull(),
  valueState: text("value_state").notNull(),
  rationale: text("rationale").notNull(),
});

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

export const platformWeaponCompatibility = pgTable(
  "platform_weapon_compatibility",
  {
    platformId: text("platform_id").notNull().references(() => platformVariants.id),
    weaponId: text("weapon_id").notNull().references(() => weapons.id),
    stationGroup: text("station_group").notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
    status: text("status").notNull(),
  },
  (table) => [primaryKey({ columns: [table.platformId, table.weaponId, table.stationGroup] })],
);

export const sourceAssertions = pgTable("source_assertions", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fieldPath: text("field_path").notNull(),
  valueText: text("value_text").notNull(),
  unit: text("unit"),
  conditionText: text("condition_text"),
  sourceId: text("source_id").notNull().references(() => sources.id),
  confidence: doublePrecision("confidence").notNull(),
  reviewState: text("review_state").notNull(),
});

export const installations = pgTable(
  "installations",
  {
    id: text("id").primaryKey(),
    service: text("service").notNull(),
    name: text("name").notNull(),
    icaoCode: text("icao_code"),
    elevationFt: integer("elevation_ft"),
    runwayInfo: text("runway_info"),
    installationType: text("installation_type").notNull(),
    location: geometryPoint("location").notNull(),
    publicReference: boolean("public_reference").notNull().default(true),
    sourceId: text("source_id").notNull().references(() => sources.id),
  },
  (table) => [index("installations_location_gix").using("gist", table.location)],
);

export const studyAreas = pgTable(
  "study_areas",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    description: text("description").notNull(),
    terrainClass: text("terrain_class").notNull(),
    surfaceElevationM: doublePrecision("surface_elevation_m").notNull(),
    anchor: geometryPoint("anchor").notNull(),
    boundary: geometryPolygon("boundary").notNull(),
    environmentPresets: jsonb("environment_presets").notNull(),
    defaultEnvironmentPresetId: text("default_environment_preset_id").notNull(),
    sourceClass: text("source_class").notNull(),
  },
  (table) => [
    index("study_areas_anchor_gix").using("gist", table.anchor),
    index("study_areas_boundary_gix").using("gist", table.boundary),
  ],
);

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

export const blogPostComments = pgTable("blog_post_comments", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  displayName: text("display_name"),
  body: text("body").notNull(),
  moderationState: text("moderation_state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("blog_post_comments_slug_created_idx").on(table.slug, table.createdAt)]);
