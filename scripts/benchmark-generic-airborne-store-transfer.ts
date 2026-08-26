import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import {
  RUST_WASM_ENGINE_ARTIFACT,
  runEngineBackend,
} from "../lib/engine/backend.ts";
import type { EngineBackendId } from "../lib/engine/contracts.ts";
import { prepareSimulation } from "../lib/simulation.ts";
import {
  GENERIC_AIRBORNE_STORE_TRANSFER_PERFORMANCE_PROFILE,
  createGenericAirborneStoreTransferScenario,
} from "../lib/validation/generic-airborne-store-transfer.ts";
import { nearestRankIndex } from "../lib/validation/generic-takeoff-performance.ts";

const profile = GENERIC_AIRBORNE_STORE_TRANSFER_PERFORMANCE_PROFILE;
const prepared = {
  ...prepareSimulation(createGenericAirborneStoreTransferScenario()).engineScenario,
  durationSeconds: profile.durationSeconds,
};

if (RUST_WASM_ENGINE_ARTIFACT.bytes >= profile.maximumOptimizedWasmBytes) {
  throw new Error(
    `Optimized Rust/WASM artifact is ${RUST_WASM_ENGINE_ARTIFACT.bytes} bytes; expected fewer than ${profile.maximumOptimizedWasmBytes}.`,
  );
}

const execute = (backend: EngineBackendId) => {
  const run = runEngineBackend(structuredClone(prepared), backend);
  if (run.events.state !== "AVAILABLE") {
    throw new Error(`${backend} did not retain an admitted event stream.`);
  }
  const outcomes = run.events.items.filter(
    (event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME",
  );
  const outcome = outcomes[0]?.payload;
  if (
    outcomes.length !== 1
    || outcome?.kind !== "AIRBORNE_STORE_TRANSFER_OUTCOME"
    || outcome.accepted !== true
    || outcome.achieved !== true
    || outcome.cause !== "AIRBORNE_TRANSFER_ADMITTED"
  ) {
    throw new Error(`${backend} did not retain the one admitted transfer outcome.`);
  }
  if (run.frames.length >= profile.maximumFramesPerRun) {
    throw new Error(
      `${backend} emitted ${run.frames.length} frames; expected fewer than ${profile.maximumFramesPerRun}.`,
    );
  }
};

const results = profile.backends.map((backend) => {
  for (let index = 0; index < profile.warmupRunsPerBackend; index += 1) {
    execute(backend as EngineBackendId);
  }
  const samplesMs = Array.from({ length: profile.measuredRunsPerBackend }, () => {
    const started = performance.now();
    execute(backend as EngineBackendId);
    return performance.now() - started;
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
  schemaVersion: "vector.generic-airborne-store-transfer-performance-evidence.v1",
  profile,
  artifact: RUST_WASM_ENGINE_ARTIFACT,
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
    "Generic PUBLIC_EDUCATIONAL/MODEL_ASSUMPTION transfer mechanism only",
    "No named-aircraft/store, carriage, safe-separation, weapon-effectiveness, landing, recovery, browser-rendering, or server-throughput claim",
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
