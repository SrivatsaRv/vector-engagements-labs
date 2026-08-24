import { boolean, customType, doublePrecision, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
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
