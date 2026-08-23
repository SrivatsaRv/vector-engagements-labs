import { canonicalJson } from "../canonical-json.ts";
import type {
  EngineFrame,
  EngineScenario,
  EngineTermination,
  SimulationEventPayload,
  SimulationEventV2,
} from "./contracts.ts";
import { SIMULATION_EVENT_SCHEMA } from "./contracts.ts";

export const MAX_SIMULATION_EVENTS = 100_000;

export type SimulationEventDraft = Omit<
  SimulationEventV2,
  "schemaVersion" | "id" | "sequence" | "frameIndex"
> & {
  localOrdinal?: number;
};

const phaseRank = { LIFECYCLE: 0, TERMINATION: 1 } as const;
const payloadRank: Record<SimulationEventPayload["kind"], number> = {
  RUN_STARTED: 0,
  ENTITY_ENTERED_WORLD: 1,
  ENTITY_LIFECYCLE_CHANGED: 2,
  RUN_COMPLETED: 3,
};

function participantKey(event: Pick<SimulationEventDraft, "participants">) {
  return event.participants
    .map(({ entityId, role }) => `${entityId}:${role}`)
    .sort()
    .join("|");
}

function draftKey(event: SimulationEventDraft) {
  return canonicalJson({
    tick: event.tick,
    producer: event.producer,
    participants: [...event.participants].sort((left, right) =>
      left.entityId.localeCompare(right.entityId) || left.role.localeCompare(right.role)
    ),
    payload: event.payload,
  });
}

function compareDrafts(left: SimulationEventDraft, right: SimulationEventDraft) {
  return phaseRank[left.phase] - phaseRank[right.phase] ||
    payloadRank[left.payload.kind] - payloadRank[right.payload.kind] ||
    (left.producer.entityId ?? "").localeCompare(right.producer.entityId ?? "") ||
    participantKey(left).localeCompare(participantKey(right)) ||
    (left.localOrdinal ?? 0) - (right.localOrdinal ?? 0);
}

function assertDraftShape(event: SimulationEventDraft) {
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
    throw new Error("Simulation event tick must be a non-negative safe integer.");
  }
  if (!Number.isFinite(event.modelTimeSeconds) || event.modelTimeSeconds < 0) {
    throw new Error("Simulation event model time must be finite and non-negative.");
  }
  if (!Number.isSafeInteger(event.localOrdinal ?? 0) || (event.localOrdinal ?? 0) < 0) {
    throw new Error("Simulation event local ordinal must be a non-negative safe integer.");
  }
  if (new Set(event.causeEventIds).size !== event.causeEventIds.length) {
    throw new Error("Simulation event causal references must be unique.");
  }
}

/** Deterministic per-tick journal. It records committed transitions; it never drives them. */
export class SimulationEventJournal {
  private readonly committed: SimulationEventV2[] = [];
  private readonly committedIds = new Set<string>();
  private pending: SimulationEventDraft[] = [];

  emit(event: SimulationEventDraft) {
    assertDraftShape(event);
    this.pending.push(structuredClone(event));
  }

  hasPending() {
    return this.pending.length > 0;
  }

  commitTick(tick: number, modelTimeSeconds: number, frameIndex: number) {
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
      throw new Error("Simulation event frame index must be a non-negative safe integer.");
    }
    if (this.committed.length + this.pending.length > MAX_SIMULATION_EVENTS) {
      throw new Error(`Simulation event stream exceeds ${MAX_SIMULATION_EVENTS} events.`);
    }
    for (const event of this.pending) {
      if (event.tick !== tick || event.modelTimeSeconds !== modelTimeSeconds) {
        throw new Error("Simulation event tick commit does not match its pending event time.");
      }
    }
    const duplicateKeys = new Set<string>();
    const ordered = [...this.pending].sort(compareDrafts);
    for (const event of ordered) {
      const key = draftKey(event);
      if (duplicateKeys.has(key)) {
        throw new Error("Simulation event stream contains a duplicate transition.");
      }
      duplicateKeys.add(key);
      for (const causeId of event.causeEventIds) {
        if (!this.committedIds.has(causeId)) {
          throw new Error(`Simulation event causal reference ${causeId} does not precede its response.`);
        }
      }
      const sequence = this.committed.length;
      const committed: SimulationEventV2 = {
        schemaVersion: SIMULATION_EVENT_SCHEMA,
        id: `event-${sequence.toString().padStart(6, "0")}`,
        sequence,
        tick,
        modelTimeSeconds,
        frameIndex,
        phase: event.phase,
        producer: structuredClone(event.producer),
        ...(event.ownerAffiliation ? { ownerAffiliation: event.ownerAffiliation } : {}),
        knowledgeScope: event.knowledgeScope,
        participants: structuredClone(event.participants),
        causeEventIds: [...event.causeEventIds],
        ...(event.correlationId ? { correlationId: event.correlationId } : {}),
        payload: structuredClone(event.payload),
      };
      this.committed.push(committed);
      this.committedIds.add(committed.id);
    }
    this.pending = [];
  }

  items() {
    if (this.pending.length > 0) {
      throw new Error("Simulation event journal has uncommitted tick events.");
    }
    return structuredClone(this.committed);
  }
}

export function assertSimulationEventStream(
  events: readonly SimulationEventV2[],
  frames: readonly EngineFrame[],
  scenario: EngineScenario,
  termination: EngineTermination,
) {
  if (events.length > MAX_SIMULATION_EVENTS) {
    throw new Error(`Simulation event stream exceeds ${MAX_SIMULATION_EVENTS} events.`);
  }
  const entityById = new Map(scenario.entities.map((entity) => [entity.id, entity]));
  const seenIds = new Set<string>();
  const seenTransitions = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (event.schemaVersion !== SIMULATION_EVENT_SCHEMA) {
      throw new Error(`Simulation event ${index} has an unsupported schema.`);
    }
    if (event.sequence !== index || event.id !== `event-${index.toString().padStart(6, "0")}`) {
      throw new Error(`Simulation event ${index} has an invalid sequence or ID.`);
    }
    if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
      throw new Error(`Simulation event ${index} has an invalid tick.`);
    }
    const expectedTime = Number((event.tick * scenario.fixedStepSeconds).toFixed(6));
    if (event.modelTimeSeconds !== expectedTime) {
      throw new Error(`Simulation event ${index} does not match its fixed-step tick.`);
    }
    if (!Number.isSafeInteger(event.frameIndex) || event.frameIndex < 0 || event.frameIndex >= frames.length) {
      throw new Error(`Simulation event ${index} references a missing frame.`);
    }
    if (!Number.isFinite(event.modelTimeSeconds) || frames[event.frameIndex]!.t !== event.modelTimeSeconds) {
      throw new Error(`Simulation event ${index} does not reference its exact model-time frame.`);
    }
    if (seenIds.has(event.id)) throw new Error(`Duplicate simulation event ID ${event.id}.`);
    seenIds.add(event.id);
    if (new Set(event.causeEventIds).size !== event.causeEventIds.length) {
      throw new Error(`Simulation event ${event.id} repeats a causal reference.`);
    }
    for (const causeId of event.causeEventIds) {
      if (!seenIds.has(causeId) || causeId === event.id) {
        throw new Error(`Simulation event ${event.id} has a missing or future causal reference.`);
      }
    }
    if (event.knowledgeScope !== "WORLD" || event.ownerAffiliation !== undefined) {
      throw new Error(`Simulation event ${event.id} violates the delivered world-event boundary.`);
    }
    const transitionKey = canonicalJson({
      tick: event.tick,
      producer: event.producer,
      participants: event.participants,
      payload: event.payload,
    });
    if (seenTransitions.has(transitionKey)) {
      throw new Error("Simulation event stream contains a duplicate transition.");
    }
    seenTransitions.add(transitionKey);
    const prior = events[index - 1];
    if (
      prior &&
      (event.tick < prior.tick ||
        event.frameIndex < prior.frameIndex ||
        (event.tick === prior.tick && compareDrafts(
          { ...event, localOrdinal: 0 },
          { ...prior, localOrdinal: 0 },
        ) < 0))
    ) {
      throw new Error(`Simulation event ${event.id} violates canonical order.`);
    }

    if (event.payload.kind === "RUN_STARTED") {
      if (
        event.phase !== "LIFECYCLE" ||
        event.producer.subsystem !== "RUN_COORDINATOR" ||
        event.producer.entityId !== undefined ||
        event.participants.length !== 0 ||
        event.payload.scenarioId !== scenario.id ||
        event.payload.scenarioVersion !== scenario.version
      ) throw new Error("RUN_STARTED event is inconsistent with its scenario.");
    } else if (event.payload.kind === "RUN_COMPLETED") {
      if (
        event.phase !== "TERMINATION" ||
        event.producer.subsystem !== "RUN_COORDINATOR" ||
        event.producer.entityId !== undefined ||
        event.participants.length !== 0 ||
        event.payload.termination !== termination
      ) throw new Error("RUN_COMPLETED event is inconsistent with the run termination.");
    } else {
      const entityId = event.producer.entityId;
      const entity = entityId ? entityById.get(entityId) : undefined;
      if (
        event.producer.subsystem !== "ENTITY_LIFECYCLE" ||
        !entity ||
        event.participants.length !== 1 ||
        event.participants[0]?.entityId !== entityId ||
        event.participants[0]?.role !== "SUBJECT" ||
        event.payload.entityKind !== entity.kind
      ) throw new Error(`Simulation entity event ${event.id} has invalid ownership.`);
      if (event.payload.kind === "ENTITY_ENTERED_WORLD") {
        if (event.phase !== "LIFECYCLE") {
          throw new Error(`Simulation event ${event.id} has an invalid world-entry state.`);
        }
      } else {
        if (event.payload.from === event.payload.to) {
          throw new Error(`Simulation event ${event.id} records an unchanged lifecycle.`);
        }
        const expectedPhase = event.payload.to === "TERMINATED"
          ? "TERMINATION"
          : "LIFECYCLE";
        if (event.phase !== expectedPhase) {
          throw new Error(`Simulation event ${event.id} has an invalid lifecycle phase.`);
        }
      }
    }
  }
  if (frames.length > 0) {
    if (events[0]?.payload.kind !== "RUN_STARTED") {
      throw new Error("Simulation event stream is missing RUN_STARTED.");
    }
    if (events.at(-1)?.payload.kind !== "RUN_COMPLETED") {
      throw new Error("Simulation event stream is missing RUN_COMPLETED.");
    }
  }
}
