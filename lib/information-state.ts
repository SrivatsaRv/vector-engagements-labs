import type { EngineFrame, EngineObserverState } from "./engine/contracts.ts";
import type { RaspTrack } from "./simulation.ts";
import { canonicalJson } from "./canonical-json.ts";
import { assertNoTruthIdentity } from "./engine/track-store.ts";

/**
 * Projects the observer state emitted by the simulation tick for display and
 * recording. This boundary deliberately does not read entity positions, range,
 * jammer state, or scenario controls. A plot remains non-positional until a
 * later admitted measurement and track-estimation contract exists.
 */
type ObserverStateFrame = Pick<EngineFrame, "t" | "observerStates">;

export function projectObserverStates(frames: readonly ObserverStateFrame[]): RaspTrack[] {
  return frames.flatMap((frame) =>
    frame.observerStates.map((state) => {
      assertEngineObserverState(state);
      if (state.schemaVersion === "vector.observer-state.v3") {
        return { ...state, modelTimeSeconds: frame.t };
      }
      const sensorModelId = "sensorModelId" in state ? state.sensorModelId : undefined;
      return {
        ...state,
        modelTimeSeconds: frame.t,
        trackId: state.trackState === "PLOT"
          ? `${state.perspective}:${sensorModelId}:plot`
          : "UNAVAILABLE",
        classification: state.trackState === "PLOT" ? "UNKNOWN" as const : "UNAVAILABLE" as const,
        identification: "UNKNOWN" as const,
        source: sensorModelId ?? "No admitted sensor model",
        lastUpdateSeconds: frame.t,
        ageSeconds: 0,
        confidence: null,
        uncertaintyMeters: null,
        status: state.trackState === "PLOT" ? "PLOT" as const : "NO_TRACK" as const,
      };
    }),
  );
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("Observer state contains unsupported or missing fields.");
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function finiteVector(value: unknown, label: string) {
  const vector = object(value, label);
  exactKeys(vector, ["x", "y", "z"]);
  if (![vector.x, vector.y, vector.z].every((component) => typeof component === "number" && Number.isFinite(component))) {
    throw new Error(`${label} must contain finite x, y, and z components.`);
  }
}

function assertSourceIdentity(value: unknown, owner: unknown, sensorModelId: unknown) {
  const source = object(value, "Track source identity");
  exactKeys(source, ["modelPackDigest", "sensorModelId", "sensorModelVersion"]);
  if (
    typeof source.modelPackDigest !== "string" || !/^[a-f0-9]{64}$/.test(source.modelPackDigest) ||
    source.sensorModelId !== sensorModelId || typeof source.sensorModelVersion !== "string" || !source.sensorModelVersion ||
    !["IAF", "PAF"].includes(String(owner))
  ) throw new Error("Track source identity is invalid or not bound to its observer state.");
}

function assertEstimate(value: unknown) {
  const estimate = object(value, "Track estimate");
  exactKeys(estimate, ["valueState", "positionM", "velocityMps"]);
  if (estimate.valueState !== "ESTIMATED") throw new Error("Track estimate value state is invalid.");
  finiteVector(estimate.positionM, "Track position estimate");
  finiteVector(estimate.velocityMps, "Track velocity estimate");
}

function assertUncertainty(value: unknown) {
  const uncertainty = object(value, "Track uncertainty");
  exactKeys(uncertainty, ["valueState", "positionStandardDeviationM", "velocityStandardDeviationMps"]);
  if (uncertainty.valueState !== "ESTIMATED") throw new Error("Track uncertainty value state is invalid.");
  finiteVector(uncertainty.positionStandardDeviationM, "Track position uncertainty");
  finiteVector(uncertainty.velocityStandardDeviationMps, "Track velocity uncertainty");
  const encoded = uncertainty as {
    positionStandardDeviationM: { x: number; y: number; z: number };
    velocityStandardDeviationMps: { x: number; y: number; z: number };
  };
  if (
    Object.values(encoded.positionStandardDeviationM).some((component) => component <= 0) ||
    Object.values(encoded.velocityStandardDeviationMps).some((component) => component <= 0)
  ) throw new Error("Track uncertainty components must be positive.");
}

function assertObservation(value: unknown, perspective: unknown, sensorModelId: unknown) {
  const observation = object(value, "Observation");
  exactKeys(observation, [
    "schemaVersion", "id", "owner", "sourceAssociationId", "source", "sourceSequence", "sourceTimeSeconds", "estimate", "uncertainty",
  ]);
  if (
    observation.schemaVersion !== "vector.observation.v1" || observation.owner !== perspective ||
    typeof observation.id !== "string" || !observation.id.startsWith(`${String(perspective)}-OBS-`) ||
    typeof observation.sourceAssociationId !== "string" ||
    !new RegExp(`^${String(perspective)}-SOURCE-[0-9]{4,8}$`).test(observation.sourceAssociationId) ||
    !Number.isSafeInteger(observation.sourceSequence) || (observation.sourceSequence as number) < 1 ||
    typeof observation.sourceTimeSeconds !== "number" || !Number.isFinite(observation.sourceTimeSeconds) ||
    observation.sourceTimeSeconds < 0
  ) throw new Error("Observation identity, ownership, sequence, or time is invalid.");
  assertSourceIdentity(observation.source, observation.owner, sensorModelId);
  assertEstimate(observation.estimate);
  assertUncertainty(observation.uncertainty);
}

function assertTrack(value: unknown, perspective: unknown, sensorModelId: unknown) {
  const track = object(value, "Track");
  exactKeys(track, [
    "schemaVersion", "trackId", "owner", "sourceAssociationId", "source", "sourceSequence", "sourceTimeSeconds", "state",
    "estimate", "uncertainty", "updateCount", "ageSeconds", "freshUntilSeconds", "expiresAtSeconds",
  ]);
  if (
    track.schemaVersion !== "vector.track.v1" || track.owner !== perspective ||
    typeof track.trackId !== "string" || !track.trackId.startsWith(`${String(perspective)}-TRACK-`) ||
    typeof track.sourceAssociationId !== "string" ||
    !new RegExp(`^${String(perspective)}-SOURCE-[0-9]{4,8}$`).test(track.sourceAssociationId) ||
    !["TENTATIVE", "CONFIRMED", "COASTING", "LOST"].includes(String(track.state)) ||
    !Number.isSafeInteger(track.sourceSequence) || (track.sourceSequence as number) < 1 ||
    !Number.isSafeInteger(track.updateCount) || (track.updateCount as number) < 1 ||
    [track.sourceTimeSeconds, track.ageSeconds, track.freshUntilSeconds, track.expiresAtSeconds]
      .some((item) => typeof item !== "number" || !Number.isFinite(item)) ||
    (track.sourceTimeSeconds as number) < 0 || (track.ageSeconds as number) < 0 ||
    (track.freshUntilSeconds as number) < (track.sourceTimeSeconds as number) ||
    (track.expiresAtSeconds as number) <= (track.freshUntilSeconds as number)
  ) throw new Error("Track identity, ownership, lifecycle, sequence, or time is invalid.");
  assertSourceIdentity(track.source, track.owner, sensorModelId);
  assertEstimate(track.estimate);
  assertUncertainty(track.uncertainty);
}

export function assertEngineObserverState(value: unknown): asserts value is EngineObserverState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Observer state must be an object.");
  assertNoTruthIdentity(value, "Observer state");
  const state = value as Record<string, unknown>;
  const base = [
    "schemaVersion", "perspective", "effectScope", "stateExplanation",
  ];
  const v2State = [
    "schemaVersion", "perspective", "sensorState", "observationCount", "trackState",
    "visible", "availabilityReason", "effectScope", "stateExplanation",
  ];
  if (!(["IAF", "PAF"] as unknown[]).includes(state.perspective) || state.effectScope !== "AIR_PICTURE_ONLY") {
    throw new Error("Observer state ownership or effect scope is invalid.");
  }
  if (!(state.stateExplanation === null || (typeof state.stateExplanation === "string" && state.stateExplanation.length > 0))) {
    throw new Error("Observer state explanation must be a non-empty string or null.");
  }
  if (state.schemaVersion === "vector.observer-state.v2") {
    exactKeys(state, v2State, ["sensorModelId"]);
    const unsupported = state.sensorState === "UNSUPPORTED" && state.observationCount === 0 &&
      state.trackState === "UNSUPPORTED" && state.visible === false &&
      state.availabilityReason === "SENSOR_MODEL_UNAVAILABLE" && state.sensorModelId === undefined;
    const off = state.sensorState === "OFF" && state.observationCount === 0 &&
      state.trackState === "NONE" && state.visible === false && state.availabilityReason === "SENSOR_OFF" &&
      typeof state.sensorModelId === "string";
    const noTrack = state.sensorState === "SEARCH" && state.observationCount === 0 &&
      state.trackState === "NONE" && state.visible === false &&
      ["SCAN_NOT_DUE", "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME"].includes(String(state.availabilityReason)) &&
      typeof state.sensorModelId === "string";
    const plot = state.sensorState === "SEARCH" && state.observationCount === 1 &&
      state.trackState === "PLOT" && state.visible === false && state.availabilityReason === "OBSERVATION_ADMITTED" &&
      typeof state.sensorModelId === "string";
    if (!(unsupported || off || noTrack || plot)) throw new Error("Observer state v2 is contradictory.");
  } else if (state.schemaVersion === "vector.observer-state.v3") {
    exactKeys(state, [
      ...base, "sensorState", "observationCount", "trackCount", "visibleTrackCount",
      "scanReason", "sensorModelId", "observations", "tracks",
    ]);
    if (
      state.sensorState !== "SEARCH" ||
      !Array.isArray(state.observations) || !Array.isArray(state.tracks) ||
      !Number.isSafeInteger(state.observationCount) || (state.observationCount as number) < 0 ||
      !Number.isSafeInteger(state.trackCount) || (state.trackCount as number) < 0 ||
      !Number.isSafeInteger(state.visibleTrackCount) || (state.visibleTrackCount as number) < 0 ||
      state.observations.length !== state.observationCount ||
      state.tracks.length !== state.trackCount || typeof state.sensorModelId !== "string" ||
      !["SCAN_NOT_DUE", "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME", "OBSERVATION_ADMITTED"].includes(String(state.scanReason))
    ) throw new Error("Observer state v3 is contradictory.");
    state.observations.forEach((observation) => assertObservation(observation, state.perspective, state.sensorModelId));
    state.tracks.forEach((candidate) => assertTrack(candidate, state.perspective, state.sensorModelId));
    const observations = state.observations as Record<string, unknown>[];
    const tracks = state.tracks as Record<string, unknown>[];
    const associationIds = tracks.map((track) => track.sourceAssociationId as string);
    const trackIds = tracks.map((track) => track.trackId as string);
    const observationIds = observations.map((observation) => observation.id as string);
    if (
      new Set(associationIds).size !== associationIds.length ||
      new Set(trackIds).size !== trackIds.length ||
      new Set(observationIds).size !== observationIds.length ||
      canonicalJson(associationIds) !== canonicalJson([...associationIds].sort())
    ) throw new Error("Observer state v3 repeats or misorders an opaque track identity.");
    for (const observation of observations) {
      const track = tracks.find((candidate) => candidate.sourceAssociationId === observation.sourceAssociationId);
      if (!track) throw new Error("Observation has no matching retained side-owned track.");
      if (
        observation.sourceSequence !== track.sourceSequence || observation.sourceTimeSeconds !== track.sourceTimeSeconds ||
        canonicalJson(observation.source) !== canonicalJson(track.source) ||
        canonicalJson(observation.estimate) !== canonicalJson(track.estimate) ||
        canonicalJson(observation.uncertainty) !== canonicalJson(track.uncertainty)
      ) throw new Error("Observation and updated track do not share one admitted estimate.");
    }
    const visibleTrackCount = tracks.filter((track) => ["CONFIRMED", "COASTING"].includes(String(track.state))).length;
    if (state.visibleTrackCount !== visibleTrackCount) {
      throw new Error("Observer state v3 visible-track count is contradictory.");
    }
    if (
      (observations.length > 0 && state.scanReason !== "OBSERVATION_ADMITTED") ||
      (observations.length === 0 && state.scanReason === "OBSERVATION_ADMITTED")
    ) {
      throw new Error("Observer state v3 availability, observations, and tracks are contradictory.");
    }
  } else {
    throw new Error("Observer state schema is unsupported.");
  }
}

/**
 * Reattaches the recorded tick-owned observer state to decoded replay frames.
 * It does not derive an observation or track from world state. The saved
 * pictures member is the immutable source during replay.
 */
export function attachRecordedObserverStates(
  frames: readonly EngineFrame[],
  pictures: readonly RaspTrack[],
): EngineFrame[] {
  const byFrame = new Map<number, EngineObserverState[]>();
  for (const picture of pictures) {
    const states = byFrame.get(picture.modelTimeSeconds) ?? [];
    states.push(observerStateFromPicture(picture));
    byFrame.set(picture.modelTimeSeconds, states);
  }
  return frames.map((frame) => ({
    ...frame,
    observerStates: byFrame.get(frame.t) ?? [],
  }));
}

function observerStateFromPicture(picture: RaspTrack): EngineObserverState {
  if (picture.schemaVersion === "vector.observer-state.v3") {
    const state: EngineObserverState = {
      schemaVersion: "vector.observer-state.v3",
      perspective: picture.perspective,
      sensorState: "SEARCH",
      observationCount: picture.observationCount,
      trackCount: picture.trackCount,
      visibleTrackCount: picture.visibleTrackCount,
      scanReason: picture.scanReason,
      effectScope: "AIR_PICTURE_ONLY",
      stateExplanation: picture.stateExplanation,
      sensorModelId: picture.sensorModelId,
      observations: structuredClone(picture.observations),
      tracks: structuredClone(picture.tracks),
    };
    assertEngineObserverState(state);
    return state;
  }
  const base = {
    schemaVersion: "vector.observer-state.v2" as const,
    perspective: picture.perspective,
    sensorState: picture.sensorState,
    observationCount: picture.observationCount,
    trackState: picture.trackState,
    visible: picture.visible,
    availabilityReason: picture.availabilityReason,
    effectScope: picture.effectScope,
    stateExplanation: picture.stateExplanation,
  };
  const state = "sensorModelId" in picture
    ? { ...base, sensorModelId: picture.sensorModelId }
    : base;
  assertEngineObserverState(state);
  return state;
}

/**
 * Rejects a picture set that is not an exact projection of the tick-owned
 * observer state. It intentionally accepts no estimated position, observed
 * entity identity, range, covariance, or jammer-derived metadata.
 */
export function assertRecordedSidePictures(
  frames: readonly EngineFrame[],
  pictures: readonly RaspTrack[],
) {
  const expected = projectObserverStates(frames);
  if (pictures.length !== expected.length) {
    throw new Error(`Recorded observer-picture count ${pictures.length} does not match the canonical tick boundary ${expected.length}.`);
  }
  const seen = new Set<string>();
  for (const picture of pictures) {
    observerStateFromPicture(picture);
    const key = `${picture.perspective}:${picture.modelTimeSeconds}`;
    if (seen.has(key)) throw new Error("Recorded observer picture has a duplicate side/frame identity.");
    seen.add(key);
    if ("position" in picture || "observedEntityId" in picture || "truthPosition" in picture || "truthEntityId" in picture) {
      throw new Error("Recorded observer picture exposes prohibited track or truth data.");
    }
  }
  for (const picture of expected) {
    const actual = pictures.find((candidate) =>
      candidate.perspective === picture.perspective && candidate.modelTimeSeconds === picture.modelTimeSeconds,
    );
    if (!actual || canonicalJson(actual) !== canonicalJson(picture)) {
      throw new Error("Recorded observer picture does not match the canonical tick state.");
    }
  }
}
