import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { admitEnvironmentPack, createEnvironmentSampler } from "../lib/geospatial/environment-pack.ts";

const pack = admitEnvironmentPack({
  studyAreaId: "arabian-sea",
  weatherPresetId: "arabian-sea-fair",
}).pack;
const sampler = createEnvironmentSampler(pack);
const batchSize = 4_096;
const batches = 25;
const queries = Array.from({ length: batchSize }, (_, index) => ({
  eastM: ((index % 64) - 31.5) * 2_000,
  northM: (Math.floor(index / 64) - 31.5) * 2_000,
  upM: 8_000 + (index % 10),
  modelTimeSeconds: (index % 22) * 3_600,
}));

sampler.sampleBatch(queries);
const beforeHeap = process.memoryUsage().heapUsed;
const durations = Array.from({ length: batches }, () => {
  const started = performance.now();
  sampler.sampleBatch(queries);
  return performance.now() - started;
}).sort((left, right) => left - right);
const afterHeap = process.memoryUsage().heapUsed;
const totalSamples = batchSize * batches;
const totalMs = durations.reduce((sum, value) => sum + value, 0);
const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
const heapGrowthBytes = Math.max(0, afterHeap - beforeHeap);
const result = {
  schemaVersion: "vector.environment-performance-evidence.v1",
  pack: pack.identity,
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  samples: totalSamples,
  batchSize,
  p95BatchMs: Number(p95Ms.toFixed(3)),
  samplesPerSecond: Math.round(totalSamples / (totalMs / 1_000)),
  heapGrowthBytes,
  thresholds: { maximumP95BatchMs: 100, maximumHeapGrowthBytes: 64 * 1024 * 1024 },
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (p95Ms > result.thresholds.maximumP95BatchMs) throw new Error("Environment sampler p95 exceeded its regression limit.");
if (heapGrowthBytes > result.thresholds.maximumHeapGrowthBytes) throw new Error("Environment sampler heap growth exceeded its regression limit.");
