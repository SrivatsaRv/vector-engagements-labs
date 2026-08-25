import assert from "node:assert/strict";

const BACKENDS = Object.freeze(["typescript", "rust-wasm"]);

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const GENERIC_AAM_PERFORMANCE_PROFILES = deepFreeze({
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
    thresholdsP95Ms: { typescript: 30, "rust-wasm": 200 },
    warmupBatches: 3,
    measuredBatches: 20,
  },
});

export function resolveGenericAamPerformanceProfile(profileId, environment) {
  assert(profileId, "An explicit performance profile is required.");
  const profile = GENERIC_AAM_PERFORMANCE_PROFILES[profileId];
  assert(profile, `Unknown performance profile: ${profileId}`);
  assert.deepEqual(
    environment,
    profile.environment,
    `Environment does not match performance profile ${profileId}.`,
  );
  return profile;
}

export function admitGenericAamPerformanceWorkload(workload, workloadBytes, verifyWorkload) {
  const identity = verifyWorkload(workload, workloadBytes);
  return Object.freeze({ workload, identity: Object.freeze(identity) });
}

const percentile = (sortedValues, fraction) =>
  sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)];

export function measureGenericAamPerformanceBackends({ runners, inputs, profile, now, memoryUsage, serialize }) {
  assert.deepEqual(Object.keys(runners), BACKENDS, "Both generic-AAM backends must be measured in canonical order.");
  assert(inputs.length > 0, "The generic-AAM performance workload must not be empty.");
  return BACKENDS.map((backend) => {
    const run = runners[backend];
    for (let warmup = 0; warmup < profile.warmupBatches; warmup += 1) inputs.forEach((input) => run(input));
    const rssBefore = memoryUsage().rss;
    let outputBytes = 0;
    let outputFrames = 0;
    const samplesMs = Array.from({ length: profile.measuredBatches }, () => {
      const started = now();
      const runs = inputs.map((input) => run(input));
      const elapsed = now() - started;
      outputBytes = runs.reduce((sum, result) => sum + Buffer.byteLength(serialize(result)), 0);
      outputFrames = runs.reduce((sum, result) => sum + result.frames.length, 0);
      return elapsed;
    }).sort((left, right) => left - right);
    return {
      backend,
      warmupBatches: profile.warmupBatches,
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
      thresholdP95Ms: profile.thresholdsP95Ms[backend],
    };
  });
}

export function evaluateGenericAamPerformanceResults(results) {
  assert.deepEqual(results.map(({ backend }) => backend), BACKENDS, "Both generic-AAM results are required.");
  return results
    .filter(({ p95Ms, thresholdP95Ms }) => p95Ms > thresholdP95Ms)
    .map(({ backend, p95Ms, thresholdP95Ms }) => ({
      backend,
      p95Ms,
      thresholdP95Ms,
      message: `${backend} generic AAM workload p95 ${p95Ms} ms exceeded ${thresholdP95Ms} ms.`,
    }));
}
