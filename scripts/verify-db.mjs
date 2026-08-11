import assert from "node:assert/strict";
import postgres from "postgres";
import {
  CURRENT_INTENDED_USE_ID,
  CURRENT_INTENDED_USE_VERSION,
  CURRENT_MODEL_PACK_DIGEST,
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "../lib/reference-model-pack.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1 });

try {
  const [counts] = await sql`SELECT
    (SELECT count(*)::int FROM platform_variants) AS platforms,
    (SELECT count(*)::int FROM weapons) AS weapons,
    (SELECT count(*)::int FROM simulation_models) AS models,
    (SELECT count(*)::int FROM compiled_model_packs) AS compiled_model_packs,
    (SELECT count(*)::int FROM credibility_manifests) AS credibility_manifests,
    (SELECT count(*)::int FROM intended_use_contracts) AS intended_uses,
    (SELECT count(*)::int FROM installations) AS installations,
    (SELECT count(*)::int FROM study_areas) AS study_areas,
    (SELECT count(*)::int FROM scenario_templates WHERE status='VALIDATED') AS scenarios`;
  assert.equal(counts.platforms, 3);
  assert.equal(counts.weapons, 8);
  assert.equal(counts.models, 8);
  assert.ok(counts.compiled_model_packs >= 1, "current model pack is missing");
  assert.ok(counts.credibility_manifests >= 2, "current credibility manifests are missing");
  assert.ok(counts.intended_uses >= 1, "current intended use is missing");
  assert.equal(counts.installations, 21);
  assert.equal(counts.study_areas, 6);
  assert.equal(counts.scenarios, 8);

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
    WHERE schema_version <> 'vector.scenario.v3'
      OR engine_version <> 'browser-point-mass-v0.5'
      OR content_hash !~ '^[0-9a-f]{64}$'
      OR intended_use_id <> ${CURRENT_INTENDED_USE_ID}
      OR intended_use_version <> ${CURRENT_INTENDED_USE_VERSION}
      OR model_pack_id <> ${CURRENT_MODEL_PACK_ID}
      OR model_pack_version <> ${CURRENT_MODEL_PACK_VERSION}
      OR model_pack_digest <> ${CURRENT_MODEL_PACK_DIGEST}
      OR package IS NULL`;
  assert.equal(invalidPackages.length, 0);

  const versionDuplicates = await sql`SELECT id, version, count(*)::int AS copies
    FROM scenario_templates
    GROUP BY id, version
    HAVING count(*) <> 1`;
  assert.equal(versionDuplicates.length, 0);

  const [modelPack] = await sql`SELECT p.id, p.version, p.digest,
      p.payload->>'digest' AS payload_digest,
      p.payload->>'unitSystem' AS unit_system,
      m.subject_digest, m.approval_state
    FROM compiled_model_packs p
    JOIN credibility_manifests m
      ON m.id=p.credibility_manifest_id AND m.version=p.credibility_manifest_version
    WHERE p.id=${CURRENT_MODEL_PACK_ID} AND p.version=${CURRENT_MODEL_PACK_VERSION}`;
  assert.deepEqual(modelPack, {
    id: CURRENT_MODEL_PACK_ID,
    version: CURRENT_MODEL_PACK_VERSION,
    digest: CURRENT_MODEL_PACK_DIGEST,
    payload_digest: CURRENT_MODEL_PACK_DIGEST,
    unit_system: "SI",
    subject_digest: CURRENT_MODEL_PACK_DIGEST,
    approval_state: "DRAFT",
  });
  process.stdout.write(`database verified: ${JSON.stringify(counts)}\n`);
} finally {
  await sql.end();
}
