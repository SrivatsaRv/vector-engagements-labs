import assert from "node:assert/strict";
import test from "node:test";

import { runEngineBackend } from "../lib/engine/backend.ts";
import { VECTOR_ENGINE_WASM_BASE64 } from "../lib/engine/generated/vector-engine-wasm.ts";
import { createVerificationDeploymentCapabilities } from "../lib/runtime/deployment-capabilities.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulateWithCapabilitiesForVerification } from "../lib/simulation.ts";

function admittedA2aScenario() {
  const definition = SCENARIO_LIBRARY.find(({ scenario }) => scenario.domain === "A2A");
  assert.ok(definition);
  const authored = structuredClone(definition.scenario);
  // Target-effect tests mutate the compiled launch boundary directly. Keep
  // this generic fixture on the legacy scheduled-release path instead of
  // inheriting a current study's separately sealed store-transfer plan.
  for (const assignment of authored.airMission?.assignments ?? []) {
    delete assignment.storeTransferPlan;
  }
  return structuredClone(simulateWithCapabilitiesForVerification(
    authored,
    createVerificationDeploymentCapabilities("typescript", ["A2A"]),
  ).engineRun.scenario);
}

function closeInterceptScenario() {
  const scenario = admittedA2aScenario();
  const launcher = scenario.entities.find(({ id }) => id === "blue-platform-1");
  const weapon = scenario.entities.find(({ id }) => id === "blue-weapon-1");
  const target = scenario.entities.find(({ id }) => id === "red-object-1");
  assert.ok(launcher && weapon?.weapon && target);

  target.initial.position = {
    x: launcher.initial.position.x + 2,
    y: launcher.initial.position.y,
    z: launcher.initial.position.z,
  };
  target.initial.velocity = { ...launcher.initial.velocity };
  target.route = [];
  delete target.routePlan;
  weapon.initial.position = { ...launcher.initial.position };
  weapon.initial.velocity = { ...launcher.initial.velocity };
  weapon.route = [];
  delete weapon.routePlan;
  weapon.weapon.launchTimeSeconds = 0;
  scenario.durationSeconds = 1;
  return scenario;
}

function runRawRustWasm(scenario) {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(
    Buffer.from(VECTOR_ENGINE_WASM_BASE64, "base64"),
  ));
  const engine = instance.exports;
  const input = new TextEncoder().encode(JSON.stringify(scenario));
  const pointer = engine.vector_input_reserve(input.byteLength);
  new Uint8Array(engine.memory.buffer, pointer, input.byteLength).set(input);
  const accepted = engine.vector_run_json() === 1;
  const output = new TextDecoder().decode(new Uint8Array(
    engine.memory.buffer,
    engine.vector_output_ptr(),
    engine.vector_output_len(),
  ));
  return { accepted, output };
}

test("Rust/WASM target effects preserve TypeScript commit, causality, frame, and lifecycle parity", () => {
  const scenario = closeInterceptScenario();
  const typescript = runEngineBackend(structuredClone(scenario), "typescript");
  const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");
  const significant = (run) => run.events.items.filter(({ payload }) =>
    payload.kind === "WEAPON_TERMINATED" || payload.kind === "TARGET_EFFECT_COMMITTED"
  );

  assert.deepEqual(significant(rust), significant(typescript));
  const [termination, effect] = significant(rust);
  assert.equal(termination.payload.kind, "WEAPON_TERMINATED");
  assert.equal(effect.payload.kind, "TARGET_EFFECT_COMMITTED");
  assert.deepEqual(effect.causeEventIds, [termination.id]);
  assert.deepEqual(effect.payload.commit.terminationReceipt, {
    tick: termination.tick,
    localKey: termination.localKey,
    cause: termination.payload.cause,
    modelTimeSeconds: termination.payload.occurrenceTimeSeconds,
  });
  assert.equal(effect.payload.commit.result, "KILL");
  assert.equal(effect.payload.commit.targetLifecycleBefore, "ACTIVE");
  assert.equal(effect.payload.commit.targetLifecycleAfter, "TERMINATED");

  const finalTarget = rust.frames.at(-1).entities.find(({ id }) => id === "red-object-1");
  assert.equal(finalTarget.lifecycle, "TERMINATED");
  assert.deepEqual(finalTarget.targetEffect, {
    commitId: effect.payload.commit.commitId,
    state: "KILL",
  });
  assert.equal(rust.events.items.filter(({ payload, producer }) =>
    payload.kind === "ENTITY_LIFECYCLE_CHANGED" && producer.entityId === finalTarget.id
  ).length, 0, "the effect commit owns the target lifecycle transition exactly once");
});

test("Rust/WASM preserves legacy no-authority target-effect output", () => {
  const scenario = closeInterceptScenario();
  delete scenario.targetEffectAuthority;
  const typescript = runEngineBackend(structuredClone(scenario), "typescript");
  const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");

  for (const run of [typescript, rust]) {
    assert.equal(run.events.items.some(({ payload }) =>
      payload.kind === "TARGET_EFFECT_COMMITTED"
    ), false);
    const termination = run.events.items.find(({ payload }) =>
      payload.kind === "WEAPON_TERMINATED"
    );
    assert.equal(termination.payload.targetEffect, "NOT_MODELLED");
    const target = run.frames.at(-1).entities.find(({ id }) => id === "red-object-1");
    assert.equal(target.lifecycle, "ACTIVE");
    assert.equal("targetEffect" in target, false);
  }
});

test("Rust/WASM rejects malformed target-effect authority before execution", () => {
  const cases = [
    ["missing model field", (value) => { delete value.models[0].fuze; }],
    ["unsupported nested field", (value) => { value.models[0].thresholds.probabilityOfKill = 0.9; }],
    ["unsupported evaluator", (value) => { value.models[0].evaluator = "RANDOM"; }],
    ["unordered thresholds", (value) => { value.models[0].thresholds.killMaximumDistanceM = 11; }],
    ["model digest mutation", (value) => { value.models[0].thresholds.killMaximumDistanceM = 3.5; }],
    ["authority digest mutation", (value) => { value.version = "1.0.1"; }],
  ];
  for (const [name, mutate] of cases) {
    const scenario = admittedA2aScenario();
    mutate(scenario.targetEffectAuthority);
    const result = runRawRustWasm(scenario);
    assert.equal(result.accepted, false, name);
    assert.match(result.output, /target.effect|unknown field|missing field/i, name);
  }
});
