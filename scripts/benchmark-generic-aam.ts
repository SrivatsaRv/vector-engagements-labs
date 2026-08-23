import { readFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import { runRustWasmGenericAamVerification } from "../lib/engine/backend.ts";
import {
  genericAamVerificationInput,
  runGenericAamVerification,
} from "../lib/validation/generic-aam-verification.ts";

type WorkloadCase = {
  tickRateHz: 32 | 64 | 128;
  maxTicks: number;
  seekerHalfAngleDeg: 15 | 20 | 30;
  caseRole?: "TABLE_THRUST_CONFLICT_SENSITIVITY";
  targetPositionM: { x: number; y: number; z: number };
};

const workload = JSON.parse(
  readFileSync(new URL("../fixtures/public-reference/nasa-tm-109057/workload.v1.json", import.meta.url), "utf8"),
) as { id: string; cases: WorkloadCase[] };
const inputs = workload.cases.map((entry) => {
  const input = genericAamVerificationInput({
    tickRateHz: entry.tickRateHz,
    maxTicks: entry.maxTicks,
    seekerHalfAngleDeg: entry.seekerHalfAngleDeg,
    caseRole: entry.caseRole ?? "PRINTED_LISTING_REPRODUCTION",
    target: {
      previousPositionM: entry.targetPositionM,
      positionM: entry.targetPositionM,
      velocityMps: { x: 234.375, y: 0, z: 0 },
    },
  });
  if (input.caseRole === "TABLE_THRUST_CONFLICT_SENSITIVITY") {
    input.constants.motorThrustN = 690 * 4.4482216152605;
  }
  return input;
});

const runners = {
  typescript: runGenericAamVerification,
  "rust-wasm": runRustWasmGenericAamVerification,
} as const;
const maximumP95Ms = {
  typescript: Number(process.env.VECTOR_MAX_GENERIC_AAM_TS_P95_MS ?? 30),
  "rust-wasm": Number(process.env.VECTOR_MAX_GENERIC_AAM_WASM_P95_MS ?? 200),
};
const percentile = (values: number[], fraction: number) =>
  values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
const results = Object.entries(runners).map(([backend, run]) => {
  for (let warmup = 0; warmup < 3; warmup += 1) inputs.forEach((input) => run(input));
  const rssBefore = process.memoryUsage().rss;
  let outputBytes = 0;
  let outputFrames = 0;
  const samples = Array.from({ length: 20 }, () => {
    const started = performance.now();
    const runs = inputs.map((input) => run(input));
    const elapsed = performance.now() - started;
    outputBytes = runs.reduce((sum, result) => sum + Buffer.byteLength(JSON.stringify(result)), 0);
    outputFrames = runs.reduce((sum, result) => sum + result.frames.length, 0);
    return elapsed;
  }).sort((left, right) => left - right);
  const result = {
    backend,
    measuredBatches: samples.length,
    casesPerBatch: inputs.length,
    outputFrames,
    outputBytes,
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    p99Ms: Number(percentile(samples, 0.99).toFixed(3)),
    maxMs: Number(samples.at(-1)!.toFixed(3)),
    rssGrowthBytes: Math.max(0, process.memoryUsage().rss - rssBefore),
    thresholdP95Ms: maximumP95Ms[backend as keyof typeof maximumP95Ms],
  };
  if (result.p95Ms > result.thresholdP95Ms) {
    throw new Error(`${backend} generic AAM workload p95 ${result.p95Ms} ms exceeded ${result.thresholdP95Ms} ms.`);
  }
  return result;
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.generic-aam-verification-performance.v1",
  workloadId: workload.id,
  environment: {
    runtime: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  results,
  nonclaims: ["Node-hosted evaluator only", "No browser Worker capacity claim", "No production entity-capacity claim"],
})}\n`);
