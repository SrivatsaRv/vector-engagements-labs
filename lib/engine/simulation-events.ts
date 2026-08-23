import { canonicalJson } from "../canonical-json.ts";
import type {
  EngineFrame,
  EngineScenario,
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

export type SimulationEventDraftReference = {
  tick: number;
  localKey: string;
};

export type SimulationEventCauseReference =
  | { kind: "COMMITTED_EVENT"; eventId: string }
  | { kind: "SAME_TICK_EVENT"; reference: SimulationEventDraftReference };

export type SimulationEventDraft = Omit<
  SimulationEventV2,
  "schemaVersion" | "id" | "sequence" | "frameIndex" | "causeEventIds"
> & {
  causes: SimulationEventCauseReference[];
  localOrdinal?: number;
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
  "RUN_COMPLETED",
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
const ACTIVE_LIFECYCLES = ["ACTIVE", "TRACKING", "ENGAGING"] as const;
const TERMINATIONS = [
  "threshold_reached",
  "energy_depleted",
  "target_unavailable",
  "time_limit",
  "invalid_scenario",
] as const;
const PARTICIPANT_ROLES = ["ACTOR", "SUBJECT", "LAUNCHER", "WEAPON", "SENSOR"] as const;

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

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
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
    compareText(left.entityId, right.entityId) || compareText(left.role, right.role)
  );
}

function participantKey(participants: readonly SimulationEventParticipant[]) {
  return normalizeParticipants(participants)
    .map(({ entityId, role }) => `${entityId}:${role}`)
    .join("|");
}

function causeDraftKey(causes: readonly SimulationEventCauseReference[]) {
  return [...causes]
    .map((cause) => cause.kind === "COMMITTED_EVENT"
      ? `COMMITTED:${cause.eventId}`
      : `SAME_TICK:${cause.reference.tick}:${cause.reference.localKey}`)
    .sort()
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
  return canonicalJson(["3", payload.schemaVersion, payload.termination]);
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
    String(event.localOrdinal ?? 0).padStart(10, "0"),
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
    "0000000000",
    [...event.causeEventIds].sort().join("|"),
  ].join("\u0001");
}

function compareDrafts(left: SimulationEventDraft, right: SimulationEventDraft) {
  return compareText(canonicalDraftSortKey(left), canonicalDraftSortKey(right));
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
  } else {
    exactKeys(value, ["kind", "schemaVersion", "termination"], [], `Simulation event ${index} payload`);
    if (value.schemaVersion !== SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED) throw new Error(`Simulation event ${index} payload schema is unsupported.`);
    member(value.termination, TERMINATIONS, `Simulation event ${index} termination`);
  }
}

function assertDraftShape(event: SimulationEventDraft) {
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) throw new Error("Simulation event tick must be a non-negative safe integer.");
  if (!Number.isFinite(event.modelTimeSeconds) || event.modelTimeSeconds < 0) throw new Error("Simulation event model time must be finite and non-negative.");
  nonEmptyString(event.localKey, "Simulation event local key");
  if (!Number.isSafeInteger(event.localOrdinal ?? 0) || (event.localOrdinal ?? 0) < 0) throw new Error("Simulation event local ordinal must be a non-negative safe integer.");
  if (new Set(event.causes.map((cause) => canonicalJson(cause))).size !== event.causes.length) throw new Error("Simulation event causal references must be unique.");
  event.participants = normalizeParticipants(event.participants);
}

/** Deterministic per-tick journal. It records committed transitions; it never drives them. */
export class SimulationEventJournal {
  private readonly committed: SimulationEventV2[] = [];
  private readonly committedSequenceById = new Map<string, number>();
  private pending: SimulationEventDraft[] = [];

  emit(event: SimulationEventDraft): SimulationEventDraftReference {
    const copy = structuredClone(event);
    assertDraftShape(copy);
    this.pending.push(copy);
    return { tick: copy.tick, localKey: copy.localKey };
  }

  hasPending() {
    return this.pending.length > 0;
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
        if (cause.kind === "COMMITTED_EVENT") {
          const sequence = this.committedSequenceById.get(cause.eventId);
          if (sequence === undefined) throw new Error(`Simulation event causal reference ${cause.eventId} does not precede its response.`);
          causeSequences.push(sequence);
        } else {
          if (cause.reference.tick !== tick) throw new Error("Same-tick simulation event reference uses a different tick.");
          const causeIndex = indexByLocalKey.get(cause.reference.localKey);
          if (causeIndex === undefined) throw new Error(`Same-tick simulation event reference ${cause.reference.localKey} is missing.`);
          if (causeIndex >= index) throw new Error(`Same-tick simulation event reference ${cause.reference.localKey} is future or cyclic.`);
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
      this.committedSequenceById.set(committed.id, committed.sequence);
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
): asserts values is readonly SimulationEventV2[] {
  if (values.length > MAX_SIMULATION_EVENTS) throw new Error(`Simulation event stream exceeds ${MAX_SIMULATION_EVENTS} events.`);
  const entityById = new Map(scenario.entities.map((entity) => [entity.id, entity]));
  const seenIds = new Set<string>();
  const seenTransitions = new Set<string>();
  const seenLocalKeysByTick = new Map<number, Set<string>>();
  let prior: SimulationEventV2 | undefined;
  for (const [index, raw] of values.entries()) {
    if (!isRecord(raw)) throw new Error(`Simulation event ${index} must be an object.`);
    exactKeys(raw, ["schemaVersion", "id", "sequence", "localKey", "tick", "modelTimeSeconds", "frameIndex", "phase", "producer", "knowledgeScope", "participants", "causeEventIds", "payload"], ["ownerAffiliation", "correlationId"], `Simulation event ${index}`);
    if (raw.schemaVersion !== SIMULATION_EVENT_SCHEMA) throw new Error(`Simulation event ${index} has an unsupported schema.`);
    nonEmptyString(raw.localKey, `Simulation event ${index} local key`);
    if (raw.sequence !== index || raw.id !== `event-${index.toString().padStart(6, "0")}`) throw new Error(`Simulation event ${index} has an invalid sequence or ID.`);
    if (!Number.isSafeInteger(raw.tick) || (raw.tick as number) < 0) throw new Error(`Simulation event ${index} has an invalid tick.`);
    const expectedTime = Number(((raw.tick as number) * scenario.fixedStepSeconds).toFixed(6));
    if (raw.modelTimeSeconds !== expectedTime) throw new Error(`Simulation event ${index} does not match its fixed-step tick.`);
    if (!Number.isSafeInteger(raw.frameIndex) || (raw.frameIndex as number) < 0 || (raw.frameIndex as number) >= frames.length) throw new Error(`Simulation event ${index} references a missing frame.`);
    if (!Number.isFinite(raw.modelTimeSeconds) || frames[raw.frameIndex as number]!.t !== raw.modelTimeSeconds) throw new Error(`Simulation event ${index} does not reference its exact model-time frame.`);
    member(raw.phase, PHASES, `Simulation event ${index} phase`);
    if (!isRecord(raw.producer)) throw new Error(`Simulation event ${index} producer must be an object.`);
    exactKeys(raw.producer, ["subsystem"], ["entityId"], `Simulation event ${index} producer`);
    member(raw.producer.subsystem, ["RUN_COORDINATOR", "ENTITY_LIFECYCLE"], `Simulation event ${index} producer subsystem`);
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
    const event = raw as unknown as SimulationEventV2;
    const tickLocalKeys = seenLocalKeysByTick.get(event.tick) ?? new Set<string>();
    if (tickLocalKeys.has(event.localKey)) {
      throw new Error(`Simulation event tick ${event.tick} repeats local key ${event.localKey}.`);
    }
    tickLocalKeys.add(event.localKey);
    seenLocalKeysByTick.set(event.tick, tickLocalKeys);
    if (seenIds.has(event.id)) throw new Error(`Duplicate simulation event ID ${event.id}.`);
    seenIds.add(event.id);
    if (event.knowledgeScope !== "WORLD" || event.ownerAffiliation !== undefined) throw new Error(`Simulation event ${event.id} violates the delivered world-event boundary.`);
    const transitionKey = canonicalJson({ tick: event.tick, producer: event.producer, participants: event.participants, payload: event.payload });
    if (seenTransitions.has(transitionKey)) throw new Error("Simulation event stream contains a duplicate transition.");
    seenTransitions.add(transitionKey);
    if (prior && (event.tick < prior.tick || event.frameIndex < prior.frameIndex || (event.tick === prior.tick && compareText(canonicalCommittedSortKey(event), canonicalCommittedSortKey(prior)) < 0))) throw new Error(`Simulation event ${event.id} violates canonical order.`);

    const frame = frames[event.frameIndex]!;
    if (event.payload.kind === "RUN_STARTED") {
      if (index !== 0 || event.tick !== 0 || event.phase !== "LIFECYCLE" || event.producer.subsystem !== "RUN_COORDINATOR" || event.producer.entityId !== undefined || event.participants.length !== 0 || event.payload.scenarioId !== scenario.id || event.payload.scenarioVersion !== scenario.version) throw new Error("RUN_STARTED event is inconsistent with its scenario.");
    } else if (event.payload.kind === "RUN_COMPLETED") {
      if (index !== values.length - 1 || event.phase !== "TERMINATION" || event.producer.subsystem !== "RUN_COORDINATOR" || event.producer.entityId !== undefined || event.participants.length !== 0 || event.payload.termination !== termination) throw new Error("RUN_COMPLETED event is inconsistent with the run termination.");
    } else {
      const entityId = event.producer.entityId;
      const entity = entityId ? entityById.get(entityId) : undefined;
      const frameEntity = entityId ? frame.entities.find((candidate) => candidate.id === entityId) : undefined;
      if (event.producer.subsystem !== "ENTITY_LIFECYCLE" || !entity || event.participants.length !== 1 || event.participants[0]?.entityId !== entityId || event.participants[0]?.role !== "SUBJECT" || event.payload.entityKind !== entity.kind || !frameEntity) throw new Error(`Simulation entity event ${event.id} has invalid ownership or frame state.`);
      if (event.payload.kind === "ENTITY_ENTERED_WORLD") {
        if (event.phase !== "LIFECYCLE" || frameEntity.lifecycle !== event.payload.lifecycle) throw new Error(`Simulation event ${event.id} has an invalid world-entry state.`);
      } else {
        const expectedPhase = event.payload.to === "TERMINATED" ? "TERMINATION" : "LIFECYCLE";
        if (event.phase !== expectedPhase || frameEntity.lifecycle !== event.payload.to) throw new Error(`Simulation event ${event.id} has an invalid lifecycle phase or frame state.`);
      }
    }
    prior = event;
  }
  if (frames.length > 0) {
    const typed = values as readonly SimulationEventV2[];
    if (typed[0]?.payload.kind !== "RUN_STARTED") throw new Error("Simulation event stream is missing RUN_STARTED.");
    if (typed.at(-1)?.payload.kind !== "RUN_COMPLETED") throw new Error("Simulation event stream is missing RUN_COMPLETED.");
  }
}
