import { canonicalJson } from "../canonical-json.ts";
import { assertEngineObserverState } from "../information-state.ts";
import type {
  EngineFrame,
  EngineScenario,
  EntityLifecycle,
  EngineTermination,
  SimulationEventParticipant,
  SimulationEventPayload,
  SimulationEventV2,
} from "./contracts.ts";
import {
  SIMULATION_EVENT_PAYLOAD_SCHEMAS,
  SIMULATION_EVENT_SCHEMA,
} from "./contracts.ts";

export const MAX_SIMULATION_EVENTS = 100_000;

export type SimulationEventReceipt = {
  tick: number;
  localKey: string;
};

export type SimulationEventCauseReference = {
  kind: "EVENT_RECEIPT";
  receipt: SimulationEventReceipt;
};

export type SimulationEventDraft = Omit<
  SimulationEventV2,
  "schemaVersion" | "id" | "sequence" | "frameIndex" | "causeEventIds"
> & {
  causes: SimulationEventCauseReference[];
};

const PHASES = [
  "LIFECYCLE",
  "SENSING",
  "TRACKING",
  "MISSION",
  "WEAPON",
  "TERMINATION",
] as const;
const phaseRank = Object.fromEntries(PHASES.map((phase, index) => [phase, index]));
const PAYLOAD_KINDS = [
  "RUN_STARTED",
  "ENTITY_ENTERED_WORLD",
  "ENTITY_LIFECYCLE_CHANGED",
  "AIRCRAFT_OPERATIONAL_STATE_CHANGED",
  "AIRBORNE_STORE_TRANSFER_OUTCOME",
  "WEAPON_TERMINATED",
  "RUN_COMPLETED",
  "TRACK_STATE_CHANGED",
] as const;
const payloadRank = Object.fromEntries(PAYLOAD_KINDS.map((kind, index) => [kind, index]));
const ENTITY_KINDS = [
  "AIRCRAFT",
  "GUIDED_WEAPON",
  "AIR_DEFENCE_SYSTEM",
  "RADAR",
  "SURFACE_LAUNCHER",
  "BASE",
  "FIXED_OBJECTIVE",
] as const;
const LIFECYCLES = ["STOWED", "ACTIVE", "TRACKING", "ENGAGING", "TERMINATED"] as const;
const AIRCRAFT_OPERATIONAL_STATES = ["PARKED", "HOLD_SHORT", "TAKEOFF_ROLL", "ROTATE", "CLIMBOUT", "ENROUTE", "ABORTED"] as const;
const ACTIVE_LIFECYCLES = ["ACTIVE", "TRACKING", "ENGAGING"] as const;
const TERMINATIONS = [
  "threshold_reached",
  "energy_depleted",
  "weapon_intercept",
  "weapon_miss",
  "weapon_expired",
  "weapon_failed",
  "target_unavailable",
  "time_limit",
  "invalid_scenario",
] as const;
const PARTICIPANT_ROLES = ["ACTOR", "SUBJECT", "LAUNCHER", "WEAPON", "TARGET", "SENSOR"] as const;
const WEAPON_TERMINAL_STATES = ["INTERCEPT", "MISS", "EXPIRED", "FAILED", "SELF_DESTRUCT", "TARGET_UNAVAILABLE"] as const;
const WEAPON_NON_TERMINAL_STATES = ["STOWED", "BOOST", "COAST", "TERMINAL_GUIDANCE"] as const;
const WEAPON_TERMINATION_CAUSES = ["GEOMETRIC_INTERCEPT", "ENERGY_DEPLETED", "FLIGHT_TIME_EXPIRED", "TERRAIN_IMPACT", "TARGET_UNAVAILABLE"] as const;
const TRACK_STATES = ["TENTATIVE", "CONFIRMED", "COASTING", "LOST"] as const;
const TRACK_FROM_STATES = ["NONE", ...TRACK_STATES] as const;
const TRACK_CAUSES = [
  "INITIAL_OBSERVATION",
  "CONFIRMATION_THRESHOLD_MET",
  "FRESHNESS_EXPIRED",
  "OBSERVATION_REACQUIRED",
  "TRACK_EXPIRED",
] as const;
const UTF8_ENCODER = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  label = "Simulation event",
) {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!(key in value)) throw new Error(`${label} is missing ${key}.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field ${key}.`);
  }
}

function nonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function member<T extends string>(value: unknown, values: readonly T[], label: string): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${label} is unsupported.`);
  }
}

export function compareCanonicalText(left: string, right: string) {
  if (left === right) return 0;
  const leftBytes = UTF8_ENCODER.encode(left);
  const rightBytes = UTF8_ENCODER.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index]! - rightBytes[index]!;
  }
  return leftBytes.length - rightBytes.length;
}

function receiptKey(receipt: SimulationEventReceipt) {
  return `${receipt.tick}\u0000${receipt.localKey}`;
}

export function modelTimeAtTick(tick: number, fixedStepSeconds: number) {
  return tick * fixedStepSeconds;
}

export function recordedModelTimeAtTick(tick: number, fixedStepSeconds: number) {
  return Number(modelTimeAtTick(tick, fixedStepSeconds).toFixed(6));
}

export function firstFixedStepTickAtOrAfter(
  modelTimeSeconds: number,
  fixedStepSeconds: number,
) {
  if (
    !Number.isFinite(modelTimeSeconds) ||
    modelTimeSeconds < 0 ||
    !Number.isFinite(fixedStepSeconds) ||
    fixedStepSeconds <= 0
  ) {
    throw new Error("Fixed-step activation boundary requires finite non-negative time and a positive step.");
  }
  let candidate = Math.ceil(modelTimeSeconds / fixedStepSeconds);
  if (!Number.isSafeInteger(candidate)) {
    throw new Error("Fixed-step activation boundary exceeds the safe tick range.");
  }
  while (
    candidate > 0 &&
    modelTimeAtTick(candidate - 1, fixedStepSeconds) >= modelTimeSeconds
  ) {
    candidate -= 1;
  }
  while (modelTimeAtTick(candidate, fixedStepSeconds) < modelTimeSeconds) {
    candidate += 1;
    if (!Number.isSafeInteger(candidate)) {
      throw new Error("Fixed-step activation boundary exceeds the safe tick range.");
    }
  }
  return candidate;
}

function normalizeParticipants(
  participants: readonly SimulationEventParticipant[],
): SimulationEventParticipant[] {
  const byKey = new Map<string, SimulationEventParticipant>();
  for (const participant of participants) {
    const key = `${participant.entityId}\u0000${participant.role}`;
    byKey.set(key, { entityId: participant.entityId, role: participant.role });
  }
  return [...byKey.values()].sort((left, right) =>
    compareCanonicalText(left.entityId, right.entityId) || compareCanonicalText(left.role, right.role)
  );
}

function participantKey(participants: readonly SimulationEventParticipant[]) {
  return normalizeParticipants(participants)
    .map(({ entityId, role }) => `${entityId}:${role}`)
    .join("|");
}

function causeDraftKey(causes: readonly SimulationEventCauseReference[]) {
  return [...causes]
    .map((cause) => `RECEIPT:${cause.receipt.tick}:${cause.receipt.localKey}`)
    .sort(compareCanonicalText)
    .join("|");
}

function payloadSortKey(payload: SimulationEventPayload) {
  if (payload.kind === "RUN_STARTED") {
    return canonicalJson(["0", payload.schemaVersion, payload.scenarioId, payload.scenarioVersion]);
  }
  if (payload.kind === "ENTITY_ENTERED_WORLD") {
    return canonicalJson(["1", payload.schemaVersion, payload.entityKind, payload.lifecycle]);
  }
  if (payload.kind === "ENTITY_LIFECYCLE_CHANGED") {
    return canonicalJson(["2", payload.schemaVersion, payload.entityKind, payload.from, payload.to]);
  }
  if (payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED") {
    return canonicalJson([
      "3", payload.schemaVersion, payload.from, payload.to,
      payload.movementValueState, payload.groundDynamicsDigest,
    ]);
  }
  if (payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME") {
    return canonicalJson([
      "4", payload.schemaVersion, payload.transferId, payload.launcherId,
      payload.stationId, payload.storeId, payload.operation,
      payload.requestedTimeSeconds, payload.requestedTick, payload.transferDigest,
    ]);
  }
  if (payload.kind === "WEAPON_TERMINATED") {
    return canonicalJson([
      "5", payload.schemaVersion, payload.weaponId, payload.targetId,
      payload.from, payload.to, payload.cause, payload.occurrenceTimeSeconds,
    ]);
  }
  if (payload.kind === "RUN_COMPLETED") {
    return canonicalJson(["6", payload.schemaVersion, payload.termination]);
  }
  return canonicalJson([
    "7", payload.schemaVersion, payload.perspective, payload.trackId,
    payload.from, payload.to, payload.cause, payload.sensorModelId,
    payload.sensorModelVersion, payload.modelPackDigest, payload.sourceSequence,
    payload.sourceTimeSeconds, payload.estimateValueState, payload.uncertaintyValueState,
  ]);
}

function canonicalDraftSortKey(event: SimulationEventDraft) {
  return [
    String(phaseRank[event.phase] ?? 999),
    String(payloadRank[event.payload.kind] ?? 999),
    payloadSortKey(event.payload),
    event.producer.subsystem,
    event.producer.entityId ?? "",
    participantKey(event.participants),
    event.knowledgeScope,
    event.ownerAffiliation ?? "",
    event.correlationId ?? "",
    event.localKey,
    causeDraftKey(event.causes),
  ].join("\u0001");
}

function canonicalCommittedSortKey(event: SimulationEventV2) {
  return [
    String(phaseRank[event.phase] ?? 999),
    String(payloadRank[event.payload.kind] ?? 999),
    payloadSortKey(event.payload),
    event.producer.subsystem,
    event.producer.entityId ?? "",
    participantKey(event.participants),
    event.knowledgeScope,
    event.ownerAffiliation ?? "",
    event.correlationId ?? "",
    event.localKey,
    [...event.causeEventIds].sort(compareCanonicalText).join("|"),
  ].join("\u0001");
}

function compareDrafts(left: SimulationEventDraft, right: SimulationEventDraft) {
  return compareCanonicalText(canonicalDraftSortKey(left), canonicalDraftSortKey(right));
}

function assertPayload(value: unknown, index: number): asserts value is SimulationEventPayload {
  if (!isRecord(value)) throw new Error(`Simulation event ${index} payload must be an object.`);
  member(value.kind, PAYLOAD_KINDS, `Simulation event ${index} payload kind`);
  if (value.kind === "RUN_STARTED") {
    exactKeys(value, ["kind", "schemaVersion", "scenarioId", "scenarioVersion"], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_STARTED) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    nonEmptyString(value.scenarioId, `Simulation event ${index} scenario ID`);
    nonEmptyString(value.scenarioVersion, `Simulation event ${index} scenario version`);
  } else if (value.kind === "ENTITY_ENTERED_WORLD") {
    exactKeys(value, ["kind", "schemaVersion", "entityKind", "lifecycle"], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_ENTERED_WORLD) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    member(value.entityKind, ENTITY_KINDS, `Simulation event ${index} entity kind`);
    member(value.lifecycle, ACTIVE_LIFECYCLES, `Simulation event ${index} world-entry lifecycle`);
  } else if (value.kind === "ENTITY_LIFECYCLE_CHANGED") {
    exactKeys(value, ["kind", "schemaVersion", "entityKind", "from", "to"], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.ENTITY_LIFECYCLE_CHANGED) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    member(value.entityKind, ENTITY_KINDS, `Simulation event ${index} entity kind`);
    member(value.from, LIFECYCLES, `Simulation event ${index} prior lifecycle`);
    member(value.to, LIFECYCLES, `Simulation event ${index} next lifecycle`);
    if (value.from === value.to) throw new Error(`Simulation event ${index} records an unchanged lifecycle.`);
  } else if (value.kind === "WEAPON_TERMINATED") {
    exactKeys(value, [
      "kind", "schemaVersion", "weaponId", "targetId", "from", "to", "cause",
      "criterion", "closestApproachM", "occurrenceTimeSeconds", "interceptRadiusM",
      "maximumFlightTimeSeconds", "targetEffect",
    ], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.WEAPON_TERMINATED) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    nonEmptyString(value.weaponId, `Simulation event ${index} weapon ID`);
    nonEmptyString(value.targetId, `Simulation event ${index} target ID`);
    member(value.from, WEAPON_NON_TERMINAL_STATES, `Simulation event ${index} prior weapon state`);
    member(value.to, WEAPON_TERMINAL_STATES, `Simulation event ${index} terminal weapon state`);
    member(value.cause, WEAPON_TERMINATION_CAUSES, `Simulation event ${index} weapon termination cause`);
    if (value.criterion !== "GEOMETRIC_CLOSEST_APPROACH" || value.targetEffect !== "NOT_MODELLED") throw new Error(`Simulation event ${index} weapon termination authority is unsupported.`);
    for (const [field, fieldValue] of [
      ["closest approach", value.closestApproachM],
      ["occurrence time", value.occurrenceTimeSeconds],
      ["intercept radius", value.interceptRadiusM],
      ["maximum flight time", value.maximumFlightTimeSeconds],
    ] as const) {
      if (!Number.isFinite(fieldValue) || (fieldValue as number) < 0) throw new Error(`Simulation event ${index} ${field} is invalid.`);
    }
    if ((value.interceptRadiusM as number) <= 0 || (value.maximumFlightTimeSeconds as number) <= 0) throw new Error(`Simulation event ${index} weapon termination limits are invalid.`);
    const causeMatchesState =
      (value.to === "INTERCEPT" && value.cause === "GEOMETRIC_INTERCEPT" && (value.closestApproachM as number) <= (value.interceptRadiusM as number)) ||
      (value.to === "MISS" && value.cause === "ENERGY_DEPLETED") ||
      (value.to === "EXPIRED" && value.cause === "FLIGHT_TIME_EXPIRED") ||
      (value.to === "FAILED" && value.cause === "TERRAIN_IMPACT") ||
      (value.to === "TARGET_UNAVAILABLE" && value.cause === "TARGET_UNAVAILABLE");
    if (!causeMatchesState) throw new Error(`Simulation event ${index} weapon terminal state and cause are inconsistent.`);
  } else if (value.kind === "RUN_COMPLETED") {
    exactKeys(value, ["kind", "schemaVersion", "termination"], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    member(value.termination, TERMINATIONS, `Simulation event ${index} termination`);
  } else if (value.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED") {
    exactKeys(value, ["kind", "schemaVersion", "from", "to", "movementValueState", "groundDynamicsDigest"], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.AIRCRAFT_OPERATIONAL_STATE_CHANGED) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    member(value.from, AIRCRAFT_OPERATIONAL_STATES, `Simulation event ${index} prior aircraft operational state`);
    member(value.to, AIRCRAFT_OPERATIONAL_STATES, `Simulation event ${index} next aircraft operational state`);
    if (value.from === value.to) throw new Error(`Simulation event ${index} records an unchanged aircraft operational state.`);
    member(value.movementValueState, ["VALID", "TERMINATED"], `Simulation event ${index} movement value state`);
    if (typeof value.groundDynamicsDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.groundDynamicsDigest)) {
      throw new Error(`Simulation event ${index} ground-dynamics digest is invalid.`);
    }
  } else if (value.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME") {
    exactKeys(value, [
      "kind", "schemaVersion", "transferId", "launcherId", "stationId",
      "storeId", "operation", "requestedTimeSeconds", "requested",
      "requestedTick",
      "accepted", "achieved", "limiter", "cause", "storeMassKg",
      "installedDragAreaM2", "installedDragNewtons", "launcherMassBeforeKg",
      "launcherMassAfterKg", "launcherFuelBeforeKg", "launcherFuelAfterKg",
      "installedDragAreaBeforeM2", "installedDragAreaAfterM2", "transferDigest",
    ], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.AIRBORNE_STORE_TRANSFER_OUTCOME) {
      throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    }
    for (const [field, fieldValue] of [
      ["transfer ID", value.transferId],
      ["launcher ID", value.launcherId],
      ["station ID", value.stationId],
      ["store ID", value.storeId],
    ] as const) nonEmptyString(fieldValue, `Simulation event ${index} ${field}`);
    member(value.operation, ["RELEASE", "JETTISON"], `Simulation event ${index} store operation`);
    if (!Number.isFinite(value.requestedTimeSeconds) || (value.requestedTimeSeconds as number) < 0) {
      throw new Error(`Simulation event ${index} requested time is invalid.`);
    }
    if (!Number.isSafeInteger(value.requestedTick) || (value.requestedTick as number) < 0) {
      throw new Error(`Simulation event ${index} requested tick is invalid.`);
    }
    if (value.requested !== true || typeof value.accepted !== "boolean" || typeof value.achieved !== "boolean") {
      throw new Error(`Simulation event ${index} store-transfer result is invalid.`);
    }
    const outcomeIsValid = value.accepted === true && value.achieved === true
      ? value.limiter === "NONE" && value.cause === "AIRBORNE_TRANSFER_ADMITTED"
      : value.accepted === false && value.achieved === false && (
          (value.limiter === "AIRCRAFT_STATE" && value.cause === "AIRCRAFT_NOT_ENROUTE") ||
          (value.limiter === "STORE_INVENTORY" && value.cause === "STORE_NOT_INSTALLED") ||
          (value.limiter === "DRAG_AUTHORITY" && value.cause === "INSTALLED_DRAG_EXCEEDED")
        );
    if (!outcomeIsValid) {
      throw new Error(`Simulation event ${index} store-transfer limiter or cause is invalid.`);
    }
    if (!Number.isFinite(value.storeMassKg) || (value.storeMassKg as number) <= 0) {
      throw new Error(`Simulation event ${index} store mass is invalid.`);
    }
    if (!Number.isFinite(value.installedDragAreaM2) || (value.installedDragAreaM2 as number) <= 0) {
      throw new Error(`Simulation event ${index} installed drag area is invalid.`);
    }
    if (!Number.isFinite(value.installedDragNewtons) || (value.installedDragNewtons as number) < 0) {
      throw new Error(`Simulation event ${index} installed drag force is invalid.`);
    }
    for (const [field, fieldValue] of [
      ["launcher mass before", value.launcherMassBeforeKg],
      ["launcher mass after", value.launcherMassAfterKg],
      ["launcher fuel before", value.launcherFuelBeforeKg],
      ["launcher fuel after", value.launcherFuelAfterKg],
      ["installed drag area before", value.installedDragAreaBeforeM2],
      ["installed drag area after", value.installedDragAreaAfterM2],
    ] as const) {
      if (!Number.isFinite(fieldValue) || (fieldValue as number) < 0) {
        throw new Error(`Simulation event ${index} ${field} is invalid.`);
      }
    }
    const massChangeKg = (value.launcherMassBeforeKg as number) - (value.launcherMassAfterKg as number);
    const dragAreaChangeM2 = (value.installedDragAreaBeforeM2 as number) - (value.installedDragAreaAfterM2 as number);
    if (
      value.launcherFuelBeforeKg !== value.launcherFuelAfterKg ||
      (value.achieved
        ? Math.abs(massChangeKg - (value.storeMassKg as number)) > 1e-9 || Math.abs(dragAreaChangeM2 - (value.installedDragAreaM2 as number)) > 1e-12
        : massChangeKg !== 0 || dragAreaChangeM2 !== 0 || value.installedDragNewtons !== 0)
    ) throw new Error(`Simulation event ${index} transfer discontinuity is invalid.`);
    if (typeof value.transferDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.transferDigest)) {
      throw new Error(`Simulation event ${index} transfer digest is invalid.`);
    }
  } else {
    exactKeys(value, [
      "kind", "schemaVersion", "perspective", "trackId", "from", "to", "cause",
      "sensorModelId", "sensorModelVersion", "modelPackDigest", "sourceSequence",
      "sourceAssociationId", "sourceTimeSeconds", "observationId", "estimateValueState", "uncertaintyValueState",
    ], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.TRACK_STATE_CHANGED) {
      throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    }
    member(value.perspective, ["IAF", "PAF"], `Simulation event ${index} track perspective`);
    nonEmptyString(value.trackId, `Simulation event ${index} track ID`);
    member(value.from, TRACK_FROM_STATES, `Simulation event ${index} prior track state`);
    member(value.to, TRACK_STATES, `Simulation event ${index} next track state`);
    member(value.cause, TRACK_CAUSES, `Simulation event ${index} track cause`);
    if (value.from === value.to) throw new Error(`Simulation event ${index} records an unchanged track state.`);
    nonEmptyString(value.sensorModelId, `Simulation event ${index} sensor model ID`);
    nonEmptyString(value.sensorModelVersion, `Simulation event ${index} sensor model version`);
    nonEmptyString(value.sourceAssociationId, `Simulation event ${index} source association ID`);
    if (typeof value.modelPackDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.modelPackDigest)) {
      throw new Error(`Simulation event ${index} model-pack digest is invalid.`);
    }
    if (!Number.isSafeInteger(value.sourceSequence) || (value.sourceSequence as number) < 1) {
      throw new Error(`Simulation event ${index} source sequence is invalid.`);
    }
    if (!Number.isFinite(value.sourceTimeSeconds) || (value.sourceTimeSeconds as number) < 0) {
      throw new Error(`Simulation event ${index} source time is invalid.`);
    }
    if (!(value.observationId === null || (typeof value.observationId === "string" && value.observationId.length > 0))) {
      throw new Error(`Simulation event ${index} observation identity is invalid.`);
    }
    if (value.estimateValueState !== "ESTIMATED" || value.uncertaintyValueState !== "ESTIMATED") {
      throw new Error(`Simulation event ${index} track value state is invalid.`);
    }
  }
}

function assertDraftShape(event: SimulationEventDraft) {
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) throw new Error("Simulation event tick must be a non-negative safe integer.");
  if (!Number.isFinite(event.modelTimeSeconds) || event.modelTimeSeconds < 0) throw new Error("Simulation event model time must be finite and non-negative.");
  nonEmptyString(event.localKey, "Simulation event local key");
  if (!Array.isArray(event.causes)) throw new Error("Simulation event causes must be an array.");
  for (const [index, cause] of event.causes.entries()) {
    if (!isRecord(cause)) throw new Error(`Simulation event cause ${index} must be an object.`);
    exactKeys(cause, ["kind", "receipt"], [], `Simulation event cause ${index}`);
    member(cause.kind, ["EVENT_RECEIPT"], `Simulation event cause ${index} kind`);
    if (!isRecord(cause.receipt)) throw new Error(`Simulation event cause ${index} receipt must be an object.`);
    exactKeys(cause.receipt, ["tick", "localKey"], [], `Simulation event cause ${index} receipt`);
    if (!Number.isSafeInteger(cause.receipt.tick) || (cause.receipt.tick as number) < 0) throw new Error(`Simulation event cause ${index} receipt tick must be a non-negative safe integer.`);
    nonEmptyString(cause.receipt.localKey, `Simulation event cause ${index} receipt local key`);
  }
  if (new Set(event.causes.map((cause) => canonicalJson(cause))).size !== event.causes.length) throw new Error("Simulation event causal references must be unique.");
  event.participants = normalizeParticipants(event.participants);
}

/** Deterministic per-tick journal. It records committed transitions; it never drives them. */
export class SimulationEventJournal {
  private readonly committed: SimulationEventV2[] = [];
  private readonly committedSequenceByReceipt = new Map<string, number>();
  private pending: SimulationEventDraft[] = [];

  emit(event: SimulationEventDraft): SimulationEventReceipt {
    const copy = structuredClone(event);
    assertDraftShape(copy);
    this.pending.push(copy);
    return { tick: copy.tick, localKey: copy.localKey };
  }

  hasPending() {
    return this.pending.length > 0;
  }

  resolveReceipt(receipt: SimulationEventReceipt) {
    const sequence = this.committedSequenceByReceipt.get(receiptKey(receipt));
    if (sequence === undefined) throw new Error("Simulation event receipt is unresolved.");
    return `event-${sequence.toString().padStart(6, "0")}`;
  }

  commitTick(tick: number, modelTimeSeconds: number, frameIndex: number) {
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) throw new Error("Simulation event frame index must be a non-negative safe integer.");
    if (this.committed.length + this.pending.length > MAX_SIMULATION_EVENTS) throw new Error(`Simulation event stream exceeds ${MAX_SIMULATION_EVENTS} events.`);
    for (const event of this.pending) {
      if (event.tick !== tick || event.modelTimeSeconds !== modelTimeSeconds) throw new Error("Simulation event tick commit does not match its pending event time.");
    }
    const ordered = [...this.pending].sort(compareDrafts);
    const indexByLocalKey = new Map<string, number>();
    const duplicateTransitions = new Set<string>();
    const committedBase = this.committed.length;
    for (const [index, event] of ordered.entries()) {
      if (indexByLocalKey.has(event.localKey)) throw new Error(`Simulation event tick repeats local key ${event.localKey}.`);
      indexByLocalKey.set(event.localKey, index);
      const key = canonicalJson({ tick: event.tick, producer: event.producer, participants: event.participants, payload: event.payload });
      if (duplicateTransitions.has(key)) throw new Error("Simulation event stream contains a duplicate transition.");
      duplicateTransitions.add(key);
    }
    for (const [index, event] of ordered.entries()) {
      const causeSequences: number[] = [];
      for (const cause of event.causes) {
        const receipt = cause.receipt;
        if (receipt.tick > tick) {
          throw new Error(`Simulation event receipt ${receipt.localKey} is future or cyclic.`);
        }
        if (receipt.tick < tick) {
          const sequence = this.committedSequenceByReceipt.get(receiptKey(receipt));
          if (sequence === undefined) throw new Error(`Simulation event receipt ${receipt.localKey} is unresolved.`);
          causeSequences.push(sequence);
        } else {
          const causeIndex = indexByLocalKey.get(receipt.localKey);
          if (causeIndex === undefined) throw new Error(`Simulation event receipt ${receipt.localKey} is unresolved.`);
          if (causeIndex >= index) throw new Error(`Simulation event receipt ${receipt.localKey} is future or cyclic.`);
          causeSequences.push(committedBase + causeIndex);
        }
      }
      const causeEventIds = [...new Set(causeSequences)]
        .sort((left, right) => left - right)
        .map((sequence) => `event-${sequence.toString().padStart(6, "0")}`);
      if (causeEventIds.length !== event.causes.length) throw new Error("Simulation event causal references resolve to a duplicate event.");
      const sequence = this.committed.length;
      const committed: SimulationEventV2 = {
        schemaVersion: SIMULATION_EVENT_SCHEMA,
        id: `event-${sequence.toString().padStart(6, "0")}`,
        sequence,
        localKey: event.localKey,
        tick,
        modelTimeSeconds,
        frameIndex,
        phase: event.phase,
        producer: structuredClone(event.producer),
        ...(event.ownerAffiliation ? { ownerAffiliation: event.ownerAffiliation } : {}),
        knowledgeScope: event.knowledgeScope,
        participants: normalizeParticipants(event.participants),
        causeEventIds,
        ...(event.correlationId ? { correlationId: event.correlationId } : {}),
        payload: structuredClone(event.payload),
      };
      this.committed.push(committed);
      this.committedSequenceByReceipt.set(
        receiptKey({ tick: committed.tick, localKey: committed.localKey }),
        committed.sequence,
      );
    }
    this.pending = [];
  }

  items() {
    if (this.pending.length > 0) throw new Error("Simulation event journal has uncommitted tick events.");
    return structuredClone(this.committed);
  }
}

export function assertSimulationEventStream(
  values: readonly unknown[],
  frames: readonly EngineFrame[],
  scenario: EngineScenario,
  termination: EngineTermination,
  closestApproachM: number,
): asserts values is readonly SimulationEventV2[] {
  if (typeof closestApproachM !== "number" || Number.isNaN(closestApproachM) || closestApproachM < 0) {
    throw new Error("Simulation event stream has an invalid run closest approach.");
  }
  if (values.length > MAX_SIMULATION_EVENTS) throw new Error(`Simulation event stream exceeds ${MAX_SIMULATION_EVENTS} events.`);
  const entityById = new Map(scenario.entities.map((entity) => [entity.id, entity]));
  const lifecycleByEntity = new Map<string, EntityLifecycle>(
    scenario.entities.map((entity) => [entity.id, entity.lifecycle]),
  );
  const enteredEntityIds = new Set<string>();
  const firstFrameIndexByEntity = new Map<string, number>();
  const finalLifecycleByEntity = new Map<string, EntityLifecycle>();
  const frameTransitionsByEntity = new Map<
    string,
    Array<{ frameIndex: number; from: EntityLifecycle; to: EntityLifecycle }>
  >();
  const frameOperationalTransitionsByEntity = new Map<
    string,
    Array<{ frameIndex: number; from: NonNullable<EngineFrame["entities"][number]["aircraftOperationalState"]>; to: NonNullable<EngineFrame["entities"][number]["aircraftOperationalState"]> }>
  >();
  const finalOperationalStateByEntity = new Map<string, NonNullable<EngineFrame["entities"][number]["aircraftOperationalState"]>>();
  const frameTransitionsByTrack = new Map<
    string,
    Array<{
      frameIndex: number;
      from: "NONE" | "TENTATIVE" | "CONFIRMED" | "COASTING" | "LOST";
      to: "TENTATIVE" | "CONFIRMED" | "COASTING" | "LOST";
    }>
  >();
  const priorTrackState = new Map<string, "TENTATIVE" | "CONFIRMED" | "COASTING" | "LOST">();
  for (const [frameIndex, frame] of frames.entries()) {
    for (const state of frame.observerStates) {
      assertEngineObserverState(state);
      const owner = state.perspective === "IAF" ? "BLUE" : "RED";
      const admitted = "sensorModelId" in state
        ? scenario.modelPack.observerSensors.find((sensor) => sensor.modelId === state.sensorModelId)
        : undefined;
      if ("sensorModelId" in state && !admitted) {
        throw new Error("Observer state source is not bound to the compiled scenario sensor projection.");
      }
      if (state.schemaVersion === "vector.observer-state.v3") {
        const producer = scenario.entities.find((entity) =>
          entity.kind === "AIRCRAFT" && entity.affiliation === owner &&
          entity.observerSensor?.modelId === state.sensorModelId &&
          entity.observerSensor.modelVersion === admitted?.modelVersion &&
          entity.observerSensor.modelPackDigest === scenario.modelPack.digest,
        );
        if (!producer) throw new Error("Observer state source is not bound to an admitted scenario sensor.");
        for (const value of [...state.observations, ...state.tracks]) {
          if (
            value.source.modelPackDigest !== scenario.modelPack.digest ||
            value.source.sensorModelId !== admitted?.modelId ||
            value.source.sensorModelVersion !== admitted?.modelVersion
          ) throw new Error("Observer observation or track source is not bound to the compiled scenario.");
        }
      }
    }
    for (const entity of frame.entities) {
      if (!firstFrameIndexByEntity.has(entity.id)) {
        firstFrameIndexByEntity.set(entity.id, frameIndex);
      }
      const priorLifecycle = finalLifecycleByEntity.get(entity.id);
      if (priorLifecycle !== undefined && priorLifecycle !== entity.lifecycle) {
        const transitions = frameTransitionsByEntity.get(entity.id) ?? [];
        transitions.push({ frameIndex, from: priorLifecycle, to: entity.lifecycle });
        frameTransitionsByEntity.set(entity.id, transitions);
      }
      finalLifecycleByEntity.set(entity.id, entity.lifecycle);
      if (entity.aircraftOperationalState) {
        const priorOperationalState = finalOperationalStateByEntity.get(entity.id);
        if (priorOperationalState !== undefined && priorOperationalState !== entity.aircraftOperationalState) {
          const transitions = frameOperationalTransitionsByEntity.get(entity.id) ?? [];
          transitions.push({ frameIndex, from: priorOperationalState, to: entity.aircraftOperationalState });
          frameOperationalTransitionsByEntity.set(entity.id, transitions);
        }
        finalOperationalStateByEntity.set(entity.id, entity.aircraftOperationalState);
      }
    }
    for (const observer of frame.observerStates) {
      if (observer.schemaVersion !== "vector.observer-state.v3") continue;
      for (const track of observer.tracks) {
        const key = `${observer.perspective}\u0000${track.trackId}`;
        const from = priorTrackState.get(key) ?? "NONE";
        if (from !== track.state) {
          const transitions = frameTransitionsByTrack.get(key) ?? [];
          transitions.push({ frameIndex, from, to: track.state });
          frameTransitionsByTrack.set(key, transitions);
        }
        priorTrackState.set(key, track.state);
      }
    }
  }
  const consumedFrameTransitionsByEntity = new Map<string, number>();
  const consumedOperationalTransitionsByEntity = new Map<string, number>();
  const seenIds = new Set<string>();
  const seenTransitions = new Set<string>();
  const seenLocalKeysByTick = new Map<number, Set<string>>();
  const consumedFrameTransitionsByTrack = new Map<string, number>();
  const lastEventIdByTrack = new Map<string, string>();
  let prior: SimulationEventV2 | undefined;
  let weaponTerminationEvents = 0;
  let weaponTerminationPayload: Extract<SimulationEventPayload, { kind: "WEAPON_TERMINATED" }> | undefined;
  for (const [index, raw] of values.entries()) {
    if (!isRecord(raw)) throw new Error(`Simulation event ${index} must be an object.`);
    exactKeys(raw, ["schemaVersion", "id", "sequence", "localKey", "tick", "modelTimeSeconds", "frameIndex", "phase", "producer", "knowledgeScope", "participants", "causeEventIds", "payload"], ["ownerAffiliation", "correlationId"], `Simulation event ${index}`);
    if (raw.schemaVersion !== SIMULATION_EVENT_SCHEMA) throw new Error(`Simulation event ${index} has an unsupported schema.`);
    nonEmptyString(raw.localKey, `Simulation event ${index} local key`);
    if (raw.sequence !== index || raw.id !== `event-${index.toString().padStart(6, "0")}`) throw new Error(`Simulation event ${index} has an invalid sequence or ID.`);
    if (!Number.isSafeInteger(raw.tick) || (raw.tick as number) < 0) throw new Error(`Simulation event ${index} has an invalid tick.`);
    const expectedTime = recordedModelTimeAtTick(raw.tick as number, scenario.fixedStepSeconds);
    if (raw.modelTimeSeconds !== expectedTime) throw new Error(`Simulation event ${index} does not match its fixed-step tick.`);
    if (!Number.isSafeInteger(raw.frameIndex) || (raw.frameIndex as number) < 0 || (raw.frameIndex as number) >= frames.length) throw new Error(`Simulation event ${index} references a missing frame.`);
    if (!Number.isFinite(raw.modelTimeSeconds) || frames[raw.frameIndex as number]!.t !== raw.modelTimeSeconds) throw new Error(`Simulation event ${index} does not reference its exact model-time frame.`);
    member(raw.phase, PHASES, `Simulation event ${index} phase`);
    if (!isRecord(raw.producer)) throw new Error(`Simulation event ${index} producer must be an object.`);
    exactKeys(raw.producer, ["subsystem"], ["entityId"], `Simulation event ${index} producer`);
    member(raw.producer.subsystem, ["RUN_COORDINATOR", "ENTITY_LIFECYCLE", "AIRCRAFT_DYNAMICS", "WEAPON_DYNAMICS", "SENSOR_TRACK"], `Simulation event ${index} producer subsystem`);
    if (raw.producer.entityId !== undefined) nonEmptyString(raw.producer.entityId, `Simulation event ${index} producer entity`);
    member(raw.knowledgeScope, ["WORLD", "SIDE_OWNED"], `Simulation event ${index} knowledge scope`);
    if (raw.ownerAffiliation !== undefined) member(raw.ownerAffiliation, ["BLUE", "RED", "NEUTRAL"], `Simulation event ${index} owner affiliation`);
    if (raw.correlationId !== undefined) nonEmptyString(raw.correlationId, `Simulation event ${index} correlation ID`);
    if (!Array.isArray(raw.participants)) throw new Error(`Simulation event ${index} participants must be an array.`);
    const participants: SimulationEventParticipant[] = raw.participants.map((participant, participantIndex) => {
      if (!isRecord(participant)) throw new Error(`Simulation event ${index} participant ${participantIndex} must be an object.`);
      exactKeys(participant, ["entityId", "role"], [], `Simulation event ${index} participant ${participantIndex}`);
      nonEmptyString(participant.entityId, `Simulation event ${index} participant entity`);
      member(participant.role, PARTICIPANT_ROLES, `Simulation event ${index} participant role`);
      return { entityId: participant.entityId, role: participant.role };
    });
    if (canonicalJson(participants) !== canonicalJson(normalizeParticipants(participants))) throw new Error(`Simulation event ${index} participants are not canonical and unique.`);
    if (!Array.isArray(raw.causeEventIds) || raw.causeEventIds.some((cause) => typeof cause !== "string")) throw new Error(`Simulation event ${index} causal references must be strings.`);
    const causeEventIds = raw.causeEventIds as string[];
    if (new Set(causeEventIds).size !== causeEventIds.length) throw new Error(`Simulation event ${raw.id} repeats a causal reference.`);
    const causeSequences = causeEventIds.map((causeId) => {
      if (!seenIds.has(causeId) || causeId === raw.id) throw new Error(`Simulation event ${raw.id} has a missing or future causal reference.`);
      return Number(causeId.slice("event-".length));
    });
    if (causeSequences.some((value, causeIndex) => causeIndex > 0 && value <= causeSequences[causeIndex - 1]!)) throw new Error(`Simulation event ${raw.id} causal references are not canonical.`);
    assertPayload(raw.payload, index);
    if (raw.payload.kind !== "TRACK_STATE_CHANGED" && causeEventIds.length !== 0) {
      throw new Error(`Simulation event ${raw.id} payload family does not admit causal references.`);
    }
    const event = raw as unknown as SimulationEventV2;
    const tickLocalKeys = seenLocalKeysByTick.get(event.tick) ?? new Set<string>();
    if (tickLocalKeys.has(event.localKey)) {
      throw new Error(`Simulation event tick ${event.tick} repeats local key ${event.localKey}.`);
    }
    tickLocalKeys.add(event.localKey);
    seenLocalKeysByTick.set(event.tick, tickLocalKeys);
    if (seenIds.has(event.id)) throw new Error(`Duplicate simulation event ID ${event.id}.`);
    seenIds.add(event.id);
    if (event.payload.kind === "TRACK_STATE_CHANGED") {
      if (event.knowledgeScope !== "SIDE_OWNED" || !event.ownerAffiliation) {
        throw new Error(`Simulation event ${event.id} violates the side-owned track boundary.`);
      }
    } else if (event.knowledgeScope !== "WORLD" || event.ownerAffiliation !== undefined) {
      throw new Error(`Simulation event ${event.id} violates the delivered world-event boundary.`);
    }
    const transitionKey = canonicalJson({ tick: event.tick, producer: event.producer, participants: event.participants, payload: event.payload });
    if (seenTransitions.has(transitionKey)) throw new Error("Simulation event stream contains a duplicate transition.");
    seenTransitions.add(transitionKey);
    if (prior && (event.tick < prior.tick || event.frameIndex < prior.frameIndex || (event.tick === prior.tick && compareCanonicalText(canonicalCommittedSortKey(event), canonicalCommittedSortKey(prior)) < 0))) throw new Error(`Simulation event ${event.id} violates canonical order.`);

    const frame = frames[event.frameIndex]!;
    if (event.payload.kind === "RUN_STARTED") {
      if (index !== 0 || event.tick !== 0 || event.frameIndex !== 0 || event.phase !== "LIFECYCLE" || event.producer.subsystem !== "RUN_COORDINATOR" || event.producer.entityId !== undefined || event.participants.length !== 0 || event.payload.scenarioId !== scenario.id || event.payload.scenarioVersion !== scenario.version) throw new Error("RUN_STARTED event is inconsistent with its scenario boundary.");
    } else if (event.payload.kind === "RUN_COMPLETED") {
      if (index !== values.length - 1 || event.frameIndex !== frames.length - 1 || event.phase !== "TERMINATION" || event.producer.subsystem !== "RUN_COORDINATOR" || event.producer.entityId !== undefined || event.participants.length !== 0 || event.payload.termination !== termination) throw new Error("RUN_COMPLETED event does not reference the final retained frame or run termination.");
    } else if (event.payload.kind === "TRACK_STATE_CHANGED") {
      const payload = event.payload;
      const owner = payload.perspective === "IAF" ? "BLUE" : "RED";
      const producerId = event.producer.entityId;
      const producer = producerId ? entityById.get(producerId) : undefined;
      const observer = frame.observerStates.find((item) => item.perspective === payload.perspective);
      const track = observer?.schemaVersion === "vector.observer-state.v3"
        ? observer.tracks.find((item) => item.trackId === payload.trackId)
        : undefined;
      const observation = observer?.schemaVersion === "vector.observer-state.v3" && payload.observationId !== null
        ? observer.observations.find((item) => item.id === payload.observationId)
        : undefined;
      if (
        event.phase !== "TRACKING" ||
        event.producer.subsystem !== "SENSOR_TRACK" ||
        !producer || producer.kind !== "AIRCRAFT" || producer.affiliation !== owner ||
        event.ownerAffiliation !== owner ||
        event.participants.length !== 1 ||
        event.participants[0]?.entityId !== producerId ||
        event.participants[0]?.role !== "SENSOR" ||
        !track || track.state !== payload.to ||
        track.owner !== payload.perspective ||
        track.source.modelPackDigest !== payload.modelPackDigest ||
        track.source.sensorModelId !== payload.sensorModelId ||
        track.source.sensorModelVersion !== payload.sensorModelVersion ||
        track.sourceAssociationId !== payload.sourceAssociationId ||
        payload.modelPackDigest !== scenario.modelPack.digest ||
        !scenario.modelPack.observerSensors.some((sensor) =>
          sensor.modelId === payload.sensorModelId && sensor.modelVersion === payload.sensorModelVersion
        ) ||
        track.sourceSequence !== payload.sourceSequence ||
        track.sourceTimeSeconds !== payload.sourceTimeSeconds
      ) throw new Error(`Simulation track event ${event.id} has invalid ownership, source, or frame state.`);
      const key = `${payload.perspective}\u0000${payload.trackId}`;
      const transitionIndex = consumedFrameTransitionsByTrack.get(key) ?? 0;
      const transition = frameTransitionsByTrack.get(key)?.[transitionIndex];
      if (
        transition?.frameIndex !== event.frameIndex ||
        transition.from !== payload.from ||
        transition.to !== payload.to
      ) throw new Error(`Simulation event ${event.id} does not reference the first retained frame for its track transition.`);
      const priorTrackEventId = lastEventIdByTrack.get(key);
      if (priorTrackEventId === undefined) {
        if (payload.from !== "NONE" || event.causeEventIds.length !== 0) {
          throw new Error(`Simulation event ${event.id} has an invalid initial track cause.`);
        }
      } else if (event.causeEventIds.length !== 1 || event.causeEventIds[0] !== priorTrackEventId) {
        throw new Error(`Simulation event ${event.id} does not cite its prior track transition.`);
      }
      const validCause =
        (payload.from === "NONE" && payload.to === "TENTATIVE" && payload.cause === "INITIAL_OBSERVATION") ||
        (payload.from === "TENTATIVE" && payload.to === "CONFIRMED" && payload.cause === "CONFIRMATION_THRESHOLD_MET") ||
        (payload.from === "CONFIRMED" && payload.to === "COASTING" && payload.cause === "FRESHNESS_EXPIRED") ||
        ((payload.from === "COASTING" || payload.from === "LOST") &&
          (payload.to === "CONFIRMED" || payload.to === "TENTATIVE") &&
          payload.cause === "OBSERVATION_REACQUIRED") ||
        ((payload.from === "TENTATIVE" || payload.from === "CONFIRMED" || payload.from === "COASTING") &&
          payload.to === "LOST" && payload.cause === "TRACK_EXPIRED");
      if (!validCause) throw new Error(`Simulation event ${event.id} has an invalid track transition cause.`);
      const observationDriven = ["INITIAL_OBSERVATION", "CONFIRMATION_THRESHOLD_MET", "OBSERVATION_REACQUIRED"].includes(payload.cause);
      if (
        observationDriven !== (payload.observationId !== null) ||
        (observationDriven && (
          !observation ||
          observation.owner !== payload.perspective ||
          observation.sourceAssociationId !== payload.sourceAssociationId ||
          observation.sourceSequence !== payload.sourceSequence ||
          observation.sourceTimeSeconds !== payload.sourceTimeSeconds ||
          canonicalJson(observation.source) !== canonicalJson(track.source)
        ))
      ) throw new Error(`Simulation event ${event.id} has an invalid observation cause.`);
      consumedFrameTransitionsByTrack.set(key, transitionIndex + 1);
      lastEventIdByTrack.set(key, event.id);
    } else if (event.payload.kind === "AIRCRAFT_OPERATIONAL_STATE_CHANGED") {
      const entityId = event.producer.entityId;
      const entity = entityId ? entityById.get(entityId) : undefined;
      const frameEntity = entityId ? frame.entities.find((candidate) => candidate.id === entityId) : undefined;
      const groundDynamicsDigest = entity?.groundOperation?.groundDynamicsDigest;
      if (
        event.phase !== "MISSION" || event.producer.subsystem !== "AIRCRAFT_DYNAMICS" ||
        !entity || entity.kind !== "AIRCRAFT" || !frameEntity ||
        event.participants.length !== 1 || event.participants[0]?.entityId !== entityId ||
        event.participants[0]?.role !== "SUBJECT" ||
        frameEntity.aircraftOperationalState !== event.payload.to ||
        frameEntity.aircraftMovementValueState !== event.payload.movementValueState ||
        groundDynamicsDigest !== event.payload.groundDynamicsDigest
      ) throw new Error(`Simulation aircraft operational event ${event.id} has invalid ownership, authority, or frame state.`);
      const transitionIndex = consumedOperationalTransitionsByEntity.get(entityId!) ?? 0;
      const transition = frameOperationalTransitionsByEntity.get(entityId!)?.[transitionIndex];
      if (
        transition?.frameIndex !== event.frameIndex || transition.from !== event.payload.from ||
        transition.to !== event.payload.to
      ) throw new Error(`Simulation event ${event.id} does not reference the first retained frame for its aircraft operational transition.`);
      consumedOperationalTransitionsByEntity.set(entityId!, transitionIndex + 1);
    } else if (event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME") {
      const payload = event.payload;
      const launcher = entityById.get(payload.launcherId);
      const store = entityById.get(payload.storeId);
      const launcherFrame = frame.entities.find((candidate) => candidate.id === payload.launcherId);
      const storeFrame = frame.entities.find((candidate) => candidate.id === payload.storeId);
      const transfer = store?.weapon?.storeTransfer;
      const transferTick = firstFixedStepTickAtOrAfter(
        payload.requestedTimeSeconds,
        scenario.fixedStepSeconds,
      );
      if (
        event.phase !== "WEAPON" || event.producer.subsystem !== "AIRCRAFT_DYNAMICS" ||
        event.producer.entityId !== payload.launcherId ||
        !launcher || launcher.kind !== "AIRCRAFT" || !store || store.kind !== "GUIDED_WEAPON" ||
        !launcherFrame || !transfer ||
        event.tick !== transferTick || payload.requestedTick !== transferTick ||
        event.participants.length !== 2 ||
        !event.participants.some((item) => item.entityId === payload.launcherId && item.role === "LAUNCHER") ||
        !event.participants.some((item) => item.entityId === payload.storeId && item.role === "WEAPON") ||
        transfer.id !== payload.transferId || transfer.digest !== payload.transferDigest ||
        transfer.stationId !== payload.stationId || transfer.operation !== payload.operation ||
        transfer.storeMassKg !== payload.storeMassKg ||
        transfer.installedDragAreaM2 !== payload.installedDragAreaM2 ||
        launcherFrame.massKg !== payload.launcherMassAfterKg ||
        launcherFrame.fuelKg !== payload.launcherFuelAfterKg ||
        (payload.achieved ? (
          !storeFrame || storeFrame.lifecycle !== "ACTIVE" || launcherFrame.installedStoreIds.includes(payload.storeId) ||
          storeFrame.position.x !== launcherFrame.position.x ||
          storeFrame.position.y !== launcherFrame.position.y ||
          storeFrame.position.z !== launcherFrame.position.z ||
          storeFrame.velocity.x !== launcherFrame.velocity.x ||
          storeFrame.velocity.y !== launcherFrame.velocity.y ||
          storeFrame.velocity.z !== launcherFrame.velocity.z
        ) : (
          Boolean(storeFrame) || !launcherFrame.installedStoreIds.includes(payload.storeId) ||
          payload.launcherMassBeforeKg !== payload.launcherMassAfterKg ||
          payload.launcherFuelBeforeKg !== payload.launcherFuelAfterKg ||
          payload.installedDragAreaBeforeM2 !== payload.installedDragAreaAfterM2 ||
          payload.installedDragNewtons !== 0
        ))
      ) {
        throw new Error(`Simulation store-transfer event ${event.id} has invalid authority, ownership, or achieved frame state.`);
      }
    } else if (event.payload.kind === "WEAPON_TERMINATED") {
      weaponTerminationEvents += 1;
      const payload = event.payload;
      weaponTerminationPayload = payload;
      const weapon = entityById.get(payload.weaponId);
      const target = entityById.get(payload.targetId);
      const frameWeapon = frame.entities.find((candidate) => candidate.id === payload.weaponId);
      const admission = weapon?.weapon?.termination;
      if (
        event.phase !== "TERMINATION" || event.producer.subsystem !== "WEAPON_DYNAMICS" ||
        event.producer.entityId !== payload.weaponId || !weapon || weapon.kind !== "GUIDED_WEAPON" ||
        !target || !frameWeapon || frameWeapon.lifecycle !== "TERMINATED" ||
        frameWeapon.weaponFlightState !== payload.to || weapon.weapon?.targetEntityId !== payload.targetId ||
        event.participants.length !== 2 ||
        !event.participants.some((item) => item.entityId === payload.weaponId && item.role === "WEAPON") ||
        !event.participants.some((item) => item.entityId === payload.targetId && item.role === "TARGET") ||
        !admission || admission.criterion !== payload.criterion ||
        admission.interceptRadiusM !== payload.interceptRadiusM ||
        admission.maximumFlightTimeSeconds !== payload.maximumFlightTimeSeconds ||
        payload.occurrenceTimeSeconds < event.modelTimeSeconds - scenario.fixedStepSeconds - 1e-9 ||
        payload.occurrenceTimeSeconds > event.modelTimeSeconds + 1e-9
      ) throw new Error(`Simulation weapon-termination event ${event.id} has invalid authority, ownership, or achieved frame state.`);
      if (payload.cause === "FLIGHT_TIME_EXPIRED") {
        const achievedLaunchTimeSeconds = modelTimeAtTick(
          firstFixedStepTickAtOrAfter(
            weapon.weapon.launchTimeSeconds ?? 0,
            scenario.fixedStepSeconds,
          ),
          scenario.fixedStepSeconds,
        );
        const expectedExpiryTimeSeconds = Number((
          achievedLaunchTimeSeconds + admission.maximumFlightTimeSeconds
        ).toFixed(6));
        if (payload.occurrenceTimeSeconds !== expectedExpiryTimeSeconds) {
          throw new Error(`Simulation weapon-termination event ${event.id} does not match the exact admitted expiry time.`);
        }
      } else if (
        payload.cause !== "GEOMETRIC_INTERCEPT" &&
        payload.occurrenceTimeSeconds !== event.modelTimeSeconds
      ) {
        throw new Error(`Simulation weapon-termination event ${event.id} does not match its exact terminal boundary time.`);
      }
    } else {
      const entityId = event.producer.entityId;
      const entity = entityId ? entityById.get(entityId) : undefined;
      const frameEntity = entityId ? frame.entities.find((candidate) => candidate.id === entityId) : undefined;
      if (event.producer.subsystem !== "ENTITY_LIFECYCLE" || !entity || event.participants.length !== 1 || event.participants[0]?.entityId !== entityId || event.participants[0]?.role !== "SUBJECT" || event.payload.entityKind !== entity.kind || !frameEntity) throw new Error(`Simulation entity event ${event.id} has invalid ownership or frame state.`);
      if (event.payload.kind === "ENTITY_ENTERED_WORLD") {
        if (event.phase !== "LIFECYCLE" || frameEntity.lifecycle !== event.payload.lifecycle) throw new Error(`Simulation event ${event.id} has an invalid world-entry state.`);
        if (enteredEntityIds.has(entityId!)) throw new Error(`Simulation event ${event.id} repeats world entry for ${entityId}.`);
        const priorLifecycle = lifecycleByEntity.get(entityId!);
        if (priorLifecycle === "STOWED") {
          const launchTimeSeconds = entity.weapon?.launchTimeSeconds;
          const expectedLaunchTick = launchTimeSeconds === null || launchTimeSeconds === undefined
            ? undefined
            : firstFixedStepTickAtOrAfter(launchTimeSeconds, scenario.fixedStepSeconds);
          const terminalTick = firstFixedStepTickAtOrAfter(
            scenario.durationSeconds,
            scenario.fixedStepSeconds,
          );
          if (
            expectedLaunchTick === undefined ||
            expectedLaunchTick >= terminalTick ||
            event.tick !== expectedLaunchTick ||
            event.frameIndex !== firstFrameIndexByEntity.get(entityId!)
          ) {
            throw new Error(`Simulation event ${event.id} does not match the declared launch boundary.`);
          }
          lifecycleByEntity.set(entityId!, event.payload.lifecycle);
        } else if (
          event.tick !== 0 ||
          event.frameIndex !== 0 ||
          firstFrameIndexByEntity.get(entityId!) !== 0 ||
          priorLifecycle === "TERMINATED" ||
          priorLifecycle !== event.payload.lifecycle
        ) {
          throw new Error(`Simulation event ${event.id} does not match the entity's canonical pre-world lifecycle.`);
        }
        enteredEntityIds.add(entityId!);
      } else {
        const expectedPhase = event.payload.to === "TERMINATED" ? "TERMINATION" : "LIFECYCLE";
        if (event.phase !== expectedPhase || frameEntity.lifecycle !== event.payload.to) throw new Error(`Simulation event ${event.id} has an invalid lifecycle phase or frame state.`);
        if (!enteredEntityIds.has(entityId!)) throw new Error(`Simulation event ${event.id} changes lifecycle before world entry.`);
        if (lifecycleByEntity.get(entityId!) !== event.payload.from) {
          throw new Error(`Simulation event ${event.id} does not match the entity's prior canonical lifecycle.`);
        }
        const transitionIndex = consumedFrameTransitionsByEntity.get(entityId!) ?? 0;
        const frameTransition = frameTransitionsByEntity.get(entityId!)?.[transitionIndex];
        if (
          frameTransition?.frameIndex !== event.frameIndex ||
          frameTransition.from !== event.payload.from ||
          frameTransition.to !== event.payload.to
        ) {
          throw new Error(`Simulation event ${event.id} does not reference the first retained frame for its lifecycle transition.`);
        }
        consumedFrameTransitionsByEntity.set(entityId!, transitionIndex + 1);
        lifecycleByEntity.set(entityId!, event.payload.to);
      }
    }
    prior = event;
  }
  if (frames.length > 0) {
    const typed = values as readonly SimulationEventV2[];
    if (typed[0]?.payload.kind !== "RUN_STARTED") throw new Error("Simulation event stream is missing RUN_STARTED.");
    if (typed.at(-1)?.payload.kind !== "RUN_COMPLETED") throw new Error("Simulation event stream is missing RUN_COMPLETED.");
    const weaponTerminalRun = ["weapon_intercept", "weapon_miss", "weapon_expired", "weapon_failed", "target_unavailable"].includes(termination);
    if (weaponTerminationEvents !== (weaponTerminalRun ? 1 : 0)) {
      throw new Error("Simulation event stream does not contain the exact weapon termination required by the run outcome.");
    }
    const weaponTerminationByRunOutcome: Partial<Record<EngineTermination, {
      to: Extract<SimulationEventPayload, { kind: "WEAPON_TERMINATED" }>["to"];
      cause: Extract<SimulationEventPayload, { kind: "WEAPON_TERMINATED" }>["cause"];
    }>> = {
      weapon_intercept: { to: "INTERCEPT", cause: "GEOMETRIC_INTERCEPT" },
      weapon_miss: { to: "MISS", cause: "ENERGY_DEPLETED" },
      weapon_expired: { to: "EXPIRED", cause: "FLIGHT_TIME_EXPIRED" },
      weapon_failed: { to: "FAILED", cause: "TERRAIN_IMPACT" },
      target_unavailable: { to: "TARGET_UNAVAILABLE", cause: "TARGET_UNAVAILABLE" },
    };
    const expectedWeaponTermination = weaponTerminationByRunOutcome[termination];
    if (
      expectedWeaponTermination &&
      (weaponTerminationPayload?.to !== expectedWeaponTermination.to ||
        weaponTerminationPayload.cause !== expectedWeaponTermination.cause)
    ) {
      throw new Error("Simulation weapon-termination event does not match the exact run outcome.");
    }
    if (
      expectedWeaponTermination &&
      weaponTerminationPayload?.closestApproachM !== Number(closestApproachM.toFixed(6))
    ) {
      throw new Error("Simulation weapon-termination event does not match the recorded run closest approach.");
    }
    for (const entity of scenario.entities) {
      if (
        entity.lifecycle !== "STOWED" &&
        entity.lifecycle !== "TERMINATED" &&
        !enteredEntityIds.has(entity.id)
      ) {
        throw new Error(`Simulation event stream is missing initial world entry for ${entity.id}.`);
      }
      const finalLifecycle = finalLifecycleByEntity.get(entity.id);
      if (
        finalLifecycle &&
        lifecycleByEntity.get(entity.id) !== finalLifecycle
      ) {
        throw new Error(`Simulation event stream does not reach the final canonical lifecycle for ${entity.id}.`);
      }
      const consumedTransitions = consumedFrameTransitionsByEntity.get(entity.id) ?? 0;
      const retainedTransitions = frameTransitionsByEntity.get(entity.id)?.length ?? 0;
      if (consumedTransitions !== retainedTransitions) {
        throw new Error(`Simulation event stream is missing a retained lifecycle transition for ${entity.id}.`);
      }
      const consumedOperationalTransitions = consumedOperationalTransitionsByEntity.get(entity.id) ?? 0;
      const retainedOperationalTransitions = frameOperationalTransitionsByEntity.get(entity.id)?.length ?? 0;
      if (consumedOperationalTransitions !== retainedOperationalTransitions) {
        throw new Error(`Simulation event stream is missing a retained aircraft operational transition for ${entity.id}.`);
      }
    }
    for (const [key, transitions] of frameTransitionsByTrack) {
      if ((consumedFrameTransitionsByTrack.get(key) ?? 0) !== transitions.length) {
        throw new Error(`Simulation event stream is missing a retained track transition for ${key}.`);
      }
    }
  }
}
