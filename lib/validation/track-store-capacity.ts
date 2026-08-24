import workload from "../../fixtures/performance/track-store-capacity-workload.v1.json" with { type: "json" };
import type { ObserverPerspective, ObserverTrackModel } from "../engine/contracts.ts";
import { assertVerificationTrackModel } from "../engine/track-store.ts";

type CapacityWorkload = {
  schemaVersion: "vector.track-store-capacity-workload.v1";
  id: "vector.track-store-capacity.100-track.v1";
  version: "1.0.0";
  intendedUse: "ENGINE_VERIFICATION_ONLY";
  sides: [ObserverPerspective, ObserverPerspective];
  tracksPerSide: number;
  updateRateHz: number;
  durationSeconds: number;
  ticks: number;
  observationTickWindows: Array<[number, number]>;
  invalidProbeIntervalTicks: number;
  source: { modelPackDigest: string; sensorModelId: string; sensorModelVersion: string };
  trackModel: ObserverTrackModel;
  expected: {
    activeSourceAssociations: number;
    validUpdateAttempts: number;
    rejectedDuplicateAttempts: number;
    rejectedOutOfOrderAttempts: number;
    lifecycleTransitions: number;
    retainedTracks: number;
    canonicalFrameBytes: number;
    canonicalPictureBytes: number;
    transitionJsonBytes: number;
    repeatDigest: string;
    parityDigest: string;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} has an unsupported or missing field.`);
  }
}

export function assertTrackStoreCapacityWorkload(value: unknown): asserts value is CapacityWorkload {
  exactKeys(value, [
    "schemaVersion", "id", "version", "intendedUse", "sides", "tracksPerSide", "updateRateHz",
    "durationSeconds", "ticks", "observationTickWindows", "invalidProbeIntervalTicks", "source",
    "trackModel", "expected",
  ], "TrackStore capacity workload");
  if (
    value.schemaVersion !== "vector.track-store-capacity-workload.v1" ||
    value.id !== "vector.track-store-capacity.100-track.v1" || value.version !== "1.0.0" ||
    value.intendedUse !== "ENGINE_VERIFICATION_ONLY" ||
    !Array.isArray(value.sides) || value.sides.length !== 2 || value.sides[0] !== "IAF" || value.sides[1] !== "PAF" ||
    !Number.isSafeInteger(value.tracksPerSide) || (value.tracksPerSide as number) <= 0 ||
    !Number.isSafeInteger(value.updateRateHz) || (value.updateRateHz as number) <= 0 ||
    typeof value.durationSeconds !== "number" || !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0 ||
    value.ticks !== (value.durationSeconds as number) * (value.updateRateHz as number) + 1 ||
    !Number.isSafeInteger(value.invalidProbeIntervalTicks) || (value.invalidProbeIntervalTicks as number) <= 0
  ) throw new Error("TrackStore capacity workload identity or dimensions are invalid.");
  if (!Array.isArray(value.observationTickWindows) || value.observationTickWindows.length === 0 || value.observationTickWindows.some((window) =>
    !Array.isArray(window) || window.length !== 2 || !window.every(Number.isSafeInteger) ||
    window[0] < 0 || window[1] < window[0] || window[1] >= (value.ticks as number)
  )) throw new Error("TrackStore capacity observation windows are invalid.");
  exactKeys(value.source, ["modelPackDigest", "sensorModelId", "sensorModelVersion"], "TrackStore capacity source");
  if (
    typeof value.source.modelPackDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.source.modelPackDigest) ||
    typeof value.source.sensorModelId !== "string" || value.source.sensorModelId.length === 0 ||
    typeof value.source.sensorModelVersion !== "string" || value.source.sensorModelVersion.length === 0
  ) throw new Error("TrackStore capacity source is invalid.");
  exactKeys(value.expected, [
    "activeSourceAssociations", "validUpdateAttempts", "rejectedDuplicateAttempts",
    "rejectedOutOfOrderAttempts", "lifecycleTransitions", "retainedTracks", "canonicalFrameBytes",
    "canonicalPictureBytes", "transitionJsonBytes", "repeatDigest", "parityDigest",
  ], "TrackStore capacity expectations");
  for (const key of [
    "activeSourceAssociations", "validUpdateAttempts", "rejectedDuplicateAttempts", "rejectedOutOfOrderAttempts",
    "lifecycleTransitions", "retainedTracks", "canonicalFrameBytes", "canonicalPictureBytes", "transitionJsonBytes",
  ] as const) {
    if (!Number.isSafeInteger(value.expected[key]) || (value.expected[key] as number) < 0) {
      throw new Error(`TrackStore capacity expected ${key} is invalid.`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(value.expected.repeatDigest as string) || !/^[a-f0-9]{64}$/.test(value.expected.parityDigest as string)) {
    throw new Error("TrackStore capacity expected digest is invalid.");
  }
  assertVerificationTrackModel(value.trackModel, "vector.intended-use.engine-verification");
}

assertTrackStoreCapacityWorkload(workload);
export const TRACK_STORE_CAPACITY_WORKLOAD = workload as CapacityWorkload;
export const TRACK_STORE_CAPACITY_SIDES = TRACK_STORE_CAPACITY_WORKLOAD.sides;
export const TRACK_STORE_CAPACITY_MODEL = TRACK_STORE_CAPACITY_WORKLOAD.trackModel;
export const TRACK_STORE_CAPACITY_SOURCE = TRACK_STORE_CAPACITY_WORKLOAD.source;

export function trackStoreCapacityObservationDue(tick: number) {
  return TRACK_STORE_CAPACITY_WORKLOAD.observationTickWindows.some(([start, end]) => tick >= start && tick <= end);
}
