import assert from "node:assert/strict";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { canonicalJson } from "../lib/canonical-json.ts";

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
  assert.equal(catalog.platforms.length, 3);
  assert.equal(catalog.weapons.length, 8);
  assert.equal(catalog.simulationModels.length, 8);
  assert.equal(catalog.installations.length, 12);
  assert.equal(catalog.scenarioTemplates.length, 8);
  const template = catalog.scenarioTemplates.find(
    (item) => item.id === "a2a-crossing-intercept" && item.version === "1.0.0",
  );
  assert.ok(template);
  assert.equal(template.schema_version, "vector.scenario.v1");
  assert.match(template.content_hash, /^[0-9a-f]{64}$/);
  assert.equal(template.engine_version, "browser-point-mass-v0.5");

  const mathPage = await fetch(`${baseUrl}/math`);
  assert.equal(mathPage.status, 200);
  const mathHtml = await mathPage.text();
  assert.match(mathHtml, /Math behind VECTOR/);
  assert.match(mathHtml, /How a displayed result is traced/);
  const frames = [{ t: 0 }];
  const frameHash = createHash("sha256")
    .update(canonicalJson(frames))
    .digest("hex");

  const stalePackage = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "a2a-crossing-intercept",
      scenarioVersion: "1.0.0",
      engineVersion: "browser-point-mass-v0.5",
      scenarioSchemaVersion: template.schema_version,
      scenarioContentHash: "0".repeat(64),
      compiledScenario: { id: "configured-a2a", version: "0.5.0" },
      frameHash,
      draftRevision: 0,
      blueForce: {},
      redForce: {},
      initialState: {},
      environment: {},
      modelAssumptions: {
        report: { createdAt: new Date().toISOString(), result: { frames } },
      },
    }),
  });
  assert.equal(stalePackage.status, 409);

  const saved = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "a2a-crossing-intercept",
      scenarioVersion: "1.0.0",
      engineVersion: "browser-point-mass-v0.5",
      scenarioSchemaVersion: template.schema_version,
      scenarioContentHash: template.content_hash,
      compiledScenario: { id: "configured-a2a", version: "0.5.0" },
      frameHash,
      draftRevision: 0,
      blueForce: { platformId: "su-30mki" },
      redForce: { platformId: "f-16c-block52-paf" },
      initialState: { seed: 42 },
      environment: { atmosphere: "NASA_EDUCATIONAL_STANDARD" },
      modelAssumptions: {
        report: {
          createdAt: new Date().toISOString(),
          result: { frames },
        },
      },
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
  assert.equal(loadedPayload.run.scenarioContentHash, template.content_hash);
  assert.equal(loadedPayload.run.frameHash, frameHash);
  assert.ok(loadedPayload.run.modelAssumptions.report);
  assert.equal("scenario_id" in loadedPayload.run, false);

  const missing = await fetch(`${baseUrl}/api/runs?id=missing-run`);
  assert.equal(missing.status, 404);
  process.stdout.write("application save/report contract verified\n");
} finally {
  if (createdId) {
    await sql`DELETE FROM saved_run_snapshots WHERE id = ${createdId}`;
  }
  await sql.end();
}
