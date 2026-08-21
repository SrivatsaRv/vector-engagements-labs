import { arch, cpus, platform, release, totalmem } from "node:os";
import {
  CAPACITY_BASELINE_MANIFEST,
  measureCapacityBaseline,
} from "../lib/validation/capacity-baseline.ts";

const runs = Number(process.env.VECTOR_CAPACITY_BASELINE_RUNS ?? 5);
const maximumP95Ms = Number(process.env.VECTOR_CAPACITY_BASELINE_MAX_P95_MS ?? 1_000);
const maximumHeapDeltaBytes = Number(process.env.VECTOR_CAPACITY_BASELINE_MAX_HEAP_DELTA_BYTES ?? 256 * 1024 * 1024);
const measurements = [
  measureCapacityBaseline("typescript", runs),
  measureCapacityBaseline("rust-wasm", runs),
];

for (const measurement of measurements) {
  if (measurement.p95Ms > maximumP95Ms) {
    throw new Error(`${measurement.backend} baseline p95 ${measurement.p95Ms} ms exceeded ${maximumP95Ms} ms.`);
  }
  if (measurement.maxHeapDeltaBytes > maximumHeapDeltaBytes) {
    throw new Error(`${measurement.backend} baseline heap delta ${measurement.maxHeapDeltaBytes} exceeded ${maximumHeapDeltaBytes} bytes.`);
  }
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.capacity-baseline-evidence.v1",
  measuredAt: new Date().toISOString(),
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  thresholds: { maximumP95Ms, maximumHeapDeltaBytes },
  workload: CAPACITY_BASELINE_MANIFEST,
  measurements,
}, null, 2)}\n`);
