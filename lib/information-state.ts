import type { EngineFrame, EngineObserverState } from "./engine/contracts.ts";
import type { RaspTrack } from "./simulation.ts";
import { canonicalJson } from "./canonical-json.ts";

/**
 * Projects the observer state emitted by the simulation tick for display and
 * recording. This boundary deliberately does not read entity positions, range,
 * jammer state, or scenario controls: no admitted sensor model exists yet.
 */
type ObserverStateFrame = Pick<EngineFrame, "t" | "observerStates">;

export function projectObserverStates(frames: readonly ObserverStateFrame[]): RaspTrack[] {
  return frames.flatMap((frame) =>
    frame.observerStates.map((state) => ({
      ...state,
      modelTimeSeconds: frame.t,
      trackId: "UNAVAILABLE" as const,
      classification: "UNAVAILABLE" as const,
      identification: "UNKNOWN" as const,
      source: "No admitted sensor model",
      lastUpdateSeconds: frame.t,
      ageSeconds: 0,
      confidence: 0,
      uncertaintyMeters: 0,
      status: "NO_TRACK" as const,
    })),
  );
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
  return {
    schemaVersion: picture.schemaVersion,
    perspective: picture.perspective,
    sensorState: picture.sensorState,
    observationCount: picture.observationCount,
    trackState: picture.trackState,
    visible: picture.visible,
    availabilityReason: picture.availabilityReason,
    effectScope: picture.effectScope,
    stateExplanation: picture.stateExplanation,
  };
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
    const key = `${picture.perspective}:${picture.modelTimeSeconds}`;
    if (seen.has(key)) throw new Error("Recorded observer picture has a duplicate side/frame identity.");
    seen.add(key);
    if ("position" in picture || "observedEntityId" in picture || "truthPosition" in picture) {
      throw new Error("Recorded observer picture exposes prohibited track or truth data.");
    }
    if (
      picture.schemaVersion !== "vector.observer-state.v1" ||
      picture.sensorState !== "UNSUPPORTED" ||
      picture.observationCount !== 0 ||
      picture.trackState !== "UNSUPPORTED" ||
      picture.visible ||
      picture.availabilityReason !== "SENSOR_MODEL_UNAVAILABLE" ||
      picture.effectScope !== "AIR_PICTURE_ONLY" ||
      picture.trackId !== "UNAVAILABLE" ||
      picture.status !== "NO_TRACK" ||
      picture.confidence !== 0 ||
      picture.uncertaintyMeters !== 0
    ) {
      throw new Error("Recorded observer picture is not the admitted fail-closed state.");
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
