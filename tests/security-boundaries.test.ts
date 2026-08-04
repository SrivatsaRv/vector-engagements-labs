import assert from "node:assert/strict";
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

test("saved reports are recomputed from admitted scenario inputs", async () => {
  const verified = await buildVerifiedSavedRun(
    DEFAULT_SCENARIO_DEFINITION.scenario,
    DEFAULT_SCENARIO_DEFINITION,
    { schemaVersion: "vector.scenario.v2", contentHash: "a".repeat(64), draftRevision: 0 },
  );
  assert.ok(verified.result.frames.length > 1);
  assert.equal(verified.report.result, verified.result);
  assert.equal(verified.report.events[0]?.title, "Verified run started");
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
