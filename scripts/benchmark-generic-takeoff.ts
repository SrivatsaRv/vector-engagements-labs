import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import { runEngineBackend } from "../lib/engine/backend.ts";
import type { EngineBackendId } from "../lib/engine/contracts.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import {
  GENERIC_TAKEOFF_PERFORMANCE_PROFILE,
  createGenericTakeoffPerformanceScenario,
  nearestRankIndex,
} from "../lib/validation/generic-takeoff-performance.ts";

const profile = GENERIC_TAKEOFF_PERFORMANCE_PROFILE;
const prepared = {
  ...prepareSimulation(createGenericTakeoffPerformanceScenario()).engineScenario,
  durationSeconds: profile.durationSeconds,
};

const results = profile.backends.map((backend) => {
  for (let index = 0; index < profile.warmupRunsPerBackend; index += 1) {
    runEngineBackend(structuredClone(prepared), backend as EngineBackendId);
  }

  const samplesMs = Array.from({ length: profile.measuredRunsPerBackend }, () => {
    const started = performance.now();
    const run = runEngineBackend(structuredClone(prepared), backend as EngineBackendId);
    const elapsedMs = performance.now() - started;
    if (run.frames.length >= profile.maximumFramesPerRun) {
      throw new Error(
        `${backend} emitted ${run.frames.length} frames; expected fewer than ${profile.maximumFramesPerRun}.`,
      );
    }
    return elapsedMs;
  }).sort((left, right) => left - right);
  const p95Ms = samplesMs[nearestRankIndex(samplesMs.length, profile.percentile)];
  return {
    backend,
    warmupRuns: profile.warmupRunsPerBackend,
    measuredRuns: samplesMs.length,
    samplesMs: samplesMs.map((value) => Number(value.toFixed(3))),
    p50Ms: Number(samplesMs[nearestRankIndex(samplesMs.length, 0.5)].toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    maxMs: Number(samplesMs.at(-1)!.toFixed(3)),
    maximumP95Ms: profile.maximumP95Ms,
  };
});

const report = {
  schemaVersion: "vector.generic-takeoff-performance-evidence.v1",
  profile,
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  results,
  nonclaims: [
    "Generic PUBLIC_EDUCATIONAL/MODEL_ASSUMPTION ground dynamics only",
    "No named-aircraft takeoff, runway-capacity, browser-rendering, or server-throughput claim",
  ],
};
process.stdout.write(`${JSON.stringify(report)}\n`);

for (const result of results) {
  if (result.p95Ms >= profile.maximumP95Ms) {
    throw new Error(
      `${result.backend} p95 ${result.p95Ms} ms exceeded the ${profile.maximumP95Ms} ms ceiling; max ${result.maxMs} ms.`,
    );
  }
}
