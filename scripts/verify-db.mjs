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
    (SELECT count(*)::int FROM scenario_templates WHERE status='VALIDATED') AS scenarios`;
  // This release intentionally freezes the development catalog. Expanding it
  // is a separate research and source-governance task, not an integration side effect.
  assert.deepEqual(counts, {
    platforms: 3,
    weapons: 8,
    models: 8,
    installations: 12,
    scenarios: 8,
  });

  const [geospatial] = await sql`SELECT
    ST_SRID(location)::int AS srid,
    ST_IsValid(location) AS valid
    FROM installations LIMIT 1`;
  assert.equal(geospatial.srid, 4326);
  assert.equal(geospatial.valid, true);

  const missingModels = await sql`SELECT sm.weapon_id
    FROM simulation_models sm LEFT JOIN weapons w ON w.id=sm.weapon_id
    WHERE w.id IS NULL`;
  assert.equal(missingModels.length, 0);

  const invalidPackages = await sql`SELECT id, version
    FROM scenario_templates
    WHERE schema_version <> 'vector.scenario.v1'
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
