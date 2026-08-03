import assert from "node:assert/strict";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1 });

try {
  const [counts] = await sql`SELECT
    (SELECT count(*)::int FROM platform_variants) AS platforms,
    (SELECT count(*)::int FROM weapons) AS weapons,
    (SELECT count(*)::int FROM simulation_models) AS models,
    (SELECT count(*)::int FROM installations) AS installations,
    (SELECT count(*)::int FROM study_areas) AS study_areas,
    (SELECT count(*)::int FROM scenario_templates WHERE status='VALIDATED') AS scenarios`;
  // This release intentionally freezes the development catalog. Expanding it
  // is a separate research and source-governance task, not an integration side effect.
  assert.deepEqual(counts, {
    platforms: 3,
    weapons: 8,
    models: 8,
    installations: 21,
    study_areas: 6,
    scenarios: 8,
  });

  const [geospatial] = await sql`SELECT
    ST_SRID(location)::int AS srid,
    ST_IsValid(location) AS valid
    FROM installations LIMIT 1`;
  assert.equal(geospatial.srid, 4326);
  assert.equal(geospatial.valid, true);

  const pafInstallations = await sql`SELECT id, name, icao_code,
      ST_Y(location) AS latitude, ST_X(location) AS longitude, source_id
    FROM installations WHERE service='PAF' ORDER BY icao_code`;
  assert.equal(pafInstallations.length, 15);
  assert.ok(pafInstallations.every((item) => /^OP[A-Z]{2}$/.test(item.icao_code)));
  assert.ok(pafInstallations.every((item) => item.source_id === 'shield-paf-orbat-2026-05-19'));
  const nurKhan = pafInstallations.find((item) => item.icao_code === 'OPRN');
  assert.equal(Number(nurKhan?.latitude), 33.6167);
  assert.equal(Number(nurKhan?.longitude), 73.0992);

  const [studyArea] = await sql`SELECT
    ST_SRID(anchor)::int AS anchor_srid,
    ST_IsValid(boundary) AS boundary_valid,
    ST_Area(boundary::geography) > 0 AS has_area
    FROM study_areas LIMIT 1`;
  assert.equal(studyArea.anchor_srid, 4326);
  assert.equal(studyArea.boundary_valid, true);
  assert.equal(studyArea.has_area, true);

  const missingStudyAreas = await sql`SELECT id, version
    FROM scenario_templates
    WHERE study_area_id IS NULL`;
  assert.equal(missingStudyAreas.length, 0);

  const missingModels = await sql`SELECT sm.weapon_id
    FROM simulation_models sm LEFT JOIN weapons w ON w.id=sm.weapon_id
    WHERE w.id IS NULL`;
  assert.equal(missingModels.length, 0);

  const invalidPackages = await sql`SELECT id, version
    FROM scenario_templates
    WHERE schema_version <> 'vector.scenario.v2'
      OR engine_version <> 'browser-point-mass-v0.5'
      OR content_hash !~ '^[0-9a-f]{64}$'
      OR package IS NULL`;
  assert.equal(invalidPackages.length, 0);

  const versionDuplicates = await sql`SELECT id, version, count(*)::int AS copies
    FROM scenario_templates
    GROUP BY id, version
    HAVING count(*) <> 1`;
  assert.equal(versionDuplicates.length, 0);
  process.stdout.write(`database verified: ${JSON.stringify(counts)}\n`);
} finally {
  await sql.end();
}
