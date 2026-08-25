import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GENERIC_AAM_PERFORMANCE_PROFILES,
  admitGenericAamPerformanceWorkload,
  evaluateGenericAamPerformanceResults,
  measureGenericAamPerformanceBackends,
  resolveGenericAamPerformanceProfile,
} from "../scripts/lib/generic-aam-performance-evidence.mjs";

const appleM5 = {
  runtime: "v24.3.0",
  platform: "darwin",
  architecture: "arm64",
  cpu: "Apple M5",
  logicalCores: 10,
  memoryBytes: 17_179_869_184,
};

test("the generic-AAM performance profile is explicit, closed, and immutable", () => {
  assert.deepEqual(GENERIC_AAM_PERFORMANCE_PROFILES, {
    APPLE_M5_NODE24: {
      id: "APPLE_M5_NODE24",
      environment: appleM5,
      thresholdsP95Ms: { typescript: 30, "rust-wasm": 200 },
      warmupBatches: 3,
      measuredBatches: 20,
    },
  });
  assert.equal(resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", appleM5).id, "APPLE_M5_NODE24");
  assert.throws(() => resolveGenericAamPerformanceProfile("", appleM5), /explicit performance profile/i);
  assert.throws(() => resolveGenericAamPerformanceProfile("UNKNOWN", appleM5), /unknown performance profile/i);
  for (const [field, replacement] of [
    ["runtime", "v22.18.0"],
    ["platform", "linux"],
    ["architecture", "x64"],
    ["cpu", "Apple M4"],
    ["logicalCores", 8],
    ["memoryBytes", 34_359_738_368],
  ]) {
    assert.throws(
      () => resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", { ...appleM5, [field]: replacement }),
      /does not match/i,
      `profile accepted changed ${field}`,
    );
  }
});

test("performance admission verifies the immutable workload bytes before building inputs", () => {
  const workload = { id: "governed", cases: [{ id: "case" }] };
  const bytes = Buffer.from('{"id":"governed","cases":[{"id":"case"}]}');
  let calls = 0;
  const admitted = admitGenericAamPerformanceWorkload(workload, bytes, (candidate, candidateBytes) => {
    calls += 1;
    assert.equal(candidate, workload);
    assert.equal(candidateBytes, bytes);
    return { workloadId: "governed", sha256: "a".repeat(64), byteLength: bytes.byteLength, cases: 1 };
  });
  assert.equal(calls, 1);
  assert.deepEqual(admitted, {
    workload,
    identity: { workloadId: "governed", sha256: "a".repeat(64), byteLength: bytes.byteLength, cases: 1 },
  });
  assert.throws(
    () => admitGenericAamPerformanceWorkload(workload, Buffer.from("tampered"), () => { throw new Error("digest mismatch"); }),
    /digest mismatch/i,
  );
});

test("both backends retain all samples before aggregate threshold evaluation", () => {
  const calls = { typescript: 0, "rust-wasm": 0 };
  let clock = 0;
  const results = measureGenericAamPerformanceBackends({
    runners: {
      typescript: () => { calls.typescript += 1; return { frames: [1] }; },
      "rust-wasm": () => { calls["rust-wasm"] += 1; return { frames: [1] }; },
    },
    inputs: [{}],
    profile: GENERIC_AAM_PERFORMANCE_PROFILES.APPLE_M5_NODE24,
    now: () => { clock += 40; return clock; },
    memoryUsage: () => ({ rss: 1_000 }),
    serialize: () => "x",
  });
  assert.deepEqual(calls, { typescript: 23, "rust-wasm": 23 });
  assert.deepEqual(results.map(({ backend }) => backend), ["typescript", "rust-wasm"]);
  assert.ok(results.every(({ samplesMs }) => samplesMs.length === 20));
  assert.deepEqual(evaluateGenericAamPerformanceResults(results).map(({ backend }) => backend), ["typescript"]);
});

test("the benchmark emits exact repository and workload identity without mutable ceilings", () => {
  const benchmark = readFileSync(new URL("../scripts/benchmark-generic-aam.ts", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../scripts/lib/generic-aam-performance-evidence.mjs", import.meta.url), "utf8");
  const implementation = `${benchmark}\n${policy}`;
  assert.doesNotMatch(benchmark, /VECTOR_MAX_GENERIC_AAM_(?:TS|WASM)_P95_MS/);
  for (const required of [
    "commitSha",
    "worktreeClean",
    "sourceSha256",
    "corpusSha256",
    "decisionSha256",
    "expectedBatchSha256",
    "expectedFrames",
    "samplesMs",
    "rssGrowthBytes",
    "outputBytes",
  ]) assert.match(implementation, new RegExp(required));
});
