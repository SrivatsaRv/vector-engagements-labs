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

export function admitGenericAamPerformanceRepository(commitSha, porcelainStatus) {
  assert.match(commitSha, /^[a-f0-9]{40}$/, "Generic AAM performance evidence requires an exact commit SHA.");
  assert.equal(porcelainStatus, "", "Generic AAM performance evidence worktree must be clean.");
  return Object.freeze({ commitSha, worktreeClean: true });
}

export function admitGenericAamMeasuredBatch({
  backend,
  runs,
  inputs,
  cases,
  expectedFrames,
  expectedBatchSha256,
  assertRun,
  projectOutcome,
  outcomeSha256,
  batchSha256,
}) {
  assert.equal(runs.length, cases.length, `${backend} generic AAM workload case count mismatch.`);
  assert.equal(inputs.length, cases.length, `${backend} generic AAM workload input count mismatch.`);
  const outcomes = runs.map((run, index) => {
    const entry = cases[index];
    assertRun(run, inputs[index], backend);
    const outcome = projectOutcome(entry, run);
    if (outcome.terminalState !== entry.expectedTerminal
      || outcome.terminalTick !== entry.expectedTick
      || outcome.terminalCause !== entry.expectedCause
      || outcome.frameCount !== entry.expectedFrameCount
      || outcomeSha256(entry, run) !== entry.semanticOutcomeSha256) {
      throw new Error(`${backend} ${entry.id} stable semantic outcome mismatch.`);
    }
    return outcome;
  });
  const outputFrames = outcomes.reduce((sum, outcome) => sum + outcome.frameCount, 0);
  assert.equal(
    outputFrames,
    expectedFrames,
    `${backend} generic AAM frame count mismatch: expected ${expectedFrames}, received ${outputFrames}.`,
  );
  const semanticBatchSha256 = batchSha256(outcomes);
  assert.equal(
    semanticBatchSha256,
    expectedBatchSha256,
    `${backend} generic AAM semantic batch mismatch: expected ${expectedBatchSha256}, received ${semanticBatchSha256}.`,
  );
  return Object.freeze({ outputFrames, semanticBatchSha256 });
}

const percentile = (sortedValues, fraction) =>
  sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)];

export function measureGenericAamPerformanceBackends({
  runners,
  inputs,
  profile,
  now,
  memoryUsage,
  serialize,
  validateBatch,
}) {
  assert.deepEqual(Object.keys(runners), BACKENDS, "Both generic-AAM backends must be measured in canonical order.");
  assert(inputs.length > 0, "The generic-AAM performance workload must not be empty.");
  assert.equal(typeof validateBatch, "function", "Every generic-AAM measured batch requires an independent validator.");
  return BACKENDS.map((backend) => {
    const run = runners[backend];
    for (let warmup = 0; warmup < profile.warmupBatches; warmup += 1) inputs.forEach((input) => run(input));
    const rssBefore = memoryUsage().rss;
    let outputBytes = 0;
    let outputFrames = 0;
    let semanticBatchSha256 = "";
    const samplesMs = Array.from({ length: profile.measuredBatches }, () => {
      const started = now();
      const runs = inputs.map((input) => run(input));
      const elapsed = now() - started;
      const validation = validateBatch({ backend, runs });
      assert.equal(
        validation.outputFrames,
        runs.reduce((sum, result) => sum + result.frames.length, 0),
        `${backend} validator frame count disagrees with measured output.`,
      );
      assert.match(validation.semanticBatchSha256, /^[a-f0-9]{64}$/, `${backend} semantic batch digest is invalid.`);
      outputBytes = runs.reduce((sum, result) => sum + Buffer.byteLength(serialize(result)), 0);
      outputFrames = validation.outputFrames;
      semanticBatchSha256 = validation.semanticBatchSha256;
      return elapsed;
    }).sort((left, right) => left - right);
    return {
      backend,
      warmupBatches: profile.warmupBatches,
      measuredBatches: samplesMs.length,
      casesPerBatch: inputs.length,
      outputFrames,
      outputBytes,
      semanticBatchSha256,
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
