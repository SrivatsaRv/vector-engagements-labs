import type {
  EngineObservation,
  EngineTrack,
  EngineTrackLifecycle,
  ObserverPerspective,
  ObserverTrackModel,
  TrackTransitionCommit,
} from "./contracts.ts";
import type { Vec3 } from "./primitives.ts";

type EstimatedObservation = EngineObservation & {
  estimate: Extract<EngineObservation["estimate"], { valueState: "ESTIMATED" }>;
  uncertainty: Extract<EngineObservation["uncertainty"], { valueState: "ESTIMATED" }>;
};

export type TrackStoreIdentity = {
  owner: ObserverPerspective;
  source: EngineObservation["source"];
  trackOrdinal?: number;
};

const SHA256 = /^[a-f0-9]{64}$/;
const PROHIBITED_TRUTH_KEYS = new Set([
  "observedEntityId",
  "targetEntityId",
  "truthEntityId",
  "truthPosition",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const expectedSet = new Set(expected);
  const extra = Object.keys(value).find((key) => !expectedSet.has(key));
  const missing = expected.find((key) => !Object.hasOwn(value, key));
  if (extra || missing) throw new Error(`${label} has an unsupported or missing field.`);
}

function finiteVector(value: unknown): value is Vec3 {
  return record(value) &&
    Object.keys(value).length === 3 &&
    [value.x, value.y, value.z].every((item) => typeof item === "number" && Number.isFinite(item));
}

function positiveVector(value: unknown): value is Vec3 {
  return finiteVector(value) && value.x > 0 && value.y > 0 && value.z > 0;
}

function invalidObservationWindows(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.some((candidate, index) => {
    if (!record(candidate)) return true;
    const prior = index > 0 && record(value[index - 1]) ? value[index - 1] : undefined;
    return Object.keys(candidate).length !== 2 ||
      !Number.isFinite(candidate.start) || !Number.isFinite(candidate.end) ||
      (candidate.start as number) < 0 || (candidate.end as number) < (candidate.start as number) ||
      (prior !== undefined && (candidate.start as number) <= (prior.end as number));
  });
}

function findTruthKey(value: unknown): string | undefined {
  if (!record(value)) return undefined;
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_TRUTH_KEYS.has(key)) return key;
    const nested = findTruthKey(child);
    if (nested) return nested;
  }
}

export function assertNoTruthIdentity(value: unknown, boundary: string) {
  const key = findTruthKey(value);
  if (key) throw new Error(`${boundary} contains prohibited truth identity field ${key}.`);
}

export function assertVerificationTrackModel(model: unknown, intendedUseId: string): asserts model is ObserverTrackModel {
  if (!record(model)) throw new Error("Generic track model is invalid.");
  exactKeys(model, [
    "schemaVersion",
    "valueState",
    "intendedUse",
    "positionBiasM",
    "velocityBiasMps",
    "positionStandardDeviationM",
    "velocityStandardDeviationMps",
    "confirmationObservations",
    "maximumObservationAgeSeconds",
    "coastAfterSeconds",
    "lostAfterSeconds",
    "observationWindowsSeconds",
  ], "Generic track model");
  if (
    model.schemaVersion !== "vector.generic-track-model.v1" ||
    model.valueState !== "TEST_FIXTURE" ||
    model.intendedUse !== "ENGINE_VERIFICATION_ONLY" ||
    intendedUseId !== "vector.intended-use.engine-verification"
  ) {
    throw new Error("Generic track models are admitted only for engine verification.");
  }
  if (
    !finiteVector(model.positionBiasM) ||
    !finiteVector(model.velocityBiasMps) ||
    !positiveVector(model.positionStandardDeviationM) ||
    !positiveVector(model.velocityStandardDeviationMps) ||
    !Number.isSafeInteger(model.confirmationObservations) ||
    (model.confirmationObservations as number) < 2 ||
    typeof model.maximumObservationAgeSeconds !== "number" ||
    !Number.isFinite(model.maximumObservationAgeSeconds) ||
    model.maximumObservationAgeSeconds < 0 ||
    typeof model.coastAfterSeconds !== "number" ||
    !Number.isFinite(model.coastAfterSeconds) ||
    model.coastAfterSeconds <= 0 ||
    typeof model.lostAfterSeconds !== "number" ||
    !Number.isFinite(model.lostAfterSeconds) ||
    model.lostAfterSeconds <= model.coastAfterSeconds ||
    invalidObservationWindows(model.observationWindowsSeconds)
  ) {
    throw new Error("Generic track model bounds are invalid.");
  }
}

export function createVerificationObservation(input: {
  identity: EngineObservation["source"];
  owner: ObserverPerspective;
  sourceSequence: number;
  sourceTimeSeconds: number;
  measuredPositionM: Vec3;
  measuredVelocityMps: Vec3;
  model: ObserverTrackModel;
}): EngineObservation {
  const sequence = input.sourceSequence.toString().padStart(8, "0");
  const stable = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    schemaVersion: "vector.observation.v1",
    id: `${input.owner}-OBS-${sequence}`,
    owner: input.owner,
    source: { ...input.identity },
    sourceSequence: input.sourceSequence,
    sourceTimeSeconds: input.sourceTimeSeconds,
    estimate: {
      valueState: "ESTIMATED",
      positionM: {
        x: stable(input.measuredPositionM.x + input.model.positionBiasM.x),
        y: stable(input.measuredPositionM.y + input.model.positionBiasM.y),
        z: stable(input.measuredPositionM.z + input.model.positionBiasM.z),
      },
      velocityMps: {
        x: stable(input.measuredVelocityMps.x + input.model.velocityBiasMps.x),
        y: stable(input.measuredVelocityMps.y + input.model.velocityBiasMps.y),
        z: stable(input.measuredVelocityMps.z + input.model.velocityBiasMps.z),
      },
    },
    uncertainty: {
      valueState: "ESTIMATED",
      positionStandardDeviationM: { ...input.model.positionStandardDeviationM },
      velocityStandardDeviationMps: { ...input.model.velocityStandardDeviationMps },
    },
  };
}

function cloneTrack(track: EngineTrack): EngineTrack {
  return {
    ...track,
    source: { ...track.source },
    estimate: {
      valueState: "ESTIMATED",
      positionM: { ...track.estimate.positionM },
      velocityMps: { ...track.estimate.velocityMps },
    },
    uncertainty: {
      valueState: "ESTIMATED",
      positionStandardDeviationM: { ...track.uncertainty.positionStandardDeviationM },
      velocityStandardDeviationMps: { ...track.uncertainty.velocityStandardDeviationMps },
    },
  };
}

export class TrackStore {
  readonly owner: ObserverPerspective;
  readonly source: EngineObservation["source"];
  readonly trackId: string;
  readonly model: ObserverTrackModel;
  #track?: EngineTrack;
  #transitionSequence = 0;

  constructor(identity: TrackStoreIdentity, model: ObserverTrackModel, intendedUseId: string) {
    assertVerificationTrackModel(model, intendedUseId);
    if (
      !SHA256.test(identity.source.modelPackDigest) ||
      !identity.source.sensorModelId ||
      !identity.source.sensorModelVersion
    ) throw new Error("TrackStore source identity is incomplete.");
    const ordinal = identity.trackOrdinal ?? 1;
    if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
      throw new Error("TrackStore ordinal must be a positive safe integer.");
    }
    this.owner = identity.owner;
    this.source = structuredClone(identity.source);
    this.trackId = `${identity.owner}-TRACK-${ordinal.toString().padStart(4, "0")}`;
    this.model = structuredClone(model);
  }

  #transition(
    from: "NONE" | EngineTrackLifecycle,
    to: EngineTrackLifecycle,
    cause: TrackTransitionCommit["cause"],
    observationId?: string,
  ): TrackTransitionCommit {
    this.#transitionSequence += 1;
    const track = this.#track!;
    return {
      localKey: `track:${this.trackId}:${this.#transitionSequence.toString().padStart(6, "0")}`,
      trackId: this.trackId,
      owner: this.owner,
      from,
      to,
      cause,
      source: { ...track.source },
      sourceSequence: track.sourceSequence,
      sourceTimeSeconds: track.sourceTimeSeconds,
      ...(observationId ? { observationId } : {}),
    };
  }

  #assertObservation(value: unknown, currentTimeSeconds: number): asserts value is EstimatedObservation {
    assertNoTruthIdentity(value, "Observation");
    if (!record(value)) throw new Error("Observation is invalid.");
    exactKeys(value, [
      "schemaVersion", "id", "owner", "source", "sourceSequence",
      "sourceTimeSeconds", "estimate", "uncertainty",
    ], "Observation");
    const observation = value as unknown as EngineObservation;
    if (
      observation.schemaVersion !== "vector.observation.v1" ||
      !observation.id ||
      observation.owner !== this.owner
    ) throw new Error("Observation owner or schema is invalid for this TrackStore.");
    if (!record(observation.source)) throw new Error("Observation source identity is invalid.");
    exactKeys(observation.source, ["modelPackDigest", "sensorModelId", "sensorModelVersion"], "Observation source");
    if (
      !SHA256.test(observation.source.modelPackDigest) ||
      observation.source.modelPackDigest !== this.source.modelPackDigest ||
      observation.source.sensorModelId !== this.source.sensorModelId ||
      observation.source.sensorModelVersion !== this.source.sensorModelVersion
    ) throw new Error("Observation source identity does not match this TrackStore.");
    if (
      !Number.isSafeInteger(observation.sourceSequence) ||
      observation.sourceSequence < 1 ||
      !Number.isFinite(observation.sourceTimeSeconds) ||
      observation.sourceTimeSeconds < 0 ||
      observation.sourceTimeSeconds > currentTimeSeconds ||
      currentTimeSeconds - observation.sourceTimeSeconds > this.model.maximumObservationAgeSeconds
    ) throw new Error("Observation sequence or model time is stale or invalid.");
    if (
      this.#track &&
      (observation.sourceSequence <= this.#track.sourceSequence ||
        observation.sourceTimeSeconds <= this.#track.sourceTimeSeconds)
    ) throw new Error("Observation is duplicate, stale, or out of order.");
    if (
      observation.estimate.valueState !== "ESTIMATED" ||
      !finiteVector(observation.estimate.positionM) ||
      !finiteVector(observation.estimate.velocityMps)
    ) throw new Error("Observation has no admitted positional estimate.");
    if (
      observation.uncertainty.valueState !== "ESTIMATED" ||
      !positiveVector(observation.uncertainty.positionStandardDeviationM) ||
      !positiveVector(observation.uncertainty.velocityStandardDeviationMps)
    ) throw new Error("Observation has no admitted finite uncertainty.");
  }

  update(currentTimeSeconds: number, observation?: unknown) {
    if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
      throw new Error("TrackStore model time is invalid.");
    }
    const transitions: TrackTransitionCommit[] = [];
    if (observation !== undefined) {
      this.#assertObservation(observation, currentTimeSeconds);
      const previous = this.#track?.state ?? "NONE";
      const updateCount = (previous === "LOST" ? 0 : this.#track?.updateCount ?? 0) + 1;
      const state: EngineTrackLifecycle =
        previous === "COASTING" ? "CONFIRMED" :
        previous === "LOST" || previous === "NONE" ? "TENTATIVE" :
        updateCount >= this.model.confirmationObservations ? "CONFIRMED" : "TENTATIVE";
      this.#track = {
        schemaVersion: "vector.track.v1",
        trackId: this.trackId,
        owner: this.owner,
        source: { ...observation.source },
        sourceSequence: observation.sourceSequence,
        sourceTimeSeconds: observation.sourceTimeSeconds,
        state,
        estimate: {
          valueState: "ESTIMATED",
          positionM: { ...observation.estimate.positionM },
          velocityMps: { ...observation.estimate.velocityMps },
        },
        uncertainty: {
          valueState: "ESTIMATED",
          positionStandardDeviationM: { ...observation.uncertainty.positionStandardDeviationM },
          velocityStandardDeviationMps: { ...observation.uncertainty.velocityStandardDeviationMps },
        },
        updateCount,
        ageSeconds: currentTimeSeconds - observation.sourceTimeSeconds,
        freshUntilSeconds: observation.sourceTimeSeconds + this.model.coastAfterSeconds,
        expiresAtSeconds: observation.sourceTimeSeconds + this.model.lostAfterSeconds,
      };
      if (previous === "NONE") transitions.push(this.#transition(previous, state, "INITIAL_OBSERVATION", observation.id));
      else if (previous === "LOST" || previous === "COASTING") transitions.push(this.#transition(previous, state, "OBSERVATION_REACQUIRED", observation.id));
      else if (previous === "TENTATIVE" && state === "CONFIRMED") transitions.push(this.#transition(previous, state, "CONFIRMATION_THRESHOLD_MET", observation.id));
    } else if (this.#track) {
      const ageSeconds = currentTimeSeconds - this.#track.sourceTimeSeconds;
      const previous = this.#track.state;
      const state: EngineTrackLifecycle =
        previous !== "LOST" && ageSeconds > this.model.lostAfterSeconds ? "LOST" :
        previous === "CONFIRMED" && ageSeconds > this.model.coastAfterSeconds ? "COASTING" :
        previous === "TENTATIVE" && ageSeconds > this.model.coastAfterSeconds ? "LOST" : previous;
      this.#track = { ...this.#track, state, ageSeconds };
      if (state !== previous) {
        transitions.push(this.#transition(previous, state, state === "COASTING" ? "FRESHNESS_EXPIRED" : "TRACK_EXPIRED"));
      }
    }
    return {
      snapshot: { track: this.#track ? cloneTrack(this.#track) : undefined },
      transitions,
    };
  }
}
