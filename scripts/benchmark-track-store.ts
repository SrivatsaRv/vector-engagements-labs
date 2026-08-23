import { createHash } from "node:crypto";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import type { ObserverPerspective, ObserverTrackModel } from "../lib/engine/contracts.ts";
import { createVerificationObservation, TrackStore } from "../lib/engine/track-store.ts";
import { canonicalJson } from "../lib/canonical-json.ts";

const TRACKS = 100;
const UPDATE_RATE_HZ = 20;
const DURATION_SECONDS = 5;
const TICKS = DURATION_SECONDS * UPDATE_RATE_HZ + 1;
const RUNS = Number(process.env.VECTOR_TRACK_STORE_RUNS ?? 7);
const MAXIMUM_P95_MS = Number(process.env.VECTOR_TRACK_STORE_MAX_P95_MS ?? 75);
const MAXIMUM_HEAP_DELTA_BYTES = Number(process.env.VECTOR_TRACK_STORE_MAX_HEAP_DELTA_BYTES ?? 64 * 1024 * 1024);
if (!Number.isSafeInteger(RUNS) || RUNS < 2) throw new Error("VECTOR_TRACK_STORE_RUNS must be at least two.");

const model: ObserverTrackModel = {
  schemaVersion: "vector.generic-track-model.v1",
  valueState: "TEST_FIXTURE",
  intendedUse: "ENGINE_VERIFICATION_ONLY",
  positionBiasM: { x: 5, y: -2, z: 1 },
  velocityBiasMps: { x: 0.5, y: -0.25, z: 0 },
  positionStandardDeviationM: { x: 40, y: 40, z: 60 },
  velocityStandardDeviationMps: { x: 3, y: 3, z: 4 },
  confirmationObservations: 2,
  maximumObservationAgeSeconds: 0.1,
  coastAfterSeconds: 0.1,
  lostAfterSeconds: 0.2,
  observationWindowsSeconds: [{ start: 0, end: DURATION_SECONDS }],
};
const digest = "7".repeat(64);
const source = {
  modelPackDigest: digest,
  sensorModelId: "generic-verification-sensor",
  sensorModelVersion: "1.0.0",
};

function measuredRun() {
  const stores = Array.from({ length: TRACKS }, (_, index) => {
    const owner: ObserverPerspective = index < TRACKS / 2 ? "IAF" : "PAF";
    return new TrackStore({ owner, source, trackOrdinal: index + 1 }, model, "vector.intended-use.engine-verification");
  });
  let transitionCount = 0;
  let finalState: unknown[] = [];
  const recordedStates: unknown[][] = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  for (let tick = 0; tick < TICKS; tick += 1) {
    const time = tick / UPDATE_RATE_HZ;
    // Exercise confirmation, coast, loss, and reacquisition before a sustained
    // 20 Hz update period. The schedule is deterministic and engine-verification-only.
    const observationDue = tick <= 1 || tick >= 7;
    const snapshots = stores.map((store, index) => {
      const update = store.update(
        time,
        observationDue
          ? createVerificationObservation({
              identity: source,
              owner: store.owner,
              sourceSequence: tick + 1,
              sourceTimeSeconds: time,
              measuredPositionM: { x: 10_000 + index * 50 + tick, y: 2_000 + index, z: 7_000 },
              measuredVelocityMps: { x: 250, y: index / 10, z: 0 },
              model,
            })
          : undefined,
      );
      transitionCount += update.transitions.length;
      return update.snapshot;
    });
    finalState = snapshots;
    recordedStates.push(snapshots);
  }
  const durationMs = performance.now() - startedAt;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const recordedStateBytes = Buffer.byteLength(canonicalJson(recordedStates));
  return {
    durationMs,
    heapDeltaBytes,
    transitionCount,
    recordedStateBytes,
    repeatDigest: createHash("sha256").update(canonicalJson(finalState)).digest("hex"),
  };
}

measuredRun();
const samples = Array.from({ length: RUNS }, measuredRun);
const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
const percentile = (value: number) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)]!;
const digests = new Set(samples.map((sample) => sample.repeatDigest));
const transitionCounts = new Set(samples.map((sample) => sample.transitionCount));
if (digests.size !== 1) throw new Error("TrackStore workload is not deterministic across repeats.");
if (transitionCounts.size !== 1 || !transitionCounts.has(TRACKS * 6)) {
  throw new Error("TrackStore workload did not exercise the expected six lifecycle transitions per track.");
}
const p95Ms = percentile(0.95);
const maxHeapDeltaBytes = Math.max(...samples.map((sample) => sample.heapDeltaBytes));
if (p95Ms > MAXIMUM_P95_MS) throw new Error(`TrackStore p95 ${p95Ms} ms exceeded ${MAXIMUM_P95_MS} ms.`);
if (maxHeapDeltaBytes > MAXIMUM_HEAP_DELTA_BYTES) {
  throw new Error(`TrackStore heap delta ${maxHeapDeltaBytes} exceeded ${MAXIMUM_HEAP_DELTA_BYTES} bytes.`);
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.track-store-performance-evidence.v1",
  measuredAt: new Date().toISOString(),
  environment: {
    runtime: process.version,
    platform: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
  },
  workload: {
    intendedUse: "ENGINE_VERIFICATION_ONLY",
    tracks: TRACKS,
    tracksPerSide: TRACKS / 2,
    updateRateHz: UPDATE_RATE_HZ,
    durationSeconds: DURATION_SECONDS,
    ticks: TICKS,
    updateAttempts: TRACKS * TICKS,
    lifecycleTransitions: samples[0]!.transitionCount,
  },
  thresholds: { maximumP95Ms: MAXIMUM_P95_MS, maximumHeapDeltaBytes: MAXIMUM_HEAP_DELTA_BYTES },
  measurements: {
    runs: RUNS,
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    p99Ms: Number(percentile(0.99).toFixed(3)),
    maximumMs: Number(durations.at(-1)!.toFixed(3)),
    maximumHeapDeltaBytes: maxHeapDeltaBytes,
    recordedStateJsonBytes: samples[0]!.recordedStateBytes,
    repeatDigest: samples[0]!.repeatDigest,
  },
}, null, 2)}\n`);
