import assert from "node:assert/strict";
import test from "node:test";
import {
  RUST_WASM_ENGINE_ARTIFACT,
  runEngineBackend,
} from "../lib/engine/backend.ts";
import { compileScenario } from "../lib/engine/compiler.ts";
import { getProfile, simulate } from "../lib/simulation.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";

const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differed from ${expected} by more than ${tolerance}`,
  );
};

test("committed Rust/WASM artifact has a stable integrity identity", () => {
  assert.match(RUST_WASM_ENGINE_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes > 100_000);
  assert.ok(RUST_WASM_ENGINE_ARTIFACT.bytes < 500_000);
});

for (const definition of SCENARIO_LIBRARY) {
  test(`Rust/WASM matches TypeScript for ${definition.id}`, () => {
    const typescript = simulate({
      ...definition.scenario,
      engineBackend: "typescript",
    });
    const rust = simulate({
      ...definition.scenario,
      engineBackend: "rust-wasm",
    });

    assert.equal(typescript.engineRun.diagnostics.backend, "typescript");
    assert.equal(rust.engineRun.diagnostics.backend, "rust-wasm");
    assert.equal(rust.termination, typescript.termination);
    assert.equal(rust.outcome, typescript.outcome);
    assert.equal(rust.frames.length, typescript.frames.length);
    assert.equal(rust.entityManifest.length, typescript.entityManifest.length);
    assert.deepEqual(
      rust.entityManifest.map((entity) => [entity.id, entity.kind, entity.lifecycle]),
      typescript.entityManifest.map((entity) => [entity.id, entity.kind, entity.lifecycle]),
    );
    close(rust.closestApproach, typescript.closestApproach, 1e-6, "closest approach");
    close(rust.timeOfFlight, typescript.timeOfFlight, 1e-9, "time of flight");
    close(rust.endSpeed, typescript.endSpeed, 1e-6, "end speed");
    close(rust.peakDemand, typescript.peakDemand, 1e-8, "peak demand");
    assert.equal(
      rust.engineRun.diagnostics.integratedSteps,
      typescript.engineRun.diagnostics.integratedSteps,
    );
    assert.equal(rust.engineRun.diagnostics.nonFiniteStateCount, 0);

    const checkpoints = [0, Math.floor(rust.frames.length / 2), rust.frames.length - 1];
    for (const frameIndex of checkpoints) {
      const rustFrame = rust.frames[frameIndex];
      const typescriptFrame = typescript.frames[frameIndex];
      close(rustFrame.t, typescriptFrame.t, 1e-9, `frame ${frameIndex} time`);
      close(rustFrame.range, typescriptFrame.range, 1e-6, `frame ${frameIndex} range`);
      close(rustFrame.speed, typescriptFrame.speed, 1e-6, `frame ${frameIndex} speed`);
      assert.deepEqual(
        rustFrame.entities.map((entity) => [entity.id, entity.lifecycle, entity.phase]),
        typescriptFrame.entities.map((entity) => [entity.id, entity.lifecycle, entity.phase]),
      );
    }
  });
}

test("explicit backend selection never silently falls through", () => {
  const definition = SCENARIO_LIBRARY[0];
  const profile = getProfile(definition.scenario);
  const compiled = compileScenario(
    {
      id: definition.id,
      version: definition.version,
      domain: definition.scenario.domain,
      name: definition.scenario.name,
      bluePlatformId: definition.scenario.bluePlatformId,
      blueSystemId: definition.scenario.blueSystemId,
      redObjectId: definition.scenario.redObjectId,
      redSystemId: definition.scenario.redSystemId,
      studyAreaId: definition.scenario.studyAreaId,
      weatherPresetId: definition.scenario.weatherPresetId,
      profile: definition.scenario.profile,
      guidance: definition.scenario.guidance,
      altitude: definition.scenario.altitude,
      cruiseAltitude: definition.scenario.cruiseAltitude,
      targetDelta: definition.scenario.targetDelta,
      range: definition.scenario.range,
      aspect: definition.scenario.aspect,
      launcherSpeed: definition.scenario.launcherSpeed,
      targetSpeed: definition.scenario.targetSpeed,
      maneuver: definition.scenario.maneuver,
      targetG: definition.scenario.targetG,
      blueFuelPercent: definition.scenario.blueFuelPercent,
      redFuelPercent: definition.scenario.redFuelPercent,
      blueDecision: definition.scenario.blueDecision,
      redDecision: definition.scenario.redDecision,
      windEastMps: definition.scenario.wind,
      windNorthMps: definition.scenario.windNorth,
      temperatureOffset: definition.scenario.temperatureOffset,
      guidanceInterruptionAt: null,
      guidanceInterruptionDuration: 8,
      windShiftAt: null,
      windShiftEastMps: 0,
      windShiftNorthMps: 0,
      seed: definition.scenario.seed,
    },
    profile,
  );
  assert.throws(
    () => runEngineBackend(compiled, "other"),
    /Unknown VECTOR engine backend/,
  );
});
