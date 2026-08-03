import { performance } from "node:perf_hooks";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";
import type { EngineBackendId } from "../lib/engine/contracts.ts";
import { RUST_WASM_ENGINE_ARTIFACT } from "../lib/engine/backend.ts";

const warmupRounds = 2;
const measuredRounds = Number(process.env.VECTOR_BENCHMARK_ROUNDS ?? 25);
const maximumP95Ms = Number(process.env.VECTOR_MAX_ENGINE_P95_MS ?? 75);

const backends: EngineBackendId[] = ["typescript", "rust-wasm"];
const coldStartMs: Partial<Record<EngineBackendId, number>> = {};
const samples: Array<{
  backend: EngineBackendId;
  id: string;
  durationMs: number;
  frames: number;
}> = [];

for (const backend of backends) {
  const coldStarted = performance.now();
  simulate({ ...SCENARIO_LIBRARY[0].scenario, engineBackend: backend });
  coldStartMs[backend] = performance.now() - coldStarted;
  for (let round = 0; round < warmupRounds; round += 1) {
    for (const definition of SCENARIO_LIBRARY) {
      simulate({ ...definition.scenario, engineBackend: backend });
    }
  }
  for (let round = 0; round < measuredRounds; round += 1) {
    for (const definition of SCENARIO_LIBRARY) {
      const started = performance.now();
      const result = simulate({ ...definition.scenario, engineBackend: backend });
      samples.push({
        backend,
        id: definition.id,
        durationMs: performance.now() - started,
        frames: result.frames.length,
      });
    }
  }
}

const summary = (backend: EngineBackendId) => {
  const backendSamples = samples.filter((sample) => sample.backend === backend);
  const durations = backendSamples
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  const percentile = (value: number) =>
    durations[
      Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)
    ];
  const totalModelFrames = backendSamples.reduce(
    (sum, sample) => sum + sample.frames,
    0,
  );
  const totalWallMs = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    backend,
    coldStartMs: Number(coldStartMs[backend]!.toFixed(3)),
    measuredRuns: backendSamples.length,
    totalModelFrames,
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
    maxMs: Number(durations.at(-1)!.toFixed(3)),
    framesPerWallSecond: Math.round(totalModelFrames / (totalWallMs / 1000)),
  };
};

const backendResults = backends.map(summary);
const result = {
  engine: "browser-point-mass-v0.5",
  scenarios: SCENARIO_LIBRARY.length,
  rustWasmBytes: RUST_WASM_ENGINE_ARTIFACT.bytes,
  backends: backendResults,
  regressionLimitP95Ms: maximumP95Ms,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
for (const backend of backendResults) {
  if (backend.p95Ms > maximumP95Ms) {
    throw new Error(
      `${backend.backend} engine p95 ${backend.p95Ms} ms exceeded ${maximumP95Ms} ms regression limit`,
    );
  }
}
