import assert from "node:assert/strict";
import test from "node:test";

import { runEngineBackend } from "../lib/engine/backend.ts";
import {
  SIMULATION_EVENT_PAYLOAD_SCHEMAS,
  type EngineScenario,
} from "../lib/engine/contracts.ts";
import {
  assertSimulationEventStream,
  SimulationEventJournal,
  type SimulationEventDraft,
} from "../lib/engine/simulation-events.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulateWithCapabilitiesForVerification } from "../lib/simulation.ts";

function admittedScenario(): EngineScenario {
  return structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY[0]!.scenario,
      createVerificationDeploymentCapabilities("typescript", ["A2A"]),
    ).engineRun.scenario,
  );
}

function runStartedDraft(overrides: Partial<SimulationEventDraft> = {}): SimulationEventDraft {
  return {
    localKey: "run-started",
    tick: 0,
    modelTimeSeconds: 0,
    phase: "LIFECYCLE",
    producer: { subsystem: "RUN_COORDINATOR" },
    knowledgeScope: "WORLD",
    participants: [],
    causes: [],
    payload: {
      kind: "RUN_STARTED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_STARTED,
      scenarioId: "scenario",
      scenarioVersion: "1",
    },
    ...overrides,
  };
}

test("the per-tick journal rejects duplicate transitions and missing causal references", () => {
  const duplicate = new SimulationEventJournal();
  duplicate.emit(runStartedDraft());
  duplicate.emit(runStartedDraft({ localKey: "duplicate-run-start" }));
  assert.throws(
    () => duplicate.commitTick(0, 0, 0),
    /duplicate transition/,
  );

  const missingCause = new SimulationEventJournal();
  missingCause.emit(runStartedDraft({
    causes: [{ kind: "COMMITTED_EVENT", eventId: "event-999999" }],
  }));
  assert.throws(
    () => missingCause.commitTick(0, 0, 0),
    /does not precede its response/,
  );
});

test("same-tick references resolve after deterministic ordering and reject future or cyclic references", () => {
  const journal = new SimulationEventJournal();
  const started = journal.emit(runStartedDraft());
  journal.emit(runStartedDraft({
    localKey: "run-completed",
    phase: "TERMINATION",
    causes: [{ kind: "SAME_TICK_EVENT", reference: started }],
    payload: {
      kind: "RUN_COMPLETED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
      termination: "time_limit",
    },
  }));
  journal.commitTick(0, 0, 0);
  assert.deepEqual(journal.items()[1]?.causeEventIds, ["event-000000"]);

  const cyclic = new SimulationEventJournal();
  cyclic.emit(runStartedDraft({
    causes: [{
      kind: "SAME_TICK_EVENT",
      reference: { tick: 0, localKey: "run-completed" },
    }],
  }));
  cyclic.emit(runStartedDraft({
    localKey: "run-completed",
    phase: "TERMINATION",
    causes: [{
      kind: "SAME_TICK_EVENT",
      reference: { tick: 0, localKey: "run-started" },
    }],
    payload: {
      kind: "RUN_COMPLETED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
      termination: "time_limit",
    },
  }));
  assert.throws(() => cyclic.commitTick(0, 0, 0), /future or cyclic/);
});

test("participant input order and duplicates cannot alter committed bytes", () => {
  const participants = [
    { entityId: "zulu", role: "SUBJECT" as const },
    { entityId: "alpha", role: "ACTOR" as const },
    { entityId: "zulu", role: "ACTOR" as const },
    { entityId: "zulu", role: "SUBJECT" as const },
  ];
  const commit = (input: typeof participants) => {
    const journal = new SimulationEventJournal();
    journal.emit(runStartedDraft({ participants: input }));
    journal.commitTick(0, 0, 0);
    return journal.items();
  };
  assert.deepEqual(commit(participants), commit([...participants].reverse()));
  assert.deepEqual(commit(participants)[0]?.participants, [
    { entityId: "alpha", role: "ACTOR" },
    { entityId: "zulu", role: "ACTOR" },
    { entityId: "zulu", role: "SUBJECT" },
  ]);
});

test("a lifecycle transition forces an exact event frame outside regular sampling cadence", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 3;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 2.05;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    assert.equal(run.frames[0]?.t, 0, `${backend} initial event frame time`);
    const initialAircraft = scenario.entities.find((entity) => entity.kind === "AIRCRAFT")!;
    assert.deepEqual(
      run.frames[0]?.entities.find((entity) => entity.id === initialAircraft.id)?.position,
      initialAircraft.initial.position,
      `${backend} initial event frame must precede the first integration step`,
    );
    assert.equal(run.events.state, "AVAILABLE");
    const release = run.events.items.find(
      (event) =>
        event.payload.kind === "ENTITY_ENTERED_WORLD" &&
        event.producer.entityId === weapon.id,
    );
    assert.ok(release, `${backend} must record the store world-entry transition`);
    assert.equal(release.modelTimeSeconds, 2.05);
    assert.equal(run.frames[release.frameIndex]?.t, release.modelTimeSeconds);
    assert.ok(
      run.frames[release.frameIndex]?.entities.some((entity) => entity.id === weapon.id),
      `${backend} event frame must contain the activated entity`,
    );
    const eventFrame = run.frames[release.frameIndex]!;
    const releasedWeapon = eventFrame.entities.find((entity) => entity.id === weapon.id)!;
    const launcher = eventFrame.entities.find(
      (entity) => entity.id === weapon.weapon!.launchPlatformId,
    )!;
    assert.deepEqual(
      releasedWeapon.position,
      launcher.position,
      `${backend} world-entry frame must be the committed launch snapshot before fly-out`,
    );
    assertSimulationEventStream(
      run.events.items,
      run.frames,
      run.scenario,
      run.termination,
    );
  }
});

test("runtime decoding fails closed for unknown variants, payload versions, fields, and lifecycle states", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 1;
  const run = runEngineBackend(scenario, "typescript");
  assert.equal(run.events.state, "AVAILABLE");
  const corruptions: Array<(events: unknown[]) => void> = [
    (events) => { (events[0] as { payload: { kind: string } }).payload.kind = "TYPO_EVENT"; },
    (events) => { (events[0] as { payload: { schemaVersion: string } }).payload.schemaVersion = "vector.simulation-event-payload.run-started.v2"; },
    (events) => { (events[0] as Record<string, unknown>).unexpected = true; },
    (events) => {
      const entered = events.find((event) =>
        (event as { payload?: { kind?: string } }).payload?.kind === "ENTITY_ENTERED_WORLD"
      ) as { payload: { lifecycle: string } };
      entered.payload.lifecycle = "TERMINATED";
    },
  ];
  for (const corrupt of corruptions) {
    const events = structuredClone(run.events.items) as unknown[];
    corrupt(events);
    assert.throws(() => assertSimulationEventStream(
      events,
      run.frames,
      run.scenario,
      run.termination,
    ));
  }
});

test("runtime decoding rejects duplicate producer-local keys within one tick", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 1;
  const run = runEngineBackend(scenario, "typescript");
  assert.equal(run.events.state, "AVAILABLE");
  const events = structuredClone(run.events.items);
  const sameTick = events.filter((event) => event.tick === 0);
  assert.ok(sameTick.length > 1);
  sameTick[1]!.localKey = sameTick[0]!.localKey;
  assert.throws(
    () => assertSimulationEventStream(events, run.frames, run.scenario, run.termination),
    /repeats local key/,
  );
});

test("event ordering is independent of arbitrary scenario entity insertion order", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 1;
  const source = scenario.entities.find((entity) => entity.kind === "AIRCRAFT")!;
  for (let index = 0; index < 7; index += 1) {
    scenario.entities.push({
      ...structuredClone(source),
      id: `arbitrary-${index.toString().padStart(2, "0")}`,
      rddfId: `arbitrary-${index.toString().padStart(2, "0")}`,
      designation: `Arbitrary ${index}`,
      callsign: `ARB-${index}`,
      kind: "FIXED_OBJECTIVE",
      symbolRole: "FIXED_OBJECTIVE",
      route: undefined,
      routePlan: undefined,
      aircraft: undefined,
      initial: {
        ...structuredClone(source.initial),
        position: { x: index * 100, y: index * 50, z: 100 },
        massKg: 1_000,
        fuelKg: 0,
      },
    });
  }
  const reversed = structuredClone(scenario);
  reversed.entities.reverse();

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const baseline = runEngineBackend(structuredClone(scenario), backend);
    const reordered = runEngineBackend(structuredClone(reversed), backend);
    assert.deepEqual(
      reordered.events,
      baseline.events,
      `${backend} event identity and order must not depend on scenario insertion order`,
    );
    assert.equal(baseline.events.state, "AVAILABLE");
    assert.equal(
      baseline.events.items.filter((event) => event.payload.kind === "ENTITY_ENTERED_WORLD").length,
      baseline.frames[0]!.entities.filter((entity) => entity.lifecycle !== "TERMINATED").length,
      "every admitted initial world entity must use the same producer path",
    );
    for (let index = 0; index < 7; index += 1) {
      const entityId = `arbitrary-${index.toString().padStart(2, "0")}`;
      assert.ok(
        baseline.events.items.some((event) =>
          event.payload.kind === "ENTITY_ENTERED_WORLD" &&
          event.producer.entityId === entityId,
        ),
        `${backend} must retain the lifecycle event for ${entityId}`,
      );
    }
    assert.ok(
      !JSON.stringify(baseline.events).includes('"detail"'),
      "the authoritative stream must not contain free-text detail",
    );
  }
});

test("resource admission includes event-forced frames instead of only regular samples", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 3_600;
  const source = scenario.entities.find((entity) => entity.kind === "AIRCRAFT")!;
  for (let index = 0; index < 20; index += 1) {
    scenario.entities.push({
      ...structuredClone(source),
      id: `capacity-${index}`,
      rddfId: `capacity-${index}`,
      designation: `Capacity ${index}`,
      callsign: `CAP-${index}`,
      kind: "FIXED_OBJECTIVE",
      symbolRole: "FIXED_OBJECTIVE",
      route: undefined,
      routePlan: undefined,
      aircraft: undefined,
      initial: {
        ...structuredClone(source.initial),
        position: { x: index * 10, y: 0, z: 100 },
        massKg: 1_000,
        fuelKg: 0,
      },
    });
  }
  assert.throws(
    () => runEngineBackend(structuredClone(scenario), "typescript"),
    /event-preserving entity states/,
  );
  assert.throws(
    () => runEngineBackend(structuredClone(scenario), "rust-wasm"),
    /retain .* entity states/,
  );
});
