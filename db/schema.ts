import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  publishedAt: text("published_at"),
  sourceClass: text("source_class", {
    enum: ["OFFICIAL", "MANUFACTURER", "SECONDARY", "USER"],
  }).notNull(),
  notes: text("notes"),
});

export const platformVariants = sqliteTable("platform_variants", {
  id: text("id").primaryKey(),
  service: text("service", { enum: ["IAF", "PAF"] }).notNull(),
  country: text("country").notNull(),
  family: text("family").notNull(),
  variant: text("variant").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  crew: integer("crew"),
  emptyMassKg: real("empty_mass_kg"),
  internalFuelKg: real("internal_fuel_kg"),
  maxTakeoffMassKg: real("max_takeoff_mass_kg"),
  maxPublishedSpeedMach: real("max_published_speed_mach"),
  maxPublishedG: real("max_published_g"),
  engineId: text("engine_id"),
  radarId: text("radar_id"),
  ewId: text("ew_id"),
  datalinkId: text("datalink_id"),
  sourceId: text("source_id").references(() => sources.id),
  dataStatus: text("data_status", {
    enum: ["SOURCED", "PARTIAL", "UNSOURCED"],
  }).notNull(),
});

export const subsystems = sqliteTable("subsystems", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["ENGINE", "RADAR", "EW", "DATALINK", "RWR", "COUNTERMEASURE"],
  }).notNull(),
  designation: text("designation").notNull(),
  manufacturer: text("manufacturer"),
  description: text("description").notNull(),
  sourceId: text("source_id").references(() => sources.id),
  dataStatus: text("data_status", {
    enum: ["SOURCED", "PARTIAL", "UNSOURCED"],
  }).notNull(),
});

export const weapons = sqliteTable("weapons", {
  id: text("id").primaryKey(),
  country: text("country").notNull(),
  family: text("family").notNull(),
  variant: text("variant").notNull(),
  displayName: text("display_name").notNull(),
  category: text("category", {
    enum: [
      "AAM_BVR",
      "AAM_WVR",
      "ANTI_RADIATION",
      "AIR_TO_SURFACE",
      "SAM",
      "SURFACE_STRIKE",
    ],
  }).notNull(),
  seekerType: text("seeker_type"),
  guidanceStages: text("guidance_stages", { mode: "json" }).$type<string[]>(),
  launchSupport: text("launch_support", {
    enum: ["NONE", "OPTIONAL", "REQUIRED", "UNKNOWN"],
  }).notNull(),
  motorType: text("motor_type"),
  publishedRangeKm: real("published_range_km"),
  rangeCondition: text("range_condition"),
  publishedSpeedMach: real("published_speed_mach"),
  modelProfileId: text("model_profile_id").notNull(),
  modelVersion: text("model_version").notNull(),
  modelStudyLimitKm: real("model_study_limit_km").notNull(),
  modelPoweredFlightSeconds: real("model_powered_flight_seconds").notNull(),
  modelMaxSpeedMps: real("model_max_speed_mps").notNull(),
  modelTurnG: real("model_turn_g").notNull(),
  modelPostBurnLossMps2: real("model_post_burn_loss_mps2").notNull(),
  modelRationale: text("model_rationale").notNull(),
  sourceId: text("source_id").references(() => sources.id),
  dataStatus: text("data_status", {
    enum: ["SOURCED", "PARTIAL", "UNSOURCED"],
  }).notNull(),
});

export const platformStations = sqliteTable("platform_stations", {
  id: text("id").primaryKey(),
  platformId: text("platform_id")
    .notNull()
    .references(() => platformVariants.id),
  label: text("label").notNull(),
  stationGroup: text("station_group").notNull(),
  maxQuantity: integer("max_quantity").notNull().default(1),
  dataStatus: text("data_status", {
    enum: ["SOURCED", "PARTIAL", "UNSOURCED"],
  }).notNull(),
});

export const platformWeaponCompatibility = sqliteTable(
  "platform_weapon_compatibility",
  {
    platformId: text("platform_id")
      .notNull()
      .references(() => platformVariants.id),
    weaponId: text("weapon_id")
      .notNull()
      .references(() => weapons.id),
    stationGroup: text("station_group").notNull(),
    sourceId: text("source_id").references(() => sources.id),
    status: text("status", {
      enum: ["CONFIRMED", "CLAIMED", "UNVERIFIED"],
    }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.platformId, table.weaponId, table.stationGroup],
    }),
  ],
);

export const sourceAssertions = sqliteTable("source_assertions", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", {
    enum: ["PLATFORM", "SUBSYSTEM", "WEAPON", "COMPATIBILITY"],
  }).notNull(),
  entityId: text("entity_id").notNull(),
  fieldPath: text("field_path").notNull(),
  valueText: text("value_text").notNull(),
  unit: text("unit"),
  conditionText: text("condition_text"),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  confidence: real("confidence").notNull(),
  reviewState: text("review_state", {
    enum: ["ACCEPTED", "CONTRADICTED", "UNREVIEWED"],
  }).notNull(),
});

export const savedRunSnapshots = sqliteTable("saved_run_snapshots", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  scenarioVersion: text("scenario_version").notNull(),
  engineVersion: text("engine_version").notNull(),
  blueForce: text("blue_force", { mode: "json" }).notNull(),
  redForce: text("red_force", { mode: "json" }).notNull(),
  initialState: text("initial_state", { mode: "json" }).notNull(),
  environment: text("environment", { mode: "json" }).notNull(),
  modelAssumptions: text("model_assumptions", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
});
