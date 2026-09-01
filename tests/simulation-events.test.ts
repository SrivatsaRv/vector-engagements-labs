import assert from "node:assert/strict";
import test from "node:test";

import { runEngineBackend } from "../lib/engine/backend.ts";
import { EngineSession } from "../lib/engine/core.ts";
import {
  SIMULATION_EVENT_PAYLOAD_SCHEMAS,
  type EngineScenario,
} from "../lib/engine/contracts.ts";
import {
  assertSimulationEventStream,
  firstFixedStepTickAtOrAfter,
  modelTimeAtTick,
  recordedModelTimeAtTick,
  SimulationEventJournal,
  type SimulationEventDraft,
} from "../lib/engine/simulation-events.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulateWithCapabilitiesForVerification } from "../lib/simulation.ts";
import {
  bindRuntimeModelPackDigest,
  runtimeWeaponTerminations,
} from "../lib/engine/runtime-model-pack.ts";
import { resolveRetainedCompiledModelPack } from "../lib/engine/retained-model-packs.ts";

function governWeaponTermination(
  scenario: EngineScenario,
  weapon: EngineScenario["entities"][number],
  maximumFlightTimeSeconds: number,
) {
  assert.ok(weapon.weapon);
  const pack = resolveRetainedCompiledModelPack(scenario.modelPack);
  const compiledWeapon = pack.weapons.find(
    (candidate) => candidate.id === weapon.weapon!.admission.weaponModelId,
  );
  assert.ok(compiledWeapon?.termination);
  const patches = [{
    schemaVersion: "vector.model-patch.v1" as const,
    id: `test-${compiledWeapon.id}-maximum-flight-time-seconds`,
    modelPackDigest: pack.digest,
    modelId: compiledWeapon.id,
    fieldPath: "/termination/maximumFlightTimeS",
    oldValue: compiledWeapon.termination.maximumFlightTimeS,
    newValue: maximumFlightTimeSeconds,
    unit: "s" as const,
    reason: "Deterministic boundary regression fixture",
    provenance: {
      authorId: "vector-test-suite",
      authoredAt: "2026-08-27T00:00:00.000Z",
      evidenceRefIds: [compiledWeapon.evidenceRefIds[0]!],
    },
  }];
  weapon.weapon.termination.maximumFlightTimeSeconds = maximumFlightTimeSeconds;
  const projection = structuredClone(scenario.modelPack);
  delete projection.runtimeDigest;
  scenario.modelPack = bindRuntimeModelPackDigest({
    ...projection,
    weaponTerminations: runtimeWeaponTerminations(pack, patches),
    scenarioPatches: patches,
  });
}

function admittedScenario(): EngineScenario {
  const authored = structuredClone(SCENARIO_LIBRARY[0]!.scenario);
  // Journal and launch-boundary tests rewrite compact schedules directly.
  // Compile them without a current study's independently sealed transfer plan
  // so a launch-clock mutation does not correctly trip transfer authority.
  for (const assignment of authored.airMission?.assignments ?? []) {
    delete assignment.storeTransferPlan;
  }
  return structuredClone(
    simulateWithCapabilitiesForVerification(
      authored,
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
    causes: [{
      kind: "EVENT_RECEIPT",
      receipt: { tick: 0, localKey: "missing" },
    }],
  }));
  assert.throws(
    () => missingCause.commitTick(0, 0, 0),
    /unresolved/,
  );
});

test("same-tick references resolve after deterministic ordering and reject future or cyclic references", () => {
  const journal = new SimulationEventJournal();
  const started = journal.emit(runStartedDraft());
  journal.emit(runStartedDraft({
    localKey: "run-completed",
    phase: "TERMINATION",
    causes: [{ kind: "EVENT_RECEIPT", receipt: started }],
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
      kind: "EVENT_RECEIPT",
      receipt: { tick: 0, localKey: "run-completed" },
    }],
  }));
  cyclic.emit(runStartedDraft({
    localKey: "run-completed",
    phase: "TERMINATION",
    causes: [{
      kind: "EVENT_RECEIPT",
      receipt: { tick: 0, localKey: "run-started" },
    }],
    payload: {
      kind: "RUN_COMPLETED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
      termination: "time_limit",
    },
  }));
  assert.throws(() => cyclic.commitTick(0, 0, 0), /future or cyclic/);
});

test("duplicate causal receipts fail closed before journal admission", () => {
  const journal = new SimulationEventJournal();
  const receipt = { tick: 0, localKey: "run-started" };
  assert.throws(
    () => journal.emit(runStartedDraft({
      localKey: "run-completed",
      causes: [
        { kind: "EVENT_RECEIPT", receipt },
        { kind: "EVENT_RECEIPT", receipt: { ...receipt } },
      ],
      payload: {
        kind: "RUN_COMPLETED",
        schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
        termination: "time_limit",
      },
    })),
    /causal references must be unique/,
  );
});

test("malformed causal receipts fail closed before sorting or resolution", () => {
  const corruptions: unknown[] = [
    { kind: "TYPO", receipt: { tick: Number.NaN, localKey: "event" } },
    { kind: "EVENT_RECEIPT", receipt: { tick: Number.NaN, localKey: "event" } },
    { kind: "EVENT_RECEIPT", receipt: { tick: -1, localKey: "event" } },
    { kind: "EVENT_RECEIPT", receipt: { tick: 0, localKey: " " } },
    { kind: "EVENT_RECEIPT", receipt: { tick: 0, localKey: "event", extra: true } },
    { kind: "EVENT_RECEIPT", receipt: { tick: 0, localKey: "event" }, extra: true },
  ];
  for (const cause of corruptions) {
    const journal = new SimulationEventJournal();
    assert.throws(() => journal.emit(runStartedDraft({
      causes: [cause] as SimulationEventDraft["causes"],
    })));
  }
});

test("causal receipts from a future tick fail closed at commit", () => {
  const journal = new SimulationEventJournal();
  journal.emit(runStartedDraft({
    causes: [{
      kind: "EVENT_RECEIPT",
      receipt: { tick: 1, localKey: "future-event" },
    }],
  }));
  assert.throws(() => journal.commitTick(0, 0, 0), /future or cyclic/);
});

test("a journal receipt carries causality across ticks without an inferred event ID", () => {
  const journal = new SimulationEventJournal();
  const receipt = journal.emit(runStartedDraft());
  assert.throws(() => journal.resolveReceipt(receipt), /unresolved/);
  journal.commitTick(0, 0, 0);
  assert.equal(journal.resolveReceipt(receipt), "event-000000");
  journal.emit(runStartedDraft({
    localKey: "run-completed",
    tick: 1,
    modelTimeSeconds: 0.05,
    phase: "TERMINATION",
    causes: [{ kind: "EVENT_RECEIPT", receipt }],
    payload: {
      kind: "RUN_COMPLETED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
      termination: "time_limit",
    },
  }));
  assert.doesNotThrow(() => journal.commitTick(1, 0.05, 1));
  assert.deepEqual(journal.items()[1]?.causeEventIds, ["event-000000"]);

  const unresolved = new SimulationEventJournal();
  unresolved.emit(runStartedDraft());
  unresolved.commitTick(0, 0, 0);
  unresolved.emit(runStartedDraft({
    localKey: "run-completed",
    tick: 1,
    modelTimeSeconds: 0.05,
    phase: "TERMINATION",
    causes: [{
      kind: "EVENT_RECEIPT",
      receipt: { tick: 0, localKey: "not-emitted" },
    }],
    payload: {
      kind: "RUN_COMPLETED",
      schemaVersion: SIMULATION_EVENT_PAYLOAD_SCHEMAS.RUN_COMPLETED,
      termination: "time_limit",
    },
  }));
  assert.throws(() => unresolved.commitTick(1, 0.05, 1), /unresolved/);
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

test("an off-grid launch activates on its first fixed-step boundary in both engines", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 3;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 2.03;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    assert.equal(run.frames[0]?.t, 0, `${backend} initial event frame time`);
    const initialAircraft = scenario.entities.find((entity) => entity.kind === "AIRCRAFT")!;
    const initialRecordedPosition = run.frames[0]?.entities.find(
      (entity) => entity.id === initialAircraft.id,
    )?.position;
    assert.ok(initialRecordedPosition, `${backend} must record the initial aircraft`);
    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(
        Math.abs(initialRecordedPosition[axis] - initialAircraft.initial.position[axis]) <= 1e-12,
        `${backend} initial ${axis} must precede the first integration step`,
      );
    }
    assert.equal(run.events.state, "AVAILABLE");
    const release = run.events.items.find(
      (event) =>
        event.payload.kind === "ENTITY_ENTERED_WORLD" &&
        event.producer.entityId === weapon.id,
    );
    assert.ok(release, `${backend} must record the store world-entry transition`);
    assert.equal(release.tick, 41);
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
      run.closestApproachM,
    );
  }
});

test("a launch just after a grid boundary is not rounded back to the prior tick", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 3;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 2.050000000001;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    assert.equal(run.events.state, "AVAILABLE");
    const release = run.events.items.find(
      (event) =>
        event.payload.kind === "ENTITY_ENTERED_WORLD" &&
        event.producer.entityId === weapon.id,
    );
    assert.ok(release, `${backend} must record the near-grid store release`);
    assert.equal(release.tick, 42);
    assert.equal(release.modelTimeSeconds, 2.1);
    assert.equal(run.frames[release.frameIndex]?.t, 2.1);
    assertSimulationEventStream(
      run.events.items,
      run.frames,
      run.scenario,
      run.termination,
      run.closestApproachM,
    );
  }
});

test("the tick-owned clock admits the reported millisecond-grid launch in both engines and every batch size", () => {
  const scenario = admittedScenario();
  scenario.fixedStepSeconds = 0.001;
  scenario.durationSeconds = 1.02;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 1.008;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    assert.equal(run.events.state, "AVAILABLE");
    const release = run.events.items.find(
      (event) =>
        event.payload.kind === "ENTITY_ENTERED_WORLD" &&
        event.producer.entityId === weapon.id,
    );
    assert.ok(release, `${backend} must record the millisecond-grid store release`);
    assert.equal(release.tick, 1008);
    assert.equal(release.modelTimeSeconds, 1.008);
    assertSimulationEventStream(run.events.items, run.frames, run.scenario, run.termination, run.closestApproachM);
  }

  const baseline = runEngineBackend(structuredClone(scenario), "typescript");
  for (const batchSize of [1, 7, 128, 2_048]) {
    const session = new EngineSession(structuredClone(scenario));
    while (!session.isCompleted()) session.runTicks(batchSize);
    assert.deepEqual(session.result(), baseline, `batch size ${batchSize}`);
  }
});

test("fixed-step activation boundary correction covers grid and off-grid values across the admitted step range", () => {
  const steps = [0.001, 0.003, 0.01, 0.05, 0.2, 1];
  const gridTicks = [0, 1, 7, 257, 1008];
  for (const step of steps) {
    for (const gridTick of gridTicks) {
      const boundary = modelTimeAtTick(gridTick, step);
      const nearGridDelta = Math.max(
        Number.EPSILON * Math.max(1, Math.abs(boundary)) * 4,
        step * 1e-12,
      );
      const launchTimes = [boundary, boundary + step * 0.37, boundary + nearGridDelta];
      for (const launchTime of launchTimes) {
        let expectedTick = 0;
        while (modelTimeAtTick(expectedTick, step) < launchTime) expectedTick += 1;
        const actualTick = firstFixedStepTickAtOrAfter(launchTime, step);
        assert.equal(actualTick, expectedTick, `step=${step} launch=${launchTime}`);
        assert.ok(modelTimeAtTick(actualTick, step) >= launchTime);
        if (actualTick > 0) {
          assert.ok(modelTimeAtTick(actualTick - 1, step) < launchTime);
        }
      }
    }
  }
});

test("finite schedules outside the executable run window fail admission before quantization", () => {
  for (const launchTimeSeconds of [0.201, Number.MAX_VALUE]) {
    const scenario = admittedScenario();
    scenario.fixedStepSeconds = 0.001;
    scenario.durationSeconds = 0.2;
    const store = scenario.entities.find((entity) =>
      entity.kind === "GUIDED_WEAPON" && entity.weapon?.launchTimeSeconds === null
    )!;
    store.weapon!.launchTimeSeconds = launchTimeSeconds;
    for (const backend of ["typescript", "rust-wasm"] as const) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend),
        /launches after scenario duration/,
        `${backend} must reject the post-duration schedule before execution`,
      );
    }
  }
});

test("terminal fixed-step boundary is a half-open launch window in both engines", () => {
  const rejected = [
    { fixedStepSeconds: 0.05, durationSeconds: 0.2, launchTimeSeconds: 0.2 },
    { fixedStepSeconds: 0.05, durationSeconds: 0.201, launchTimeSeconds: 0.201 },
    { fixedStepSeconds: 0.05, durationSeconds: 0.22, launchTimeSeconds: 0.219 },
    {
      fixedStepSeconds: 0.05,
      durationSeconds: 0.200000000001,
      launchTimeSeconds: 0.200000000001,
    },
  ];
  for (const boundary of rejected) {
    const scenario = admittedScenario();
    scenario.fixedStepSeconds = boundary.fixedStepSeconds;
    scenario.durationSeconds = boundary.durationSeconds;
    const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
    weapon.weapon!.launchTimeSeconds = boundary.launchTimeSeconds;
    for (const backend of ["typescript", "rust-wasm"] as const) {
      assert.throws(
        () => runEngineBackend(structuredClone(scenario), backend),
        /launches outside the executable run window/,
        `${backend} must reject terminal activation ${JSON.stringify(boundary)}`,
      );
    }
  }

  const executable = admittedScenario();
  executable.fixedStepSeconds = 0.05;
  executable.durationSeconds = 0.22;
  const weapon = executable.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 0.2;
  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(executable), backend);
    const canonicalTerminalTime =
      run.diagnostics.integratedSteps * executable.fixedStepSeconds;
    assert.equal(run.termination, "time_limit");
    assert.equal(run.diagnostics.integratedSteps, 5);
    assert.equal(run.frames.at(-1)?.t, canonicalTerminalTime);
    assert.equal(run.events.state, "AVAILABLE");
    const completed = run.events.items.find(
      (event) => event.payload.kind === "RUN_COMPLETED",
    );
    assert.equal(completed?.modelTimeSeconds, canonicalTerminalTime);
    assert.equal(run.frames[completed!.frameIndex]?.t, canonicalTerminalTime);
    const entry = run.events.items.find(
      (event) =>
        event.payload.kind === "ENTITY_ENTERED_WORLD" &&
        event.producer.entityId === weapon.id,
    );
    assert.equal(entry?.tick, 4, `${backend} last executable pre-terminal launch`);
    assert.equal(entry?.modelTimeSeconds, 0.2);
    assertSimulationEventStream(run.events.items, run.frames, run.scenario, run.termination, run.closestApproachM);
  }

  for (const batchSize of [1, 2, 128]) {
    const session = new EngineSession(structuredClone(executable));
    let completedBatch = session.runTicks(batchSize);
    while (!completedBatch.completed) completedBatch = session.runTicks(batchSize);
    const run = session.result();
    if (run.events.state !== "AVAILABLE") throw new Error("event stream unavailable");
    const completed = run.events.items.find(
      (event) => event.payload.kind === "RUN_COMPLETED",
    );
    const canonicalTerminalTime =
      completedBatch.integratedSteps * executable.fixedStepSeconds;
    assert.equal(completedBatch.modelTimeSeconds, canonicalTerminalTime);
    assert.equal(completedBatch.progress, 1);
    assert.equal(run.frames.at(-1)?.t, canonicalTerminalTime);
    assert.equal(completed?.modelTimeSeconds, canonicalTerminalTime);
  }
});

test("recorded terminal time is canonical across batch, frame, event, and engine interfaces", () => {
  const scenario = admittedScenario();
  scenario.fixedStepSeconds = 0.003;
  scenario.durationSeconds = 0.008;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 0.006;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    if (run.events.state !== "AVAILABLE") throw new Error("event stream unavailable");
    const completed = run.events.items.find(
      (event) => event.payload.kind === "RUN_COMPLETED",
    );
    assert.equal(run.diagnostics.integratedSteps, 3);
    assert.equal(run.frames.at(-1)?.t, 0.009);
    assert.equal(completed?.modelTimeSeconds, 0.009);
    assert.equal(run.frames[completed!.frameIndex]?.t, 0.009);
  }

  for (const batchSize of [1, 2, 128]) {
    const session = new EngineSession(structuredClone(scenario));
    let completedBatch = session.runTicks(batchSize);
    while (!completedBatch.completed) completedBatch = session.runTicks(batchSize);
    const run = session.result();
    if (run.events.state !== "AVAILABLE") throw new Error("event stream unavailable");
    const completed = run.events.items.find(
      (event) => event.payload.kind === "RUN_COMPLETED",
    );
    assert.equal(completedBatch.integratedSteps, 3);
    assert.equal(completedBatch.modelTimeSeconds, 0.009);
    assert.equal(completedBatch.progress, 1);
    assert.equal(run.frames.at(-1)?.t, completedBatch.modelTimeSeconds);
    assert.equal(completed?.modelTimeSeconds, completedBatch.modelTimeSeconds);
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
      run.closestApproachM,
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
    () => assertSimulationEventStream(events, run.frames, run.scenario, run.termination, run.closestApproachM),
    /repeats local key/,
  );
});

test("delivered cause-free payload families reject invented backward causal edges", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 1;
  const run = runEngineBackend(scenario, "typescript");
  assert.equal(run.events.state, "AVAILABLE");
  const events = structuredClone(run.events.items);
  const completed = events.at(-1)!;
  assert.equal(completed.payload.kind, "RUN_COMPLETED");
  completed.causeEventIds = [events[0]!.id];
  assert.throws(
    () => assertSimulationEventStream(events, run.frames, run.scenario, run.termination, run.closestApproachM),
    /payload family does not admit causal references/,
  );
});

test("runtime decoding rejects a valid enum that falsifies lifecycle history", () => {
  const scenario = admittedScenario();
  const target = scenario.entities.find((entity) => entity.id === "red-object-1")!;
  target.lifecycle = "TERMINATED";

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    assert.equal(run.events.state, "AVAILABLE");
    const events = structuredClone(run.events.items);
    const transition = events.find((event) =>
      event.payload.kind === "ENTITY_LIFECYCLE_CHANGED"
    );
    assert.ok(transition?.payload.kind === "ENTITY_LIFECYCLE_CHANGED");
    assert.equal(transition.payload.from, "ACTIVE");
    assert.equal(transition.payload.to, "TERMINATED");
    transition.payload.from = "TRACKING";
    assert.throws(
      () => assertSimulationEventStream(events, run.frames, run.scenario, run.termination, run.closestApproachM),
      /prior canonical lifecycle/,
      `${backend} history corruption must fail closed`,
    );
  }
});

test("every admitted active-world target lifecycle can produce a terminal weapon event", () => {
  for (const lifecycle of ["ACTIVE", "TRACKING", "ENGAGING"] as const) {
    const scenario = admittedScenario();
    const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
    const target = scenario.entities.find(
      (entity) => entity.id === weapon.weapon?.targetEntityId,
    )!;
    target.lifecycle = lifecycle;
    governWeaponTermination(scenario, weapon, 0.1);

    for (const backend of ["typescript", "rust-wasm"] as const) {
      const run = runEngineBackend(structuredClone(scenario), backend);
      assert.equal(run.termination, "weapon_expired", `${backend} ${lifecycle}`);
      assert.equal(run.events.state, "AVAILABLE");
      const terminal = run.events.items.find(
        (event) => event.payload.kind === "WEAPON_TERMINATED",
      );
      assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
      assert.equal(terminal.payload.cause, "FLIGHT_TIME_EXPIRED");
    }
  }
});

test("runtime decoding binds weapon terminal state, cause, and distance to the run", () => {
  const scenario = admittedScenario();
  delete scenario.targetEffectAuthority;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  governWeaponTermination(scenario, weapon, 0.1);
  const run = runEngineBackend(scenario, "typescript");
  assert.equal(run.termination, "weapon_expired");
  assert.equal(run.events.state, "AVAILABLE");

  const events = structuredClone(run.events.items);
  const frames = structuredClone(run.frames);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED")!;
  assert.equal(terminal.payload.kind, "WEAPON_TERMINATED");
  terminal.payload.to = "MISS";
  terminal.payload.cause = "ENERGY_DEPLETED";
  const terminalWeapon = frames[terminal.frameIndex]!.entities.find(
    (entity) => entity.id === weapon.id,
  )!;
  terminalWeapon.weaponFlightState = "MISS";

  assert.throws(
    () => assertSimulationEventStream(events, frames, run.scenario, run.termination, run.closestApproachM),
    /does not match terminal-frame cause precedence or phase/,
  );

  const priorStateEvents = structuredClone(run.events.items);
  const priorStateTerminal = priorStateEvents.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  )!;
  assert.equal(priorStateTerminal.payload.kind, "WEAPON_TERMINATED");
  priorStateTerminal.payload.from = priorStateTerminal.payload.from === "BOOST"
    ? "COAST"
    : "BOOST";
  assert.throws(
    () => assertSimulationEventStream(
      priorStateEvents,
      run.frames,
      run.scenario,
      run.termination,
      run.closestApproachM,
    ),
    /invalid authority, ownership, or achieved frame state/,
  );

  const distanceEvents = structuredClone(run.events.items);
  const distanceTerminal = distanceEvents.find(
    (event) => event.payload.kind === "WEAPON_TERMINATED",
  )!;
  assert.equal(distanceTerminal.payload.kind, "WEAPON_TERMINATED");
  distanceTerminal.payload.closestApproachM += 1;
  assert.throws(
    () => assertSimulationEventStream(
      distanceEvents,
      run.frames,
      run.scenario,
      run.termination,
      run.closestApproachM,
    ),
    /does not match the recorded run closest approach/,
  );
});

test("runtime decoding rejects a jointly rebound non-geometric cause and terminal frame", () => {
  const scenario = SCENARIO_LIBRARY.find(
    (entry) => entry.id === "a2g-emitter-corridor",
  )!.scenario;
  const run = simulateWithCapabilitiesForVerification(
    scenario,
    createVerificationDeploymentCapabilities("typescript", ["A2G"]),
  ).engineRun;
  assert.equal(run.termination, "weapon_failed");
  assert.equal(run.events.state, "AVAILABLE");

  const events = structuredClone(run.events.items);
  const frames = structuredClone(run.frames);
  const terminal = events.find((event) => event.payload.kind === "WEAPON_TERMINATED");
  assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED");
  assert.equal(terminal.payload.cause, "TERRAIN_IMPACT");
  terminal.payload.to = "MISS";
  terminal.payload.cause = "ENERGY_DEPLETED";
  const terminalWeaponId = terminal.payload.weaponId;
  const terminalWeapon = frames[terminal.frameIndex]!.entities.find(
    (entity) => entity.id === terminalWeaponId,
  );
  assert.ok(terminalWeapon);
  terminalWeapon.weaponFlightState = "MISS";
  terminalWeapon.phase = "Miss";

  assert.throws(
    () => assertSimulationEventStream(
      events,
      frames,
      run.scenario,
      "weapon_miss",
      run.closestApproachM,
    ),
    /does not match terminal-frame cause precedence or phase/,
  );
});

test("termination retains the exact prior tick and binds geometric occurrence in both engines", () => {
  const capabilities = createVerificationDeploymentCapabilities("typescript", ["A2A"]);
  const scenario = structuredClone(
    simulateWithCapabilitiesForVerification(
      SCENARIO_LIBRARY.find((entry) => entry.id === "a2a-defensive-break")!.scenario,
      capabilities,
    ).engineRun.scenario,
  );
  const weapon = scenario.entities.find((entity) => entity.weapon);
  assert.ok(weapon?.weapon);
  weapon.weapon.seekerActivationRangeM = 43;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
    assert.equal(run.events.state, "AVAILABLE", backend);
    const terminal = run.events.items.find(
      (event) => event.payload.kind === "WEAPON_TERMINATED",
    );
    assert.ok(terminal?.payload.kind === "WEAPON_TERMINATED", backend);
    assert.equal(terminal.payload.cause, "GEOMETRIC_INTERCEPT", backend);
    const priorFrame = run.frames[terminal.frameIndex - 1];
    assert.equal(
      priorFrame?.t,
      recordedModelTimeAtTick(terminal.tick - 1, scenario.fixedStepSeconds),
      backend,
    );
    assert.equal(
      priorFrame?.entities.find((entity) => entity.id === weapon.id)?.weaponFlightState,
      terminal.payload.from,
      backend,
    );

    const falsified = structuredClone(run.events.items);
    const falsifiedTerminal = falsified.find(
      (event) => event.payload.kind === "WEAPON_TERMINATED",
    );
    assert.ok(falsifiedTerminal?.payload.kind === "WEAPON_TERMINATED");
    falsifiedTerminal.payload.occurrenceTimeSeconds = Number((
      falsifiedTerminal.payload.occurrenceTimeSeconds - 0.04
    ).toFixed(6));
    assert.throws(
      () => assertSimulationEventStream(
        falsified,
        run.frames,
        run.scenario,
        run.termination,
        run.closestApproachM,
      ),
      /does not match its exact geometric intercept time/,
      backend,
    );
  }
});

test("runtime decoding binds world entry and run completion to their true boundary frames", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 3;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 2.05;
  const run = runEngineBackend(scenario, "typescript");
  assert.equal(run.events.state, "AVAILABLE");

  const delayedEntry = structuredClone(run.events.items);
  const entry = delayedEntry.find((event) =>
    event.payload.kind === "ENTITY_ENTERED_WORLD" && event.producer.entityId === weapon.id
  )!;
  const laterActiveFrame = run.frames.findIndex((frame) =>
    frame.t === 2.25 && frame.entities.some((entity) => entity.id === weapon.id)
  );
  assert.ok(laterActiveFrame >= 0);
  entry.tick = 45;
  entry.modelTimeSeconds = 2.25;
  entry.frameIndex = laterActiveFrame;
  assert.throws(
    () => assertSimulationEventStream(delayedEntry, run.frames, run.scenario, run.termination, run.closestApproachM),
    /declared launch boundary/,
  );

  const earlyCompletion = structuredClone(run.events.items);
  const completed = earlyCompletion.at(-1)!;
  assert.equal(completed.payload.kind, "RUN_COMPLETED");
  const earlierFrame = run.frames.findIndex((frame) => frame.t === 2.75);
  assert.ok(earlierFrame >= 0);
  completed.tick = 55;
  completed.modelTimeSeconds = 2.75;
  completed.frameIndex = earlierFrame;
  assert.throws(
    () => assertSimulationEventStream(earlyCompletion, run.frames, run.scenario, run.termination, run.closestApproachM),
    /final retained frame/,
  );
});

test("Unicode identifiers use one UTF-8 canonical order in TypeScript and Rust", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 1;
  const source = scenario.entities.find((entity) => entity.kind === "AIRCRAFT")!;
  const unicodeIds = ["unicode-𐀀", "unicode-"];
  const additions = unicodeIds.map((id, index) => ({
    ...structuredClone(source),
    id,
    rddfId: id,
    designation: id,
    callsign: id,
    kind: "FIXED_OBJECTIVE" as const,
    symbolRole: "FIXED_OBJECTIVE" as const,
    route: undefined,
    routePlan: undefined,
    aircraft: undefined,
    initial: {
      ...structuredClone(source.initial),
      position: { x: 10_000 + index * 100, y: 0, z: 100 },
      massKg: 1_000,
      fuelKg: 0,
    },
  }));
  scenario.entities.push(...additions);
  const reversed = structuredClone(scenario);
  reversed.entities = [
    ...reversed.entities.filter((entity) => !unicodeIds.includes(entity.id)),
    ...additions.toReversed(),
  ];
  const baseline = runEngineBackend(structuredClone(scenario), "typescript").events;
  assert.deepEqual(runEngineBackend(structuredClone(reversed), "typescript").events, baseline);
  assert.deepEqual(runEngineBackend(structuredClone(scenario), "rust-wasm").events, baseline);
  assert.deepEqual(runEngineBackend(structuredClone(reversed), "rust-wasm").events, baseline);
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
