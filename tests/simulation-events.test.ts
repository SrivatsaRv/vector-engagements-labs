import assert from "node:assert/strict";
import test from "node:test";

import { runEngineBackend } from "../lib/engine/backend.ts";
import type { EngineScenario } from "../lib/engine/contracts.ts";
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
    tick: 0,
    modelTimeSeconds: 0,
    phase: "LIFECYCLE",
    producer: { subsystem: "RUN_COORDINATOR" },
    knowledgeScope: "WORLD",
    participants: [],
    causeEventIds: [],
    payload: {
      kind: "RUN_STARTED",
      scenarioId: "scenario",
      scenarioVersion: "1",
    },
    ...overrides,
  };
}

test("the per-tick journal rejects duplicate transitions and missing causal references", () => {
  const duplicate = new SimulationEventJournal();
  duplicate.emit(runStartedDraft());
  duplicate.emit(runStartedDraft());
  assert.throws(
    () => duplicate.commitTick(0, 0, 0),
    /duplicate transition/,
  );

  const missingCause = new SimulationEventJournal();
  missingCause.emit(runStartedDraft({ causeEventIds: ["event-999999"] }));
  assert.throws(
    () => missingCause.commitTick(0, 0, 0),
    /does not precede its response/,
  );
});

test("a lifecycle transition forces an exact event frame outside regular sampling cadence", () => {
  const scenario = admittedScenario();
  scenario.durationSeconds = 3;
  const weapon = scenario.entities.find((entity) => entity.kind === "GUIDED_WEAPON")!;
  weapon.weapon!.launchTimeSeconds = 2.05;

  for (const backend of ["typescript", "rust-wasm"] as const) {
    const run = runEngineBackend(structuredClone(scenario), backend);
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
    assertSimulationEventStream(
      run.events.items,
      run.frames,
      run.scenario,
      run.termination,
    );
  }
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
