import type {
  EngineEntityDefinition,
  EngineEntityFrame,
} from "../engine/contracts.ts";
import type { Frame, SimulationResult } from "../simulation.ts";

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
