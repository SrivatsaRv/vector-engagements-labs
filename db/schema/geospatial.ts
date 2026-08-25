import { boolean, customType, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sources } from "./catalog.ts";

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
const geometryLineString = customType<{ data: string }>({
  dataType() { return "geometry(LineString,4326)"; },
});

export const installations = pgTable("installations", {
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
  coordinateDatum: text("coordinate_datum").notNull().default("WGS84"),
  positionalUncertaintyM: doublePrecision("positional_uncertainty_m"),
  provenance: text("provenance").notNull().default("PUBLIC_REFERENCE"),
  reviewState: text("review_state").notNull().default("UNVERIFIED"),
}, (table) => [index("installations_location_gix").using("gist", table.location)]);

export const studyAreas = pgTable("study_areas", {
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
}, (table) => [
  index("study_areas_anchor_gix").using("gist", table.anchor),
  index("study_areas_boundary_gix").using("gist", table.boundary),
]);

export const installationRunways = pgTable("installation_runways", {
  id: text("id").primaryKey(),
  installationId: text("installation_id").notNull().references(() => installations.id),
  sourceRunwayId: text("source_runway_id").notNull(),
  sourceAirportIdent: text("source_airport_ident").notNull(),
  designator: text("designator").notNull(),
  trueHeadingDeg: doublePrecision("true_heading_deg"),
  reciprocalTrueHeadingDeg: doublePrecision("reciprocal_true_heading_deg"),
  lengthM: doublePrecision("length_m"),
  widthM: doublePrecision("width_m"),
  surface: text("surface"),
  closedInSource: boolean("closed_in_source").notNull(),
  centreline: geometryLineString("centreline"),
  thresholdElevationsMslM: jsonb("threshold_elevations_msl_m"),
  horizontalDatum: text("horizontal_datum").notNull(),
  verticalDatum: text("vertical_datum").notNull(),
  positionalUncertaintyM: doublePrecision("positional_uncertainty_m"),
  provenance: text("provenance").notNull(),
  reviewState: text("review_state").notNull(),
  missionStartEligibility: text("mission_start_eligibility").notNull(),
  limitation: text("limitation").notNull(),
  contentHash: text("content_hash").notNull(),
}, (table) => [
  index("installation_runways_centreline_gix").using("gist", table.centreline),
  index("installation_runways_installation_idx").on(table.installationId),
]);

export const environmentPacks = pgTable("environment_packs", {
  id: text("id").notNull(),
  version: text("version").notNull(),
  digest: text("digest").notNull(),
  schemaVersion: text("schema_version").notNull(),
  studyAreaId: text("study_area_id").notNull().references(() => studyAreas.id),
  weatherPresetId: text("weather_preset_id").notNull(),
  intendedUse: text("intended_use").notNull(),
  provenance: text("provenance").notNull(),
  coverage: geometryPolygon("coverage").notNull(),
  horizontalDatum: text("horizontal_datum").notNull(),
  verticalDatum: text("vertical_datum").notNull(),
  sourceVerticalDatum: text("source_vertical_datum").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  terrainDigest: text("terrain_digest").notNull(),
  atmosphereDigest: text("atmosphere_digest").notNull(),
  installationCatalogueDigest: text("installation_catalogue_digest").notNull(),
  payload: jsonb("payload").notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.id, table.version] }),
  index("environment_packs_coverage_gix").using("gist", table.coverage),
]);
