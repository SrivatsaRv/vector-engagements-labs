import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  TP1538_AERO_PERFORMANCE_PROFILES,
  admitTp1538AeroPerformanceRepository,
  admitTp1538AeroPerformanceWorkload,
  evaluateTp1538AeroPerformanceResults,
  measureTp1538AeroPerformanceBackends,
  resolveTp1538AeroPerformanceProfile,
  tp1538AeroPerformanceResultSha256,
  tp1538AeroPerformanceWorkloadContentSha256,
} from "../scripts/lib/tp1538-aero-performance-evidence.mjs";

const environment = {
  runtime: "v24.3.0",
  platform: "darwin",
  architecture: "arm64",
  cpu: "Apple M5",
  logicalCores: 10,
  memoryBytes: 17_179_869_184,
};

function workloadFixture() {
  const workload = {
    schemaVersion: "vector.tp1538-aero-performance-workload.v1",
    id: "TP1538_SYNTHETIC_POLICY_TEST",
    subject: "NASA_GENERIC_F16",
    deploymentClass: "ENGINE_VERIFICATION_ONLY",
    corpusSha256: "a".repeat(64),
    operationCount: 4_096,
    configurationMix: { assembly: 0, exactKnot: 4_096, interpolated: 0, outOfDomain: 0, unavailable: 0 },
    lookupRequests: Array.from({ length: 4_096 }, () => ({ id: "synthetic" })),
    assemblyRequests: [],
    expectedResultSha256: "b".repeat(64),
    contentSha256: "",
  };
  workload.contentSha256 = tp1538AeroPerformanceWorkloadContentSha256(workload);
  const bytes = Buffer.from(`${JSON.stringify(workload)}\n`);
  return { workload, bytes, rawSha256: createHash("sha256").update(bytes).digest("hex") };
}

test("the predeclared TP-1538 performance profile is closed and immutable", () => {
  const profile = resolveTp1538AeroPerformanceProfile("APPLE_M5_NODE24", environment);
  assert.equal(profile.operationsPerBatch, 4_096);
  assert.deepEqual(profile.thresholds, {
    admissionP95Ms: 30_000,
    typescriptP95Ms: 100,
    rustWasmP95Ms: 500,
    workerInitializationMs: 30_000,
    workerRoundTripP95Ms: 1_000,
    rssGrowthBytes: 268_435_456,
    wasmBytes: 500_000,
  });
  assert.throws(() => resolveTp1538AeroPerformanceProfile("", environment), /explicit/i);
  assert.throws(() => resolveTp1538AeroPerformanceProfile("APPLE_M5_NODE24", { ...environment, cpu: "Apple M4" }), /does not match/i);
  assert.throws(() => { TP1538_AERO_PERFORMANCE_PROFILES.APPLE_M5_NODE24.operationsPerBatch = 1; }, /read only|Cannot assign/);
});

test("repository and workload identities reject mutable measurement inputs before execution", () => {
  assert.deepEqual(admitTp1538AeroPerformanceRepository("a".repeat(40), ""), { commitSha: "a".repeat(40), worktreeClean: true });
  assert.throws(() => admitTp1538AeroPerformanceRepository("HEAD", ""), /commit SHA/i);
  assert.throws(() => admitTp1538AeroPerformanceRepository("a".repeat(40), " M transcript-a.json"), /worktree must be clean/i);
  const fixture = workloadFixture();
  let validations = 0;
  const admitted = admitTp1538AeroPerformanceWorkload(fixture.workload, fixture.bytes, fixture.rawSha256, (lookups, assemblies) => {
    validations += 1;
    assert.equal(lookups.length, 4_096);
    assert.equal(assemblies.length, 0);
  });
  assert.equal(validations, 1);
  assert.equal(admitted.identity.rawSha256, fixture.rawSha256);
  assert.throws(() => admitTp1538AeroPerformanceWorkload(fixture.workload, fixture.bytes, "0".repeat(64), () => {}), /raw identity mismatch/i);
  const weakened = structuredClone(fixture.workload);
  weakened.operationCount = 1;
  weakened.contentSha256 = tp1538AeroPerformanceWorkloadContentSha256(weakened);
  const weakenedBytes = Buffer.from(`${JSON.stringify(weakened)}\n`);
  const weakenedSha = createHash("sha256").update(weakenedBytes).digest("hex");
  assert.throws(() => admitTp1538AeroPerformanceWorkload(weakened, weakenedBytes, weakenedSha, () => {}), /exactly 4,096/i);
});

test("every measured backend batch retains samples and validates complete semantic output", () => {
  const validResult = { lookupResults: [{ state: "AVAILABLE", value: 0.1 }], assemblyResults: [] };
  const expectedResultSha256 = tp1538AeroPerformanceResultSha256(validResult);
  let clock = 0;
  const results = measureTp1538AeroPerformanceBackends({
    runners: { typescript: () => structuredClone(validResult), "rust-wasm": () => structuredClone(validResult) },
    profile: TP1538_AERO_PERFORMANCE_PROFILES.APPLE_M5_NODE24,
    expectedResultSha256,
    now: () => { clock += 10; return clock; },
    memoryUsage: () => ({ rss: 1_000 }),
    serialize: JSON.stringify,
  });
  assert.deepEqual(results.map(({ backend }) => backend), ["typescript", "rust-wasm"]);
  assert.ok(results.every(({ samplesMs }) => samplesMs.length === 20));
  assert.ok(results.every(({ operationsPerBatch }) => operationsPerBatch === 4_096));
  assert.deepEqual(evaluateTp1538AeroPerformanceResults(results), []);

  let calls = 0;
  assert.throws(() => measureTp1538AeroPerformanceBackends({
    runners: {
      typescript: () => (++calls < 5 ? structuredClone(validResult) : { lookupResults: [], assemblyResults: [] }),
      "rust-wasm": () => structuredClone(validResult),
    },
    profile: TP1538_AERO_PERFORMANCE_PROFILES.APPLE_M5_NODE24,
    expectedResultSha256,
    now: () => { clock += 1; return clock; },
    memoryUsage: () => ({ rss: 1_000 }),
    serialize: JSON.stringify,
  }), /measured semantic result mismatch/i);
});
