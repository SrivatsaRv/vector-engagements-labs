import { createHash } from "node:crypto";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import type { EngineTrack, ObserverPerspective, ObserverTrackModel } from "../lib/engine/contracts.ts";
import { createVerificationObservation, TrackStore } from "../lib/engine/track-store.ts";
import { canonicalJson } from "../lib/canonical-json.ts";

const SIDES = ["IAF", "PAF"] as const;
const TRACKS_PER_SIDE = 50;
const TRACKS = SIDES.length * TRACKS_PER_SIDE;
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

function associationId(owner: ObserverPerspective, index: number) {
  return `${owner}-SOURCE-${(index + 1).toString().padStart(4, "0")}`;
}

function observation(owner: ObserverPerspective, index: number, tick: number, time: number) {
  return createVerificationObservation({
    identity: source,
    owner,
    sourceAssociationId: associationId(owner, index),
    sourceSequence: tick + 1,
    sourceTimeSeconds: time,
    measuredPositionM: { x: 10_000 + index * 1_000 + tick, y: owner === "IAF" ? 2_000 : -2_000, z: 7_000 },
    measuredVelocityMps: { x: 250, y: index / 10, z: 0 },
    model,
  });
}

function assertBruteForceAssociation(owner: ObserverPerspective, tick: number, tracks: readonly EngineTrack[]) {
  for (let index = 0; index < TRACKS_PER_SIDE; index += 1) {
    const expected = observation(owner, index, tick, tick / UPDATE_RATE_HZ).estimate;
    if (expected.valueState !== "ESTIMATED") throw new Error("Oracle input is unexpectedly non-positional.");
    let nearest: EngineTrack | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const track of tracks) {
      const delta = track.estimate.positionM.x - expected.positionM.x;
      const lateral = track.estimate.positionM.y - expected.positionM.y;
      const vertical = track.estimate.positionM.z - expected.positionM.z;
      const distance = delta * delta + lateral * lateral + vertical * vertical;
      if (distance < nearestDistance) {
        nearest = track;
        nearestDistance = distance;
      }
    }
    if (nearest?.sourceAssociationId !== associationId(owner, index)) {
      throw new Error(`Brute-force association oracle disagrees for ${owner} source ${index + 1}.`);
    }
  }
}

function measuredRun() {
  const stores = new Map(SIDES.map((owner) => [
    owner,
    new TrackStore({ owner, source }, model, "vector.intended-use.engine-verification"),
  ]));
  let transitionCount = 0;
  let validUpdateAttempts = 0;
  let rejectedDuplicateAttempts = 0;
  let rejectedOutOfOrderAttempts = 0;
  const transitionFacts: unknown[] = [];
  const parityLines: string[] = [];
  let finalTracks: EngineTrack[] = [];
  const recordedStates: unknown[] = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  for (let tick = 0; tick < TICKS; tick += 1) {
    const time = tick / UPDATE_RATE_HZ;
    const observationDue = tick <= 1 || tick >= 7;
    const tickState: unknown[] = [];
    for (const owner of SIDES) {
      const store = stores.get(owner)!;
      const observations = observationDue
        ? Array.from({ length: TRACKS_PER_SIDE }, (_, index) => observation(owner, index, tick, time))
        : [];
      validUpdateAttempts += observations.length;
      const update = store.update(time, observations);
      transitionCount += update.transitions.length;
      transitionFacts.push(...update.transitions.map((transition) => ({ tick, ...transition })));
      for (const transition of update.transitions) {
        parityLines.push([
          "E", tick, owner, transition.sourceAssociationId, transition.trackId,
          transition.from, transition.to, transition.cause, transition.sourceSequence,
          transition.sourceTimeSeconds.toFixed(6),
        ].join("|"));
      }
      tickState.push({ owner, tracks: update.snapshot.tracks });

      if (observationDue && tick > 0 && tick % 10 === 0) {
        try {
          store.update(time, [observation(owner, 0, tick, time)]);
          throw new Error("TrackStore admitted a duplicate capacity probe.");
        } catch (error) {
          if (!/duplicate|out of order/i.test(String(error))) throw error;
          rejectedDuplicateAttempts += 1;
        }
        try {
          store.update(time, [observation(owner, 1, tick - 1, time - 1 / UPDATE_RATE_HZ)]);
          throw new Error("TrackStore admitted an out-of-order capacity probe.");
        } catch (error) {
          if (!/duplicate|out of order/i.test(String(error))) throw error;
          rejectedOutOfOrderAttempts += 1;
        }
      }
    }
    recordedStates.push(tickState);
  }
  for (const owner of SIDES) {
    const snapshot = stores.get(owner)!.update(DURATION_SECONDS).snapshot;
    if (snapshot.tracks.length !== TRACKS_PER_SIDE) throw new Error(`${owner} TrackStore did not retain 50 tracks.`);
    assertBruteForceAssociation(owner, TICKS - 1, snapshot.tracks);
    finalTracks.push(...snapshot.tracks);
  }
  finalTracks = finalTracks.sort((left, right) => left.owner.localeCompare(right.owner) || left.trackId.localeCompare(right.trackId));
  for (const track of finalTracks) {
    parityLines.push([
      "T", track.owner, track.sourceAssociationId, track.trackId, track.state,
      track.sourceSequence, track.sourceTimeSeconds.toFixed(6),
      track.estimate.positionM.x.toFixed(6), track.estimate.positionM.y.toFixed(6),
      track.estimate.positionM.z.toFixed(6), track.updateCount,
    ].join("|"));
  }
  const durationMs = performance.now() - startedAt;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const canonicalState = canonicalJson({ finalTracks, transitionFacts });
  return {
    durationMs,
    heapDeltaBytes,
    transitionCount,
    validUpdateAttempts,
    rejectedDuplicateAttempts,
    rejectedOutOfOrderAttempts,
    retainedTracks: finalTracks.length,
    retainedObservations: 0,
    recordedStateBytes: Buffer.byteLength(canonicalJson(recordedStates)),
    transitionBytes: Buffer.byteLength(canonicalJson(transitionFacts)),
    repeatDigest: createHash("sha256").update(canonicalState).digest("hex"),
    parityDigest: createHash("sha256").update(parityLines.join("\n")).digest("hex"),
  };
}

measuredRun();
const samples = Array.from({ length: RUNS }, measuredRun);
const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
const percentile = (value: number) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)]!;
const digests = new Set(samples.map((sample) => sample.repeatDigest));
const parityDigests = new Set(samples.map((sample) => sample.parityDigest));
const transitionCounts = new Set(samples.map((sample) => sample.transitionCount));
if (digests.size !== 1) throw new Error("TrackStore workload is not deterministic across repeats.");
if (parityDigests.size !== 1) throw new Error("TrackStore parity workload is not deterministic across repeats.");
if (transitionCounts.size !== 1 || !transitionCounts.has(TRACKS * 6)) throw new Error("TrackStore workload did not exercise six lifecycle transitions per track.");
if (samples.some((sample) => sample.retainedTracks !== TRACKS || sample.rejectedDuplicateAttempts === 0 || sample.rejectedOutOfOrderAttempts === 0)) {
  throw new Error("TrackStore workload omitted retained tracks or invalid-input contrasts.");
}
const p95Ms = percentile(0.95);
const maxHeapDeltaBytes = Math.max(...samples.map((sample) => sample.heapDeltaBytes));
if (p95Ms > MAXIMUM_P95_MS) throw new Error(`TrackStore p95 ${p95Ms} ms exceeded ${MAXIMUM_P95_MS} ms.`);
if (maxHeapDeltaBytes > MAXIMUM_HEAP_DELTA_BYTES) throw new Error(`TrackStore heap delta ${maxHeapDeltaBytes} exceeded ${MAXIMUM_HEAP_DELTA_BYTES} bytes.`);

process.stdout.write(`${JSON.stringify({
  schemaVersion: "vector.track-store-capacity.v1",
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
    activeSourceAssociations: TRACKS,
    sideOwnedStores: SIDES.length,
    tracks: TRACKS,
    tracksPerSide: TRACKS_PER_SIDE,
    updateRateHz: UPDATE_RATE_HZ,
    durationSeconds: DURATION_SECONDS,
    ticks: TICKS,
    validUpdateAttempts: samples[0]!.validUpdateAttempts,
    rejectedDuplicateAttempts: samples[0]!.rejectedDuplicateAttempts,
    rejectedOutOfOrderAttempts: samples[0]!.rejectedOutOfOrderAttempts,
    lifecycleTransitions: samples[0]!.transitionCount,
    associationOracle: "BRUTE_FORCE_NEAREST_ESTIMATE",
  },
  thresholds: { maximumP95Ms: MAXIMUM_P95_MS, maximumHeapDeltaBytes: MAXIMUM_HEAP_DELTA_BYTES },
  measurements: {
    runs: RUNS,
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    p99Ms: Number(percentile(0.99).toFixed(3)),
    maximumMs: Number(durations.at(-1)!.toFixed(3)),
    maximumHeapDeltaBytes: maxHeapDeltaBytes,
    retainedObservations: samples[0]!.retainedObservations,
    retainedTracks: samples[0]!.retainedTracks,
    retainedEvents: samples[0]!.transitionCount,
    recordedStateJsonBytes: samples[0]!.recordedStateBytes,
    transitionJsonBytes: samples[0]!.transitionBytes,
    repeatDigest: samples[0]!.repeatDigest,
    typescriptParityDigest: samples[0]!.parityDigest,
  },
  limitations: [
    "TrackStore contribution only; the issue-level 8 ms combined 100-entity Worker tick remains unproven.",
    "No named-aircraft sensor, datalink, EW, or weapon-support model is admitted.",
  ],
}, null, 2)}\n`);
