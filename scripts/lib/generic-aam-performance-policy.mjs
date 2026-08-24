import assert from "node:assert/strict";

const BACKENDS = ["typescript", "rust-wasm"];
const WARMUP_BATCHES = 3;
const MEASURED_BATCHES = 20;

const APPLE_M5_BOUND_PROFILE_IDENTITY = Object.freeze({
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
});

const GITHUB_HOSTED_BOUND_PROFILE_IDENTITY = Object.freeze({
  runtime: "v22.18.0",
  platform: "linux",
  architecture: "x64",
  githubActions: true,
  runnerOs: "Linux",
  runnerArch: "X64",
  imageOs: "ubuntu24",
});

export const GENERIC_AAM_PERFORMANCE_PROFILES = Object.freeze({
  APPLE_M5_NODE24: Object.freeze({
    id: "APPLE_M5_NODE24",
    thresholdsP95Ms: Object.freeze({ typescript: 30, "rust-wasm": 200 }),
    boundProfileIdentity: APPLE_M5_BOUND_PROFILE_IDENTITY,
  }),
  GITHUB_HOSTED_UBUNTU24_X64_NODE22: Object.freeze({
    id: "GITHUB_HOSTED_UBUNTU24_X64_NODE22",
    thresholdsP95Ms: Object.freeze({ typescript: 65, "rust-wasm": 200 }),
    boundProfileIdentity: GITHUB_HOSTED_BOUND_PROFILE_IDENTITY,
  }),
});

const environmentMatchesBoundIdentity = (environment, boundProfileIdentity) =>
  Object.entries(boundProfileIdentity).every(
    ([field, expected]) => Object.hasOwn(environment, field) && Object.is(environment[field], expected),
  );

const hostedObservedContext = (environment) => {
  return Object.freeze({
    cpu: environment.cpu ?? null,
    logicalCores: environment.logicalCores ?? null,
    memoryBytes: environment.memoryBytes ?? null,
    imageVersion: environment.imageVersion ?? null,
  });
};

export function resolveGenericAamPerformanceProfile(profileId, environment) {
  assert(profileId, "An explicit performance profile is required.");
  const profile = GENERIC_AAM_PERFORMANCE_PROFILES[profileId];
  assert(profile, `Unknown performance profile: ${profileId}`);
  assert(
    environmentMatchesBoundIdentity(environment, profile.boundProfileIdentity),
    `Environment does not match performance profile ${profileId}.`,
  );
  const observedContext = profileId === "GITHUB_HOSTED_UBUNTU24_X64_NODE22"
    ? hostedObservedContext(environment)
    : Object.freeze({});
  return Object.freeze({ ...profile, observedContext });
}

const percentile = (values, fraction) => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

export function measureGenericAamPerformanceBackends({
  runners,
  inputs,
  thresholdsP95Ms,
  now,
  memoryUsage,
  serialize,
}) {
  assert.deepEqual(Object.keys(runners), BACKENDS, "Both generic-AAM backends must be measured in canonical order.");
  assert(inputs.length > 0, "The generic-AAM performance workload must not be empty.");

  return BACKENDS.map((backend) => {
    const run = runners[backend];
    for (let warmup = 0; warmup < WARMUP_BATCHES; warmup += 1) inputs.forEach((input) => run(input));
    const rssBefore = memoryUsage().rss;
    let outputBytes = 0;
    let outputFrames = 0;
    const samplesMs = Array.from({ length: MEASURED_BATCHES }, () => {
      const started = now();
      const runs = inputs.map((input) => run(input));
      const elapsed = now() - started;
      outputBytes = runs.reduce((sum, result) => sum + Buffer.byteLength(serialize(result)), 0);
      outputFrames = runs.reduce((sum, result) => sum + result.frames.length, 0);
      return elapsed;
    }).sort((left, right) => left - right);

    return {
      backend,
      measuredBatches: samplesMs.length,
      casesPerBatch: inputs.length,
      outputFrames,
      outputBytes,
      samplesMs: samplesMs.map((sample) => Number(sample.toFixed(3))),
      p50Ms: Number(percentile(samplesMs, 0.5).toFixed(3)),
      p95Ms: Number(percentile(samplesMs, 0.95).toFixed(3)),
      p99Ms: Number(percentile(samplesMs, 0.99).toFixed(3)),
      maxMs: Number(samplesMs.at(-1).toFixed(3)),
      rssGrowthBytes: Math.max(0, memoryUsage().rss - rssBefore),
      thresholdP95Ms: thresholdsP95Ms[backend],
    };
  });
}

export function evaluateGenericAamPerformanceResults(results) {
  assert.deepEqual(results.map((result) => result.backend), BACKENDS, "Both generic-AAM results are required.");
  return results
    .filter((result) => result.p95Ms > result.thresholdP95Ms)
    .map((result) => ({
      backend: result.backend,
      p95Ms: result.p95Ms,
      thresholdP95Ms: result.thresholdP95Ms,
      message: `${result.backend} generic AAM workload p95 ${result.p95Ms} ms exceeded ${result.thresholdP95Ms} ms.`,
    }));
}

export function emitGenericAamPerformanceReport({ report, writeOutput, writeError }) {
  const violations = evaluateGenericAamPerformanceResults(report.results);
  writeOutput(`${JSON.stringify(report)}\n`);
  if (violations.length === 0) return 0;
  writeError(`${violations.map((violation) => violation.message).join(" ")}\n`);
  return 1;
}
