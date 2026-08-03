import { performance } from "node:perf_hooks";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";

const warmupRounds = 2;
const measuredRounds = Number(process.env.VECTOR_BENCHMARK_ROUNDS ?? 25);
const maximumP95Ms = Number(process.env.VECTOR_MAX_ENGINE_P95_MS ?? 75);

for (let round = 0; round < warmupRounds; round += 1) {
  for (const definition of SCENARIO_LIBRARY) simulate(definition.scenario);
}

const samples: Array<{ id: string; durationMs: number; frames: number }> = [];
for (let round = 0; round < measuredRounds; round += 1) {
  for (const definition of SCENARIO_LIBRARY) {
    const started = performance.now();
    const result = simulate(definition.scenario);
    samples.push({
      id: definition.id,
      durationMs: performance.now() - started,
      frames: result.frames.length,
    });
  }
}

const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
const percentile = (value: number) =>
  durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)];
const totalModelFrames = samples.reduce((sum, sample) => sum + sample.frames, 0);
const totalWallMs = durations.reduce((sum, duration) => sum + duration, 0);
const result = {
  engine: "browser-point-mass-v0.5",
  scenarios: SCENARIO_LIBRARY.length,
  measuredRuns: samples.length,
  totalModelFrames,
  p50Ms: Number(percentile(0.5).toFixed(3)),
  p95Ms: Number(percentile(0.95).toFixed(3)),
  maxMs: Number(durations.at(-1)!.toFixed(3)),
  framesPerWallSecond: Math.round(totalModelFrames / (totalWallMs / 1000)),
  regressionLimitP95Ms: maximumP95Ms,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.p95Ms > maximumP95Ms) {
  throw new Error(
    `Engine p95 ${result.p95Ms} ms exceeded ${maximumP95Ms} ms regression limit`,
  );
}
