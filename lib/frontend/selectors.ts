import type {
  EngineEntityDefinition,
  EngineEntityFrame,
} from "../engine/contracts.ts";
import type { Frame, RaspTrack, SimulationResult } from "../simulation.ts";

export type SelectedDisplayFrame = {
  frame: Frame;
  frameIndex: number;
  displayTimeSeconds: number;
};

export function selectDisplayFrame(
  result: SimulationResult,
  requestedTimeSeconds: number,
): SelectedDisplayFrame {
  if (!result.frames.length) {
    throw new Error("A display frame cannot be selected from an empty record.");
  }
  const requested = Number.isFinite(requestedTimeSeconds)
    ? requestedTimeSeconds
    : result.frames[0].t;
  let frameIndex = 0;
  for (let index = 1; index < result.frames.length; index += 1) {
    if (
      Math.abs(result.frames[index].t - requested) <
      Math.abs(result.frames[frameIndex].t - requested)
    ) {
      frameIndex = index;
    }
  }
  const frame = result.frames[frameIndex];
  return { frame, frameIndex, displayTimeSeconds: frame.t };
}

export type EntityMetricSeries = {
  id: string;
  label: string;
  affiliation: EngineEntityFrame["affiliation"];
  kind: EngineEntityFrame["kind"];
  values: Array<number | null>;
  current: number | null;
};

export function selectEntityMetricSeries(
  result: SimulationResult,
  selected: SelectedDisplayFrame,
  metric: (entity: EngineEntityFrame) => number,
  include: (entity: EngineEntityDefinition) => boolean = () => true,
): EntityMetricSeries[] {
  const identities = result.entityManifest.filter(include);
  return identities.map((identity) => {
    const values = result.frames.map((sample) => {
      const state = sample.entities.find((entity) => entity.id === identity.id);
      if (!state || state.lifecycle === "STOWED") return null;
      const value = metric(state);
      return Number.isFinite(value) ? value : null;
    });
    return {
      id: identity.id,
      label: identity.designation,
      affiliation: identity.affiliation,
      kind: identity.kind,
      values,
      current: values[selected.frameIndex] ?? null,
    };
  });
}

export type SelectedTrackState =
  | {
      state: "AVAILABLE";
      track: RaspTrack;
      displayTimeSeconds: number;
    }
  | {
      state: "UNAVAILABLE";
      perspective: "IAF" | "PAF";
      displayTimeSeconds: number;
      reason: "PICTURE_NOT_RECORDED";
    };

/**
 * Select one recorded, side-owned picture sample for the already selected
 * frame. This selector never derives a track, position, confidence, or value.
 */
export function selectRecordedTrackState(
  pictures: readonly RaspTrack[],
  selected: SelectedDisplayFrame,
  perspective: "IAF" | "PAF",
): SelectedTrackState {
  const track = pictures.find(
    (candidate) =>
      candidate.perspective === perspective &&
      candidate.modelTimeSeconds === selected.displayTimeSeconds,
  );
  if (!track) {
    return {
      state: "UNAVAILABLE",
      perspective,
      displayTimeSeconds: selected.displayTimeSeconds,
      reason: "PICTURE_NOT_RECORDED",
    };
  }
  return {
    state: "AVAILABLE",
    track,
    displayTimeSeconds: selected.displayTimeSeconds,
  };
}

export type ObserverEntityPresentation =
  | { state: "MODEL_TRUTH" }
  | { state: "HIDDEN" }
  | { state: "ESTIMATED"; position: NonNullable<RaspTrack["position"]> };

/**
 * Decides whether an entity may appear in a side-owned observer picture.
 * A track without an admitted visible estimate fails closed. Callers that did
 * not select an observer picture retain the separate Model Truth view.
 */
export function selectObserverEntityPresentation(
  track: RaspTrack | undefined,
  entityId: string,
): ObserverEntityPresentation {
  if (!track || track.observedEntityId !== entityId) return { state: "MODEL_TRUTH" };
  if (!track.visible || !track.position) return { state: "HIDDEN" };
  return { state: "ESTIMATED", position: track.position };
}
