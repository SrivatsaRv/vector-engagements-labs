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
};

const SHA256 = /^[a-f0-9]{64}$/;
const OPAQUE_ASSOCIATION_ID = /^(IAF|PAF)-SOURCE-[0-9]{4,8}$/;
const PROHIBITED_TRUTH_KEYS = new Set([
  "observedEntityId",
  "targetEntityId",
  "truthEntityId",
  "truthPosition",
  "worldEntityId",
  "entityTruthId",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const keys = Object.keys(value);
  const missing = expected.find((key) => !Object.hasOwn(value, key));
  if (keys.length !== expected.length || missing) {
    throw new Error(`${label} has an unsupported or missing field.`);
  }
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
  if (Array.isArray(value)) {
    for (const child of value) {
      const nested = findTruthKey(child);
      if (nested) return nested;
    }
    return undefined;
  }
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

export function assertTrackSourceIdentity(value: unknown, label = "Track source identity"): asserts value is EngineObservation["source"] {
  if (!record(value)) throw new Error(`${label} is invalid.`);
  exactKeys(value, ["modelPackDigest", "sensorModelId", "sensorModelVersion"], label);
  if (
    typeof value.modelPackDigest !== "string" || !SHA256.test(value.modelPackDigest) ||
    typeof value.sensorModelId !== "string" || value.sensorModelId.length === 0 ||
    typeof value.sensorModelVersion !== "string" || value.sensorModelVersion.length === 0
  ) throw new Error(`${label} is incomplete.`);
}

export function assertVerificationTrackModel(model: unknown, intendedUseId: string): asserts model is ObserverTrackModel {
  if (!record(model)) throw new Error("Generic track model is invalid.");
  exactKeys(model, [
    "schemaVersion", "valueState", "intendedUse", "positionBiasM", "velocityBiasMps",
    "positionStandardDeviationM", "velocityStandardDeviationMps", "confirmationObservations",
    "maximumObservationAgeSeconds", "coastAfterSeconds", "lostAfterSeconds", "observationWindowsSeconds",
  ], "Generic track model");
  if (
    model.schemaVersion !== "vector.generic-track-model.v1" ||
    model.valueState !== "TEST_FIXTURE" ||
    model.intendedUse !== "ENGINE_VERIFICATION_ONLY" ||
    intendedUseId !== "vector.intended-use.engine-verification"
  ) throw new Error("Generic track models are admitted only for engine verification.");
  if (
    !finiteVector(model.positionBiasM) || !finiteVector(model.velocityBiasMps) ||
    !positiveVector(model.positionStandardDeviationM) || !positiveVector(model.velocityStandardDeviationMps) ||
    !Number.isSafeInteger(model.confirmationObservations) || (model.confirmationObservations as number) < 2 ||
    typeof model.maximumObservationAgeSeconds !== "number" || !Number.isFinite(model.maximumObservationAgeSeconds) || model.maximumObservationAgeSeconds < 0 ||
    typeof model.coastAfterSeconds !== "number" || !Number.isFinite(model.coastAfterSeconds) || model.coastAfterSeconds <= 0 ||
    typeof model.lostAfterSeconds !== "number" || !Number.isFinite(model.lostAfterSeconds) || model.lostAfterSeconds <= model.coastAfterSeconds ||
    invalidObservationWindows(model.observationWindowsSeconds)
  ) throw new Error("Generic track model bounds are invalid.");
}

export function createVerificationObservation(input: {
  identity: EngineObservation["source"];
  owner: ObserverPerspective;
  sourceAssociationId: string;
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
    id: `${input.owner}-OBS-${input.sourceAssociationId.slice(`${input.owner}-SOURCE-`.length)}-${sequence}`,
    owner: input.owner,
    sourceAssociationId: input.sourceAssociationId,
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
    estimate: { valueState: "ESTIMATED", positionM: { ...track.estimate.positionM }, velocityMps: { ...track.estimate.velocityMps } },
    uncertainty: {
      valueState: "ESTIMATED",
      positionStandardDeviationM: { ...track.uncertainty.positionStandardDeviationM },
      velocityStandardDeviationMps: { ...track.uncertainty.velocityStandardDeviationMps },
    },
  };
}

function compareOpaqueId(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class TrackStore {
  readonly owner: ObserverPerspective;
  readonly source: EngineObservation["source"];
  readonly model: ObserverTrackModel;
  #tracks = new Map<string, EngineTrack>();
  #lastUpdateTimeSeconds = Number.NEGATIVE_INFINITY;

  constructor(identity: TrackStoreIdentity, model: ObserverTrackModel, intendedUseId: string) {
    assertVerificationTrackModel(model, intendedUseId);
    if (!record(identity)) throw new Error("TrackStore identity is invalid.");
    exactKeys(identity, ["owner", "source"], "TrackStore identity");
    if (identity.owner !== "IAF" && identity.owner !== "PAF") throw new Error("TrackStore owner is invalid.");
    assertTrackSourceIdentity(identity.source, "TrackStore source identity");
    assertNoTruthIdentity(identity, "TrackStore identity");
    this.owner = identity.owner;
    this.source = structuredClone(identity.source);
    this.model = structuredClone(model);
  }

  #trackId(sourceAssociationId: string) {
    return `${this.owner}-TRACK-${sourceAssociationId.slice(`${this.owner}-SOURCE-`.length)}`;
  }

  #transition(track: EngineTrack, from: "NONE" | EngineTrackLifecycle, to: EngineTrackLifecycle, cause: TrackTransitionCommit["cause"], observationId?: string): TrackTransitionCommit {
    return {
      localKey: `track:${track.trackId}:${track.sourceSequence.toString().padStart(8, "0")}:${to}`,
      trackId: track.trackId,
      owner: this.owner,
      from,
      to,
      cause,
      sourceAssociationId: track.sourceAssociationId,
      source: { ...track.source },
      sourceSequence: track.sourceSequence,
      sourceTimeSeconds: track.sourceTimeSeconds,
      ...(observationId ? { observationId } : {}),
    };
  }

  #assertObservation(value: unknown, currentTimeSeconds: number): asserts value is EstimatedObservation {
    if (!record(value)) throw new Error("Observation is invalid.");
    exactKeys(value, [
      "schemaVersion", "id", "owner", "sourceAssociationId", "source", "sourceSequence",
      "sourceTimeSeconds", "estimate", "uncertainty",
    ], "Observation");
    const observation = value as unknown as EngineObservation;
    if (
      observation.schemaVersion !== "vector.observation.v1" ||
      typeof observation.id !== "string" || observation.id.length === 0 ||
      observation.owner !== this.owner ||
      typeof observation.sourceAssociationId !== "string" ||
      !OPAQUE_ASSOCIATION_ID.test(observation.sourceAssociationId) ||
      !observation.sourceAssociationId.startsWith(`${this.owner}-`)
    ) throw new Error("Observation owner, association, or schema is invalid for this TrackStore.");
    if (!record(observation.source)) throw new Error("Observation source is invalid.");
    exactKeys(
      observation.source,
      ["modelPackDigest", "sensorModelId", "sensorModelVersion"],
      "Observation source",
    );
    if (
      observation.source.modelPackDigest !== this.source.modelPackDigest ||
      observation.source.sensorModelId !== this.source.sensorModelId ||
      observation.source.sensorModelVersion !== this.source.sensorModelVersion
    ) throw new Error("Observation source identity does not match this TrackStore.");
    const prior = this.#tracks.get(observation.sourceAssociationId);
    if (
      !Number.isSafeInteger(observation.sourceSequence) || observation.sourceSequence < 1 ||
      !Number.isFinite(observation.sourceTimeSeconds) || observation.sourceTimeSeconds < 0 ||
      observation.sourceTimeSeconds > currentTimeSeconds ||
      currentTimeSeconds - observation.sourceTimeSeconds > this.model.maximumObservationAgeSeconds
    ) throw new Error("Observation sequence or model time is stale or invalid.");
    if (prior && (observation.sourceSequence <= prior.sourceSequence || observation.sourceTimeSeconds <= prior.sourceTimeSeconds)) {
      throw new Error("Observation is duplicate, stale, or out of order.");
    }
    if (!record(observation.estimate)) throw new Error("Observation estimate is invalid.");
    exactKeys(observation.estimate, ["valueState", "positionM", "velocityMps"], "Observation estimate");
    if (observation.estimate.valueState !== "ESTIMATED" || !finiteVector(observation.estimate.positionM) || !finiteVector(observation.estimate.velocityMps)) {
      throw new Error("Observation has no admitted positional estimate.");
    }
    if (!record(observation.uncertainty)) throw new Error("Observation uncertainty is invalid.");
    exactKeys(observation.uncertainty, ["valueState", "positionStandardDeviationM", "velocityStandardDeviationMps"], "Observation uncertainty");
    if (observation.uncertainty.valueState !== "ESTIMATED" || !positiveVector(observation.uncertainty.positionStandardDeviationM) || !positiveVector(observation.uncertainty.velocityStandardDeviationMps)) {
      throw new Error("Observation has no admitted finite uncertainty.");
    }
  }

  update(currentTimeSeconds: number, values: readonly unknown[] = []) {
    if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0 || currentTimeSeconds < this.#lastUpdateTimeSeconds) {
      throw new Error("TrackStore model time is invalid or out of order.");
    }
    if (!Array.isArray(values)) throw new Error("TrackStore observations must be an array.");
    const observations = [...values];
    for (const observation of observations) this.#assertObservation(observation, currentTimeSeconds);
    observations.sort((left, right) => {
      const a = left as EstimatedObservation;
      const b = right as EstimatedObservation;
      return compareOpaqueId(a.sourceAssociationId, b.sourceAssociationId) ||
        a.sourceSequence - b.sourceSequence || compareOpaqueId(a.id, b.id);
    });
    const batchAssociations = new Set<string>();
    for (const observation of observations as EstimatedObservation[]) {
      if (batchAssociations.has(observation.sourceAssociationId)) throw new Error("Observation batch repeats a source association.");
      batchAssociations.add(observation.sourceAssociationId);
    }

    const transitions: TrackTransitionCommit[] = [];
    for (const observation of observations as EstimatedObservation[]) {
      const previousTrack = this.#tracks.get(observation.sourceAssociationId);
      const previous = previousTrack?.state ?? "NONE";
      const updateCount = (previous === "LOST" ? 0 : previousTrack?.updateCount ?? 0) + 1;
      const state: EngineTrackLifecycle = previous === "COASTING" ? "CONFIRMED" :
        previous === "LOST" || previous === "NONE" ? "TENTATIVE" :
        updateCount >= this.model.confirmationObservations ? "CONFIRMED" : "TENTATIVE";
      const track: EngineTrack = {
        schemaVersion: "vector.track.v1",
        trackId: this.#trackId(observation.sourceAssociationId),
        owner: this.owner,
        sourceAssociationId: observation.sourceAssociationId,
        source: { ...observation.source },
        sourceSequence: observation.sourceSequence,
        sourceTimeSeconds: observation.sourceTimeSeconds,
        state,
        estimate: { valueState: "ESTIMATED", positionM: { ...observation.estimate.positionM }, velocityMps: { ...observation.estimate.velocityMps } },
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
      this.#tracks.set(observation.sourceAssociationId, track);
      if (previous === "NONE") transitions.push(this.#transition(track, previous, state, "INITIAL_OBSERVATION", observation.id));
      else if (previous === "LOST" || previous === "COASTING") transitions.push(this.#transition(track, previous, state, "OBSERVATION_REACQUIRED", observation.id));
      else if (previous === "TENTATIVE" && state === "CONFIRMED") transitions.push(this.#transition(track, previous, state, "CONFIRMATION_THRESHOLD_MET", observation.id));
    }

    for (const [associationId, prior] of this.#tracks) {
      if (batchAssociations.has(associationId)) continue;
      const ageSeconds = currentTimeSeconds - prior.sourceTimeSeconds;
      const previous = prior.state;
      const state: EngineTrackLifecycle = previous !== "LOST" && ageSeconds > this.model.lostAfterSeconds ? "LOST" :
        previous === "CONFIRMED" && ageSeconds > this.model.coastAfterSeconds ? "COASTING" :
        previous === "TENTATIVE" && ageSeconds > this.model.coastAfterSeconds ? "LOST" : previous;
      const track = { ...prior, state, ageSeconds };
      this.#tracks.set(associationId, track);
      if (state !== previous) transitions.push(this.#transition(track, previous, state, state === "COASTING" ? "FRESHNESS_EXPIRED" : "TRACK_EXPIRED"));
    }

    const tracks = [...this.#tracks.values()]
      .sort((left, right) => compareOpaqueId(left.trackId, right.trackId))
      .map(cloneTrack);
    transitions.sort((left, right) =>
      compareOpaqueId(left.trackId, right.trackId) || compareOpaqueId(left.localKey, right.localKey),
    );
    this.#lastUpdateTimeSeconds = currentTimeSeconds;
    return { snapshot: { tracks }, transitions };
  }

  snapshot() {
    return {
      tracks: [...this.#tracks.values()]
        .sort((left, right) => compareOpaqueId(left.trackId, right.trackId))
        .map(cloneTrack),
    };
  }
}
