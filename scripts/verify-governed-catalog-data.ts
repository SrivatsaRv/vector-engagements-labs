import assert from "node:assert/strict";
import postgres from "postgres";
import { STUDY_AREAS } from "../lib/study-areas.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = postgres(connectionString, { max: 1 });

try {
  const rows = await sql`SELECT
    id,
    name,
    short_name,
    description,
    terrain_class,
    surface_elevation_m,
    ST_X(anchor) AS anchor_longitude,
    ST_Y(anchor) AS anchor_latitude,
    ST_XMin(Box2D(boundary)) AS west,
    ST_YMin(Box2D(boundary)) AS south,
    ST_XMax(Box2D(boundary)) AS east,
    ST_YMax(Box2D(boundary)) AS north,
    environment_presets,
    default_environment_preset_id,
    source_class
  FROM study_areas
  ORDER BY id`;

  const actual = rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    description: row.description,
    terrainClass: row.terrain_class,
    surfaceElevationM: Number(row.surface_elevation_m),
    surfaceElevationDatum: "MSL",
    anchor: {
      longitude: Number(row.anchor_longitude),
      latitude: Number(row.anchor_latitude),
    },
    bounds: [
      [Number(row.west), Number(row.south)],
      [Number(row.east), Number(row.north)],
    ],
    weatherPresets: row.environment_presets,
    defaultWeatherPresetId: row.default_environment_preset_id,
    sourceClass: row.source_class,
  }));
  const expected = [...STUDY_AREAS].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  assert.deepEqual(actual, expected);
  process.stdout.write(
    `governed catalog verified: ${actual.length} study areas match the versioned contract\n`,
  );
} finally {
  await sql.end();
}
