import assert from "node:assert/strict";
import postgres from "postgres";
import {
  CURRENT_CREDIBILITY_MANIFEST_ID,
  CURRENT_CREDIBILITY_MANIFEST_VERSION,
  CURRENT_INTENDED_USE_ID,
  CURRENT_INTENDED_USE_VERSION,
  CURRENT_MODEL_PACK_DIGEST,
  CURRENT_MODEL_PACK_ID,
  CURRENT_MODEL_PACK_VERSION,
} from "../lib/reference-model-pack.ts";

const baseUrl = process.env.VECTOR_URL ?? "http://127.0.0.1:4317";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1 });
let createdId;

async function waitForReady() {
  let lastError;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError ?? new Error("application did not become ready");
}

try {
  const health = await waitForReady();
  assert.equal(health.status, 200);
  const healthPayload = await health.json();
  assert.equal(healthPayload.status, "ready");
  assert.equal(healthPayload.publicApiAdmission.policyVersion, "public-api-admission.v1");
  assert.equal(healthPayload.publicApiAdmission.ready, true);
  assert.ok(
    ["postgres-fixed-window", "cloudflare-rate-limiting"].includes(
      healthPayload.publicApiAdmission.limiter,
    ),
    "health must expose an admitted runtime limiter without secrets",
  );

  const incomplete = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "a2a-crossing-intercept",
      scenarioVersion: "1.0.0",
    }),
  });
  assert.equal(incomplete.status, 400);

  const implicitLatest = await fetch(`${baseUrl}/api/runs`);
  assert.equal(implicitLatest.status, 400);

  const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.platforms.length, 4);
  assert.deepEqual(
    catalog.platforms
      .filter((item) => ["f-16c-block52-paf", "f-16d-block52-paf"].includes(item.id))
      .map((item) => ({
        id: item.id,
        variant: item.variant,
        crew: item.crew,
        dataStatus: item.data_status,
        radarId: item.radar_id,
        ewId: item.ew_id,
        datalinkId: item.datalink_id,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    [
      {
        id: "f-16c-block52-paf",
        variant: "F-16C Block 52 Peace Drive I",
        crew: 1,
        dataStatus: "PARTIAL",
        radarId: null,
        ewId: null,
        datalinkId: null,
      },
      {
        id: "f-16d-block52-paf",
        variant: "F-16D Block 52 Peace Drive I",
        crew: 2,
        dataStatus: "PARTIAL",
        radarId: null,
        ewId: null,
        datalinkId: null,
      },
    ],
  );
  assert.equal(catalog.weapons.length, 8);
  assert.equal(catalog.simulationModels.length, 8);
  assert.ok(catalog.compiledModelPacks.length >= 1);
  assert.ok(catalog.credibilityManifests.length >= 2);
  assert.deepEqual(
    catalog.intendedUses
      .map((item) => ({ id: item.id, version: item.version }))
      .sort((left, right) => left.version.localeCompare(right.version)),
    [
      { id: CURRENT_INTENDED_USE_ID, version: "1.0.0" },
      { id: CURRENT_INTENDED_USE_ID, version: CURRENT_INTENDED_USE_VERSION },
    ],
  );
  assert.equal(catalog.credibilityAdmissions.length, 1);
  const currentPack = catalog.compiledModelPacks.find(
    (item) => item.id === CURRENT_MODEL_PACK_ID && item.version === CURRENT_MODEL_PACK_VERSION,
  );
  const currentManifest = catalog.credibilityManifests.find(
    (item) => item.id === CURRENT_CREDIBILITY_MANIFEST_ID && item.version === CURRENT_CREDIBILITY_MANIFEST_VERSION,
  );
  assert.ok(currentPack);
  assert.ok(currentManifest);
  assert.equal(currentPack.digest, CURRENT_MODEL_PACK_DIGEST);
  assert.equal(currentPack.payload.unitSystem, "SI");
  assert.equal(
    currentManifest.subject_digest,
    currentPack.digest,
  );
  assert.ok(catalog.credibilityManifests.some((item) => item.subject_kind === "ENGINE"));
  assert.equal(catalog.credibilityAdmissions[0].state, "ADMITTED_WITH_LIMITATIONS");
  assert.equal(
    catalog.credibilityAdmissions[0].modelPack.digest,
    CURRENT_MODEL_PACK_DIGEST,
  );
  assert.ok(
    catalog.credibilityAdmissions[0].credibilityManifest.limitations.some(
      (item) => item.severity === "BLOCKING",
    ),
  );
  assert.equal(catalog.installations.length, 21);
  assert.equal(catalog.installationCatalogue.schemaVersion, "vector.installation-catalogue.v2");
  assert.equal(catalog.installationCatalogue.id, "vector.public-reference-installations");
  assert.equal(catalog.installationCatalogue.version, "2.0.0");
  assert.match(catalog.installationCatalogue.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(catalog.installationCatalogue.coverage.declaredServiceCoverage, "BOUNDED_PUBLIC_REFERENCE_FIXTURE");
  assert.equal(catalog.installationCatalogue.coverage.includedRecordCount, catalog.installations.length);
  assert.equal(catalog.installationCatalogue.coverage.runwayRecordCount, 24);
  assert.equal(catalog.installationCatalogue.coverage.eligibleRunwayRecordCount, 12);
  assert.ok(catalog.installationCatalogue.coverage.knownGaps.some((gap) => gap.includes("not a complete IAF or PAF")));
  assert.equal(catalog.installationCatalogue.runways.length, 24);
  assert.equal(
    catalog.installationCatalogue.runways.filter(
      (runway) => runway.missionStartEligibility === "PUBLIC_EDUCATIONAL",
    ).length,
    12,
  );
  assert.equal(catalog.runways.length, 24);
  assert.equal(
    catalog.runways.filter(
      (runway) => runway.mission_start_eligibility === "PUBLIC_EDUCATIONAL",
    ).length,
    12,
  );
  assert.ok(
    catalog.runways.every(
      (runway) =>
        runway.horizontal_datum === "WGS84" &&
        runway.vertical_datum === "MSL_REPORTED_BY_SOURCE" &&
        runway.provenance === "SOURCED_DATASET" &&
        /^sha256:[0-9a-f]{64}$/.test(runway.content_hash),
    ),
  );
  assert.ok(
    catalog.runways
      .filter((runway) => runway.mission_start_eligibility === "PUBLIC_EDUCATIONAL")
      .every(
        (runway) =>
          runway.centreline?.type === "LineString" &&
          runway.threshold_elevations_msl_m &&
          runway.closed_in_source === false,
      ),
  );
  assert.equal(catalog.environmentPacks.length, 12);
  assert.ok(
    catalog.environmentPacks.every(
      (environmentPack) =>
        environmentPack.schema_version === "vector.environment-pack.v1" &&
        environmentPack.version === "2.0.0" &&
        environmentPack.intended_use === "PUBLIC_EDUCATIONAL" &&
        environmentPack.provenance === "MIXED_SOURCE" &&
        environmentPack.coverage?.type === "Polygon" &&
        environmentPack.horizontal_datum === "WGS84" &&
        environmentPack.vertical_datum === "MSL" &&
        environmentPack.source_vertical_datum === "EGM2008" &&
        environmentPack.installation_catalogue_digest ===
          catalog.installationCatalogue.digest &&
        /^sha256:[0-9a-f]{64}$/.test(environmentPack.digest) &&
        /^sha256:[0-9a-f]{64}$/.test(environmentPack.terrain_digest) &&
        /^sha256:[0-9a-f]{64}$/.test(environmentPack.atmosphere_digest) &&
        environmentPack.valid_from &&
        environmentPack.valid_until &&
        environmentPack.superseded_at === null,
    ),
  );
  assert.deepEqual(
    catalog.studyAreas.map((item) => item.id).sort(),
    [
      "arabian-sea",
      "coastal-gujarat",
      "ladakh-high-altitude",
      "north-east-mountains",
      "north-punjab",
      "rajasthan-desert",
    ],
  );
  assert.equal(
    catalog.studyAreas.find((item) => item.id === "ladakh-high-altitude")
      .default_environment_preset_id,
    "ladakh-cold-clear",
  );
  const pafInstallations = catalog.installations.filter((item) => item.service === "PAF");
  assert.equal(pafInstallations.length, 15);
  assert.ok(pafInstallations.every((item) => item.icao_code && item.source_id === "shield-paf-orbat-2026-05-19"));
  assert.equal(catalog.scenarioTemplates.length, 9);
  const template = catalog.scenarioTemplates.find(
    (item) => item.id === "a2a-crossing-intercept" && item.version === "1.0.0",
  );
  assert.ok(template);
  assert.equal(template.schema_version, "vector.scenario.v4");
  assert.match(template.content_hash, /^[0-9a-f]{64}$/);
  assert.equal(template.engine_version, "browser-point-mass-v0.5");
  assert.equal(template.intended_use_id, template.package.intendedUse.id);
  assert.equal(template.model_pack_digest, template.package.modelPack.digest);

  const mathPage = await fetch(`${baseUrl}/math`);
  assert.equal(mathPage.status, 200);
  const mathHtml = await mathPage.text();
  assert.match(mathHtml, /Math behind Vector Engagement Labs/);
  assert.match(mathHtml, /How a displayed result is traced/);
  assert.match(mathHtml, /Subsonic trim flyout reproduced within tolerance/);
  assert.match(mathHtml, /maximum position error/);
  assert.match(mathHtml, /without changing the operational scenario models/);
  const stalePackage = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "a2a-crossing-intercept",
      scenarioVersion: "1.0.0",
      scenarioSchemaVersion: template.schema_version,
      scenarioContentHash: "0".repeat(64),
      draftRevision: 0,
      initialState: template.package.scenario,
    }),
  });
  assert.equal(stalePackage.status, 409);

  const saved = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "a2a-crossing-intercept",
      scenarioVersion: "1.0.0",
      scenarioSchemaVersion: template.schema_version,
      scenarioContentHash: template.content_hash,
      draftRevision: 0,
      initialState: template.package.scenario,
    }),
  });
  assert.equal(saved.status, 201);
  createdId = (await saved.json()).id;
  assert.equal(typeof createdId, "string");

  const loaded = await fetch(
    `${baseUrl}/api/runs?id=${encodeURIComponent(createdId)}`,
  );
  assert.equal(loaded.status, 200);
  const loadedPayload = await loaded.json();
  assert.equal(loadedPayload.run.scenarioId, "a2a-crossing-intercept");
  assert.equal(loadedPayload.run.engineVersion, "browser-point-mass-v0.5");
  assert.deepEqual(loadedPayload.run.intendedUse, template.package.intendedUse);
  assert.deepEqual(loadedPayload.run.modelPack, template.package.modelPack);
  assert.equal(loadedPayload.run.scenarioContentHash, template.content_hash);
  assert.match(loadedPayload.run.frameHash, /^[0-9a-f]{64}$/);
  assert.equal(loadedPayload.run.studyAreaId, "north-punjab");
  assert.equal(loadedPayload.run.spatialContext.id, "north-punjab");
  assert.ok(loadedPayload.run.modelAssumptions.report);
  assert.equal(
    loadedPayload.run.modelAssumptions.report.packageProvenance.modelPack.digest,
    template.package.modelPack.digest,
  );
  assert.ok(
    loadedPayload.run.modelAssumptions.report.packageProvenance.credibilityManifest.limitations.length > 0,
  );
  assert.equal(loadedPayload.run.modelAssumptions.verification.source, "server-recomputed");
  assert.ok(loadedPayload.run.modelAssumptions.report.result.frames.length > 1);
  assert.equal("scenario_id" in loadedPayload.run, false);

  const missing = await fetch(`${baseUrl}/api/runs?id=${crypto.randomUUID()}`);
  assert.equal(missing.status, 404);
  process.stdout.write("application save/report contract verified\n");
} finally {
  if (createdId) {
    await sql`DELETE FROM saved_run_snapshots WHERE id = ${createdId}`;
  }
  await sql.end();
}
