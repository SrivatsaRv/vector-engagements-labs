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
  imageVersion: null,
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
  imageVersion: "20260816.277.1",
};

test("generic-AAM performance profiles preserve independently calibrated ceilings", () => {
  assert.deepEqual(GENERIC_AAM_PERFORMANCE_PROFILES, {
    APPLE_M5_NODE24: {
      id: "APPLE_M5_NODE24",
      thresholdsP95Ms: { typescript: 30, "rust-wasm": 200 },
      boundProfileIdentity: appleM5Environment,
    },
    GITHUB_HOSTED_UBUNTU24_X64_NODE22: {
      id: "GITHUB_HOSTED_UBUNTU24_X64_NODE22",
      thresholdsP95Ms: { typescript: 65, "rust-wasm": 380 },
      boundProfileIdentity: {
        runtime: "v22.18.0",
        platform: "linux",
        architecture: "x64",
        githubActions: true,
        runnerOs: "Linux",
        runnerArch: "X64",
        imageOs: "ubuntu24",
      },
    },
  });
});

test("generic-AAM performance profile selection is explicit and environment-closed", () => {
  const appleProfile = resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", appleM5Environment);
  assert.equal(appleProfile.id, "APPLE_M5_NODE24");
  assert.deepEqual(appleProfile.boundProfileIdentity, appleM5Environment);
  assert.deepEqual(appleProfile.observedContext, {});

  const hostedProfile = resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", hostedEnvironment);
  assert.equal(hostedProfile.id, "GITHUB_HOSTED_UBUNTU24_X64_NODE22");
  assert.deepEqual(hostedProfile.boundProfileIdentity, {
    runtime: "v22.18.0",
    platform: "linux",
    architecture: "x64",
    githubActions: true,
    runnerOs: "Linux",
    runnerArch: "X64",
    imageOs: "ubuntu24",
  });
  assert.deepEqual(hostedProfile.observedContext, {
    cpu: hostedEnvironment.cpu,
    logicalCores: hostedEnvironment.logicalCores,
    memoryBytes: hostedEnvironment.memoryBytes,
    imageVersion: "20260816.277.1",
  });

  assert.throws(() => resolveGenericAamPerformanceProfile("", appleM5Environment), /explicit performance profile/i);
  assert.throws(() => resolveGenericAamPerformanceProfile("UNREVIEWED", appleM5Environment), /unknown performance profile/i);
  for (const [field, value] of [
    ["runtime", "v22.18.0"],
    ["platform", "linux"],
    ["architecture", "x64"],
    ["cpu", "Apple M4"],
    ["logicalCores", 8],
    ["memoryBytes", 34_359_738_368],
    ["githubActions", true],
    ["runnerOs", "macOS"],
    ["runnerArch", "ARM64"],
    ["imageOs", "macos15"],
    ["imageVersion", "20260816.277.1"],
  ]) {
    assert.throws(
      () => resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", { ...appleM5Environment, [field]: value }),
      /does not match/i,
      `Apple profile accepted mismatched ${field}`,
    );
    const missing = { ...appleM5Environment };
    delete missing[field];
    assert.throws(
      () => resolveGenericAamPerformanceProfile("APPLE_M5_NODE24", missing),
      /does not match/i,
      `Apple profile accepted missing ${field}`,
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
    const missing = { ...hostedEnvironment };
    delete missing[field];
    assert.throws(
      () => resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", missing),
      /does not match/i,
      `hosted profile accepted missing ${field}`,
    );
  }
});

test("hosted hardware and image release remain observations, never profile authority", () => {
  const baseline = resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", hostedEnvironment);
  const changedEnvironment = {
    ...hostedEnvironment,
    cpu: "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz",
    logicalCores: 8,
    memoryBytes: 34_359_738_368,
    imageVersion: "20260823.300.1",
  };
  const changed = resolveGenericAamPerformanceProfile("GITHUB_HOSTED_UBUNTU24_X64_NODE22", changedEnvironment);

  assert.deepEqual(changed.boundProfileIdentity, baseline.boundProfileIdentity);
  assert.deepEqual(changed.observedContext, {
    cpu: changedEnvironment.cpu,
    logicalCores: changedEnvironment.logicalCores,
    memoryBytes: changedEnvironment.memoryBytes,
    imageVersion: changedEnvironment.imageVersion,
  });
  for (const field of ["cpu", "logicalCores", "memoryBytes", "imageVersion"]) {
    assert.equal(Object.hasOwn(changed.boundProfileIdentity, field), false, `${field} became hosted profile authority`);

    const withoutObservation = { ...hostedEnvironment };
    delete withoutObservation[field];
    const missing = resolveGenericAamPerformanceProfile(
      "GITHUB_HOSTED_UBUNTU24_X64_NODE22",
      withoutObservation,
    );
    assert.equal(missing.observedContext[field], null, `missing ${field} was not retained as an explicit observation`);
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
    { typescript: 65, "rust-wasm": 380 },
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
      schemaVersion: "vector.generic-aam-verification-performance.v3",
      workloadId: "workload",
      boundProfileIdentity: { profileId: "APPLE_M5_NODE24", ...appleM5Environment },
      observedContext: {},
      results,
      nonclaims: [],
    },
    writeOutput: (value) => output.push(value),
    writeError: (value) => errors.push(value),
  });

  assert.equal(exitCode, 1);
  assert.equal(output.length, 1);
  const emitted = JSON.parse(output[0]);
  assert.deepEqual(emitted.results, results);
  assert.deepEqual(emitted.boundProfileIdentity, { profileId: "APPLE_M5_NODE24", ...appleM5Environment });
  assert.deepEqual(emitted.observedContext, {});
  assert.equal(Object.hasOwn(emitted, "profileId"), false);
  assert.equal(Object.hasOwn(emitted, "environment"), false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /typescript.*52\.163.*30/i);
  assert.match(errors[0], /rust-wasm.*220.*200/i);
});
