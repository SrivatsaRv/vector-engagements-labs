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
    (SELECT count(*)::int FROM installation_runways) AS runways,
    (SELECT count(*)::int FROM installation_runways WHERE mission_start_eligibility='PUBLIC_EDUCATIONAL') AS eligible_runways,
    (SELECT count(*)::int FROM environment_packs) AS environment_packs,
    (SELECT count(*)::int FROM study_areas) AS study_areas,
    (SELECT count(*)::int FROM scenario_templates WHERE status='VALIDATED') AS scenarios`;
  assert.equal(counts.platforms, 4);
  assert.equal(counts.weapons, 8);
  assert.equal(counts.models, 8);
  assert.ok(counts.compiled_model_packs >= 1, "current model pack is missing");
  assert.ok(counts.credibility_manifests >= 2, "current credibility manifests are missing");
  assert.ok(counts.intended_uses >= 1, "current intended use is missing");
  assert.equal(counts.installations, 21);
  assert.equal(counts.runways, 24);
  assert.equal(counts.eligible_runways, 12);
  assert.equal(counts.environment_packs, 12);
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

  const [regional] = await sql`SELECT
    count(*) FILTER (WHERE ST_SRID(coverage)=4326 AND ST_IsValid(coverage))::int AS valid_packs,
    count(DISTINCT study_area_id)::int AS covered_areas,
    bool_and(digest ~ '^sha256:[0-9a-f]{64}$' AND terrain_digest ~ '^sha256:[0-9a-f]{64}$' AND atmosphere_digest ~ '^sha256:[0-9a-f]{64}$') AS content_addressed
    FROM environment_packs`;
  assert.equal(regional.valid_packs, 12);
  assert.equal(regional.covered_areas, 6);
  assert.equal(regional.content_addressed, true);

  await assert.rejects(
    sql.begin(async (transaction) => {
      await transaction`UPDATE environment_packs
        SET payload='{}'::jsonb
        WHERE (id, version)=(SELECT id, version FROM environment_packs LIMIT 1)`;
    }),
    /environment pack content is immutable/u,
    "published environment pack content must reject in-place mutation",
  );

  const [runwayGeometry] = await sql`SELECT
    count(*) FILTER (WHERE centreline IS NOT NULL AND ST_SRID(centreline)=4326 AND ST_IsValid(centreline))::int AS sourced_geometry,
    count(*) FILTER (WHERE mission_start_eligibility='PUBLIC_EDUCATIONAL' AND centreline IS NOT NULL AND threshold_elevations_msl_m IS NOT NULL)::int AS eligible_complete
    FROM installation_runways`;
  assert.ok(runwayGeometry.sourced_geometry >= 12);
  assert.equal(runwayGeometry.eligible_complete, 12);

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
    WHERE schema_version NOT IN ('vector.scenario.v3', 'vector.scenario.v4')
      OR engine_version <> 'browser-point-mass-v0.5'
      OR content_hash !~ '^[0-9a-f]{64}$'
      OR intended_use_id <> ${CURRENT_INTENDED_USE_ID}
      OR intended_use_version <> ${CURRENT_INTENDED_USE_VERSION}
      OR model_pack_id <> ${CURRENT_MODEL_PACK_ID}
      OR model_pack_version <> ${CURRENT_MODEL_PACK_VERSION}
      OR model_pack_digest <> ${CURRENT_MODEL_PACK_DIGEST}
      OR package IS NULL
      OR (schema_version = 'vector.scenario.v4' AND package->'scenario'->'airMission'->>'schemaVersion' <> 'vector.air-mission.v1')`;
  assert.equal(invalidPackages.length, 0);

  // Production verifies the currently deployed v3 rows before applying the
  // forward-only migration. Migration 013 then fails closed unless every row
  // is v4, and this verifier checks the v4 mission envelope on the second pass.
  const [scenarioVersions] = await sql`SELECT
    count(*) FILTER (WHERE schema_version='vector.scenario.v3')::int AS v3,
    count(*) FILTER (WHERE schema_version='vector.scenario.v4')::int AS v4
    FROM scenario_templates`;
  assert.ok(
    (scenarioVersions.v3 === counts.scenarios && scenarioVersions.v4 === 0)
      || (scenarioVersions.v3 === 0 && scenarioVersions.v4 === counts.scenarios),
    "scenario templates must be wholly pre-migration v3 or post-migration v4",
  );

  const peaceDrive = await sql`SELECT id, variant, crew, data_status, engine_ids, radar_id, ew_id, datalink_id
    FROM platform_variants
    WHERE id IN ('f-16c-block52-paf', 'f-16d-block52-paf')
    ORDER BY id`;
  assert.deepEqual(peaceDrive.map((item) => ({
    id: item.id,
    variant: item.variant,
    crew: item.crew,
    data_status: item.data_status,
    ew_id: item.ew_id,
  })), [
    {
      id: "f-16c-block52-paf",
      variant: "F-16C Block 52 Peace Drive I",
      crew: 1,
      data_status: "PARTIAL",
      ew_id: null,
    },
    {
      id: "f-16d-block52-paf",
      variant: "F-16D Block 52 Peace Drive I",
      crew: 2,
      data_status: "PARTIAL",
      ew_id: null,
    },
  ]);
  assert.ok(peaceDrive.every((item) => item.engine_ids.includes("f100-pw-229")));
  assert.ok(peaceDrive.every((item) => item.radar_id === null && item.datalink_id === null));

  const contextAssertions = await sql`SELECT entity_id, condition_text, review_state
    FROM source_assertions
    WHERE entity_id IN ('f-16c-block52-paf', 'f-16d-block52-paf')
      AND condition_text IN ('Engine', 'Radar', 'Datalink', 'AIM-120C-5')`;
  assert.ok(contextAssertions.length >= 6);
  assert.ok(contextAssertions.every((item) => item.review_state === "CONTEXT_ONLY"));
  assert.equal(contextAssertions.filter((item) => item.review_state === "ACCEPTED").length, 0);
  const alqClaims = await sql`SELECT count(*)::int AS count
    FROM subsystems
    WHERE id='alq-211v9' OR designation ILIKE '%ALQ-211%'`;
  assert.equal(alqClaims[0].count, 0);
  const retiredAuthority = await sql`SELECT count(*)::int AS count
    FROM source_assertions
    WHERE entity_type='PLATFORM'
      AND entity_id IN ('f-16c-block52-paf', 'f-16d-block52-paf')
      AND (
        source_id='dsca-pakistan-15-80'
        OR condition_text='Defensive EW'
        OR value_text ILIKE '%ALQ-211%'
      )`;
  assert.equal(retiredAuthority[0].count, 0);
  const compatibilityAuthority = await sql`SELECT platform_id, weapon_id, status
    FROM platform_weapon_compatibility
    WHERE platform_id IN ('su-30mki', 'f-16c-block52-paf')`;
  assert.ok(compatibilityAuthority.length > 0);
  assert.ok(compatibilityAuthority.every((item) => item.status === "UNVERIFIED"));

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
