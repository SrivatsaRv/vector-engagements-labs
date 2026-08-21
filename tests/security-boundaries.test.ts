import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { GET as metricsGet } from "../app/api/metrics/route";
import { POST as telemetryPost } from "../app/api/telemetry/route";
import { readBoundedJson } from "../lib/security/public-api";
import { buildVerifiedSavedRun, validateSavedScenario } from "../lib/security/saved-run";
import { DEFAULT_SCENARIO_DEFINITION } from "../lib/scenarios";

test("bounded JSON admission rejects an oversized streamed body", async () => {
  const request = new Request("https://labs.reachdefence.com/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(300) }),
  });
  await assert.rejects(() => readBoundedJson(request, 100), { code: "request_too_large" });
});

test("saved-run validation rejects unbounded routes and non-finite physics", () => {
  const input = structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario) as Record<string, unknown>;
  input.range = Number.POSITIVE_INFINITY;
  assert.throws(
    () => validateSavedScenario(input, DEFAULT_SCENARIO_DEFINITION),
    { code: "invalid_range" },
  );
});

test("saved-run admission rejects a client-selected engine", () => {
  const input = {
    ...structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario),
    engineBackend: "typescript",
  };
  assert.throws(
    () => validateSavedScenario(input, DEFAULT_SCENARIO_DEFINITION),
    { code: "scenario_engine_forbidden" },
  );
});

test("saved-run admission rejects retired tactical-decision controls instead of accepting a no-op", () => {
  for (const [field, value] of [
    ["blueDecision", "DEFEND"],
    ["redDecision", "DISENGAGE"],
    ["maneuver", "weave"],
    ["targetG", 9],
  ]) {
    const input = {
      ...structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario),
      [field]: value,
    };
    assert.throws(
      () => validateSavedScenario(input, DEFAULT_SCENARIO_DEFINITION),
      {
        code: "SCENARIO_RETIRED_BEHAVIOR_CONTROL",
        fieldPath: field,
      },
    );
  }
});

test("saved-run admission does not invent missing environment identity", () => {
  const unknownArea = {
    ...structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario),
    studyAreaId: "unknown-area",
  };
  assert.throws(
    () => validateSavedScenario(unknownArea, DEFAULT_SCENARIO_DEFINITION),
    { code: "ENVIRONMENT_STUDY_AREA_UNKNOWN" },
  );

  const unknownWeather = {
    ...structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario),
    weatherPresetId: "unknown-weather",
  };
  assert.throws(
    () => validateSavedScenario(unknownWeather, DEFAULT_SCENARIO_DEFINITION),
    { code: "ENVIRONMENT_WEATHER_PRESET_UNKNOWN" },
  );
});

test("saved-run admission rejects stale selected-installation and runway identities", () => {
  const scenario = structuredClone(DEFAULT_SCENARIO_DEFINITION.scenario) as Record<string, unknown>;
  scenario.spatialPlan = {
    blue: {
      position: { longitude: 75.633227, latitude: 32.236929, altitudeM: 8500, verticalDatum: "MSL" },
      headingDeg: 90,
      speedMps: 270,
      route: [],
      routeAcceptanceRadiiM: [],
      originReference: {
        schemaVersion: "vector.installation-origin.v1",
        installationId: "iaf-pathankot",
        sourceId: "iaf-stations-wikipedia",
        environment: { studyAreaId: "north-punjab", weatherPresetId: "north-punjab-clear" },
        runwayId: "rwy-09",
      },
    },
    red: {
      position: { longitude: 74.2, latitude: 31.8, altitudeM: 10_000, verticalDatum: "MSL" },
      headingDeg: 270,
      speedMps: 250,
      route: [],
      routeAcceptanceRadiiM: [],
    },
  };
  assert.throws(
    () => validateSavedScenario(scenario, DEFAULT_SCENARIO_DEFINITION),
    {
      code: "MISSION_RUNWAY_UNAVAILABLE",
      fieldPath: "spatialPlan.blue.originReference.runwayId",
    },
  );
});

test("saved reports are recomputed from admitted scenario inputs", async () => {
  const verified = await buildVerifiedSavedRun(
    DEFAULT_SCENARIO_DEFINITION.scenario,
    DEFAULT_SCENARIO_DEFINITION,
    { schemaVersion: "vector.scenario.v3", contentHash: "a".repeat(64), draftRevision: 0 },
  );
  assert.ok(verified.result.frames.length > 1);
  assert.equal(verified.report.result, verified.result);
  assert.equal(verified.report.events[0]?.title, "Verified run started");
  assert.equal(
    verified.report.packageProvenance?.modelPack?.digest,
    DEFAULT_SCENARIO_DEFINITION.modelPack.digest,
  );
  assert.ok(
    verified.report.packageProvenance?.credibilityManifest?.limitations.length,
  );
  assert.ok(
    verified.report.packageProvenance?.credibilityManifest?.limitations.some(
      (limitation) => /named-aircraft/.test(limitation.statement),
    ),
    "a saved report must retain the blocking named-aircraft limitation",
  );
});

test("public metrics are concealed without their bearer secret", async () => {
  const response = await metricsGet(new Request("https://labs.reachdefence.com/api/metrics"));
  assert.equal(response.status, 404);
});

test("browser telemetry cannot author run outcome or report metrics", async () => {
  const response = await telemetryPost(new Request("https://labs.reachdefence.com/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "scenario_run_completed",
      domain: "A2A",
      outcome: "intercept",
      engineVersion: "attacker-controlled",
    }),
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "unsupported_telemetry_event" });
});

test("blog comments keep anonymous persistence bounded by shared API guardrails", async () => {
  const [route, migration, schema] = await Promise.all([
    readFile(new URL("../app/api/blog-comments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/008_blog_post_comments.sql", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /enforceRateLimit\(request, "PUBLIC_API_RATE_LIMITER"\)/);
  assert.match(route, /readBoundedJson\(request, MAX_BLOG_COMMENT_REQUEST_BYTES\)/);
  assert.match(route, /INSERT INTO blog_post_comments/);
  assert.match(route, /moderation_state = 'published'/);
  assert.match(route, /displayName: row\.display_name/);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS blog_post_comments/);
  assert.match(migration, /display_name text/);
  assert.match(migration, /CHECK \(char_length\(body\) BETWEEN 2 AND 2000\)/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS blog_post_comments_slug_created_idx/);

  assert.match(schema, /pgTable\("blog_post_comments"/);
  assert.match(schema, /displayName: text\("display_name"\)/);
  assert.match(schema, /moderationState: text\("moderation_state"\)/);
});
