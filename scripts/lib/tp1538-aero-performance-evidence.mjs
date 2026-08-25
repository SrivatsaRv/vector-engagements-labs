import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const BACKENDS = Object.freeze(["typescript", "rust-wasm"]);
const WORKLOAD_KEYS = Object.freeze([
  "assemblyRequests",
  "configurationMix",
  "contentSha256",
  "corpusSha256",
  "deploymentClass",
  "expectedResultSha256",
  "id",
  "lookupRequests",
  "operationCount",
  "schemaVersion",
  "subject",
]);
const MIX_KEYS = Object.freeze(["assembly", "exactKnot", "interpolated", "outOfDomain", "unavailable"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} must have exact keys.`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export const TP1538_AERO_PERFORMANCE_PROFILES = deepFreeze({
  APPLE_M5_NODE24: {
    id: "APPLE_M5_NODE24",
    environment: {
      runtime: "v24.3.0",
      platform: "darwin",
      architecture: "arm64",
      cpu: "Apple M5",
      logicalCores: 10,
      memoryBytes: 17_179_869_184,
    },
    thresholds: {
      admissionP95Ms: 30_000,
      typescriptP95Ms: 100,
      rustWasmP95Ms: 500,
      workerInitializationMs: 30_000,
      workerRoundTripP95Ms: 1_000,
      rssGrowthBytes: 256 * 1024 * 1024,
      wasmBytes: 500_000,
    },
    warmupBatches: 3,
    measuredBatches: 20,
    operationsPerBatch: 4_096,
  },
});

export function resolveTp1538AeroPerformanceProfile(profileId, environment) {
  assert(profileId, "An explicit TP-1538 performance profile is required.");
  const profile = TP1538_AERO_PERFORMANCE_PROFILES[profileId];
  assert(profile, `Unknown TP-1538 performance profile: ${profileId}`);
  assert.deepEqual(environment, profile.environment, `Environment does not match TP-1538 performance profile ${profileId}.`);
  return profile;
}

export function admitTp1538AeroPerformanceRepository(commitSha, porcelainStatus) {
  assert.match(commitSha, /^[a-f0-9]{40}$/, "TP-1538 performance evidence requires an exact commit SHA.");
  assert.equal(porcelainStatus, "", "TP-1538 performance evidence worktree must be clean.");
  return Object.freeze({ commitSha, worktreeClean: true });
}

export function tp1538AeroPerformanceWorkloadContentSha256(workload) {
  const candidate = structuredClone(workload);
  candidate.contentSha256 = "";
  return sha256(canonical(candidate));
}

export function tp1538AeroPerformanceResultSha256(result) {
  return sha256(canonical(result));
}

export function admitTp1538AeroPerformanceWorkload(workload, workloadBytes, expectedRawSha256, validateRequests) {
  assert(workloadBytes instanceof Uint8Array && workloadBytes.byteLength >= 2 && workloadBytes.byteLength <= 8 * 1024 * 1024, "TP-1538 performance workload bytes exceed their closed bound.");
  assert.match(expectedRawSha256, /^[a-f0-9]{64}$/, "Expected TP-1538 performance workload raw identity is invalid.");
  assert.equal(sha256(workloadBytes), expectedRawSha256, "TP-1538 performance workload raw identity mismatch.");
  exactKeys(workload, WORKLOAD_KEYS, "TP-1538 performance workload");
  assert.equal(workload.schemaVersion, "vector.tp1538-aero-performance-workload.v1", "TP-1538 performance workload schema is invalid.");
  assert.equal(workload.subject, "NASA_GENERIC_F16", "TP-1538 performance workload subject is invalid.");
  assert.equal(workload.deploymentClass, "ENGINE_VERIFICATION_ONLY", "TP-1538 performance workload deployment class is invalid.");
  assert(typeof workload.id === "string" && workload.id.length > 0, "TP-1538 performance workload id is required.");
  assert.match(workload.corpusSha256, /^[a-f0-9]{64}$/, "TP-1538 performance workload corpus identity is invalid.");
  assert.match(workload.expectedResultSha256, /^[a-f0-9]{64}$/, "TP-1538 performance workload result identity is invalid.");
  assert.match(workload.contentSha256, /^[a-f0-9]{64}$/, "TP-1538 performance workload content identity is invalid.");
  assert.equal(workload.contentSha256, tp1538AeroPerformanceWorkloadContentSha256(workload), "TP-1538 performance workload content identity mismatch.");
  assert(Array.isArray(workload.lookupRequests) && Array.isArray(workload.assemblyRequests), "TP-1538 performance workload requests must be arrays.");
  assert.equal(workload.operationCount, 4_096, "TP-1538 performance workload must contain exactly 4,096 operations.");
  assert.equal(workload.lookupRequests.length + workload.assemblyRequests.length, workload.operationCount, "TP-1538 performance workload request count mismatch.");
  exactKeys(workload.configurationMix, MIX_KEYS, "TP-1538 performance configuration mix");
  for (const [name, count] of Object.entries(workload.configurationMix)) {
    assert(Number.isSafeInteger(count) && count >= 0, `TP-1538 performance configuration count ${name} is invalid.`);
  }
  assert.equal(Object.values(workload.configurationMix).reduce((sum, count) => sum + count, 0), workload.operationCount, "TP-1538 performance configuration mix count mismatch.");
  assert.equal(typeof validateRequests, "function", "TP-1538 performance workload requires an independent request validator.");
  validateRequests(workload.lookupRequests, workload.assemblyRequests, workload.expectedResultSha256);
  return deepFreeze(structuredClone({
    workload,
    identity: { rawSha256: expectedRawSha256, byteLength: workloadBytes.byteLength, contentSha256: workload.contentSha256 },
  }));
}

function percentile(sortedValues, fraction) {
  return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)];
}

export function measureTp1538AeroPerformanceBackends({ runners, profile, expectedResultSha256, now, memoryUsage, serialize }) {
  assert.deepEqual(Object.keys(runners), BACKENDS, "Both TP-1538 backends must be measured in canonical order.");
  assert.match(expectedResultSha256, /^[a-f0-9]{64}$/, "TP-1538 measured result identity is invalid.");
  return BACKENDS.map((backend) => {
    const run = runners[backend];
    for (let index = 0; index < profile.warmupBatches; index += 1) run();
    const rssBefore = memoryUsage().rss;
    let outputBytes = 0;
    const samplesMs = Array.from({ length: profile.measuredBatches }, () => {
      const started = now();
      const result = run();
      const elapsed = now() - started;
      assert.equal(tp1538AeroPerformanceResultSha256(result), expectedResultSha256, `${backend} TP-1538 measured semantic result mismatch.`);
      outputBytes = Buffer.byteLength(serialize(result));
      return elapsed;
    }).sort((left, right) => left - right);
    const rssGrowthBytes = Math.max(0, memoryUsage().rss - rssBefore);
    return {
      backend,
      warmupBatches: profile.warmupBatches,
      measuredBatches: samplesMs.length,
      operationsPerBatch: profile.operationsPerBatch,
      outputBytes,
      expectedResultSha256,
      samplesMs: samplesMs.map((sample) => Number(sample.toFixed(3))),
      p50Ms: Number(percentile(samplesMs, 0.5).toFixed(3)),
      p95Ms: Number(percentile(samplesMs, 0.95).toFixed(3)),
      p99Ms: Number(percentile(samplesMs, 0.99).toFixed(3)),
      maxMs: Number(samplesMs.at(-1).toFixed(3)),
      rssGrowthBytes,
      thresholdP95Ms: backend === "typescript" ? profile.thresholds.typescriptP95Ms : profile.thresholds.rustWasmP95Ms,
      thresholdRssGrowthBytes: profile.thresholds.rssGrowthBytes,
    };
  });
}

export function evaluateTp1538AeroPerformanceResults(results) {
  assert.deepEqual(results.map(({ backend }) => backend), BACKENDS, "Both TP-1538 performance results are required.");
  return results.flatMap(({ backend, p95Ms, thresholdP95Ms, rssGrowthBytes, thresholdRssGrowthBytes }) => [
    ...(p95Ms > thresholdP95Ms ? [{ backend, metric: "p95Ms", actual: p95Ms, threshold: thresholdP95Ms }] : []),
    ...(rssGrowthBytes > thresholdRssGrowthBytes ? [{ backend, metric: "rssGrowthBytes", actual: rssGrowthBytes, threshold: thresholdRssGrowthBytes }] : []),
  ]);
}
