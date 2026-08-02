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

const geometryPoint = customType<{ data: string }>({
  dataType() {
    return "geometry(Point,4326)";
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
    installationType: text("installation_type").notNull(),
    location: geometryPoint("location").notNull(),
    publicReference: boolean("public_reference").notNull().default(true),
    sourceId: text("source_id").notNull().references(() => sources.id),
  },
  (table) => [index("installations_location_gix").using("gist", table.location)],
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const savedRunSnapshots = pgTable("saved_run_snapshots", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  scenarioVersion: text("scenario_version").notNull(),
  engineVersion: text("engine_version").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
