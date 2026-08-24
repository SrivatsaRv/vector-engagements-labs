import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERIC_AAM_PERFORMANCE_PROFILES,
  emitGenericAamPerformanceReport,
  evaluateGenericAamPerformanceResults,
  measureGenericAamPerformanceBackends,
  resolveGenericAamPerformanceProfile,
} from "../scripts/lib/generic-aam-performance-policy.mjs";

const appleM5Environment = {
  runtime: "v24.3.0",
  platform: "darwin",
  architecture: "arm64",
  cpu: "Apple M5",
  logicalCores: 10,
  memoryBytes: 17_179_869_184,
  githubActions: false,
  runnerOs: null,
  runnerArch: null,
  imageOs: null,
};

const hostedEnvironment = {
  runtime: "v22.18.0",
  platform: "linux",
  architecture: "x64",
  cpu: "AMD EPYC 7763 64-Core Processor",
  logicalCores: 4,
  memoryBytes: 17_179_869_184,
  githubActions: true,
  runnerOs: "Linux",
  runnerArch: "X64",
  imageOs: "ubuntu24",
};

test("generic-AAM performance profiles preserve independently calibrated ceilings", () => {
  assert.deepEqual(GENERIC_AAM_PERFORMANCE_PROFILES, {
    APPLE_M5_NODE24: {
      id: "APPLE_M5_NODE24",
      thresholdsP95Ms: { typescript: 30, "rust-wasm": 200 },
    },
    GITHUB_HOSTED_UBUNTU24_X64_NODE22: {
      id: "GITHUB_HOSTED_UBUNTU24_X64_NODE22",
      thresholdsP95Ms: { typescript: 65, "rust-wasm": 200 },
    },
  });
});

test("generic-AAM performance profile selection is explicit and environment-closed", () => {
  assert.equal(resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", appleM5Environment).id, "APPLE_M5_NODE24");
  assert.equal(
    resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", hostedEnvironment).id,
    "GITHUB_HOSTED_UBUNTU24_X64_NODE22",
  );

  assert.throws(() => resolveGenericAamPerformanceProfile("", appleM5Environment), /explicit performance profile/i);
  assert.throws(() => resolveGenericAamPerformanceProfile("UNREVIEWED", appleM5Environment), /unknown performance profile/i);
  for (const [field, value] of [
    ["runtime", "v22.18.0"],
    ["platform", "linux"],
    ["architecture", "x64"],
    ["cpu", "Apple M4"],
    ["githubActions", true],
  ]) {
    assert.throws(
      () => resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", { ...appleM5Environment, [field]: value }),
      /does not match/i,
      `Apple profile accepted mismatched ${field}`,
    );
  }
  for (const [field, value] of [
    ["runtime", "v24.3.0"],
    ["platform", "darwin"],
    ["architecture", "arm64"],
    ["githubActions", false],
    ["runnerOs", "macOS"],
    ["runnerArch", "ARM64"],
    ["imageOs", "ubuntu22"],
  ]) {
    assert.throws(
      () => resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", { ...hostedEnvironment, [field]: value }),
      /does not match/i,
      `hosted profile accepted mismatched ${field}`,
    );
  }
});

test("legacy threshold overrides cannot alter either closed performance profile", async () => {
  const benchmark = await readFile("scripts/benchmark-generic-aam.ts", "utf8");
  assert.doesNotMatch(benchmark, /VECTOR_MAX_GENERIC_AAM_(?:TS|WASM)_P95_MS/);
  assert.deepEqual(resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", appleM5Environment).thresholdsP95Ms, {
    typescript: 30,
    "rust-wasm": 200,
  });
  assert.deepEqual(
    resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", hostedEnvironment).thresholdsP95Ms,
    { typescript: 65, "rust-wasm": 200 },
  );
});

test("both generic-AAM backends are measured before thresholds are evaluated", () => {
  const calls = { typescript: 0, "rust-wasm": 0 };
  let clock = 0;
  const results = measureGenericAamPerformanceBackends({
    runners: {
      typescript: () => {
        calls.typescript += 1;
        return { frames: [1] };
      },
      "rust-wasm": () => {
        calls["rust-wasm"] += 1;
        return { frames: [1] };
      },
    },
    inputs: [{ id: "case" }],
    thresholdsP95Ms: { typescript: 30, "rust-wasm": 200 },
    now: () => {
      clock += 40;
      return clock;
    },
    memoryUsage: () => ({ rss: 1_000 }),
    serialize: () => "x",
  });

  assert.equal(calls.typescript, 23);
  assert.equal(calls["rust-wasm"], 23);
  assert.deepEqual(results.map((result) => result.backend), ["typescript", "rust-wasm"]);
  assert.ok(results.every((result) => result.samplesMs.length === 20));
  assert.deepEqual(
    evaluateGenericAamPerformanceResults(results).map((violation) => violation.backend),
    ["typescript"],
  );
});

test("complete results are emitted before aggregate benchmark failure", () => {
  const results = [
    {
      backend: "typescript",
      measuredBatches: 20,
      casesPerBatch: 15,
      outputFrames: 12_145,
      outputBytes: 11_000_238,
      samplesMs: Array.from({ length: 20 }, (_, index) => 46 + index / 10),
      p50Ms: 47,
      p95Ms: 52.163,
      p99Ms: 53,
      maxMs: 53,
      rssGrowthBytes: 10,
      thresholdP95Ms: 30,
    },
    {
      backend: "rust-wasm",
      measuredBatches: 20,
      casesPerBatch: 15,
      outputFrames: 12_145,
      outputBytes: 10_999_757,
      samplesMs: Array.from({ length: 20 }, (_, index) => 210 + index / 10),
      p50Ms: 211,
      p95Ms: 220,
      p99Ms: 221,
      maxMs: 221,
      rssGrowthBytes: 20,
      thresholdP95Ms: 200,
    },
  ];
  const output = [];
  const errors = [];
  const exitCode = emitGenericAamPerformanceReport({
    report: {
      schemaVersion: "vector.generic-aam-verification-performance.v2",
      workloadId: "workload",
      profileId: "APPLE_M5_NODE24",
      environment: appleM5Environment,
      results,
      nonclaims: [],
    },
    writeOutput: (value) => output.push(value),
    writeError: (value) => errors.push(value),
  });

  assert.equal(exitCode, 1);
  assert.equal(output.length, 1);
  assert.deepEqual(JSON.parse(output[0]).results, results);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /typescript.*52\.163.*30/i);
  assert.match(errors[0], /rust-wasm.*220.*200/i);
});
