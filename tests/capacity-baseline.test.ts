import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPACITY_BASELINE_ENTITY_COUNT,
  CAPACITY_BASELINE_MANIFEST,
  createCapacityBaselineScenario,
  measureCapacityBaseline,
} from "../lib/validation/capacity-baseline.ts";
import { runEngineBackend } from "../lib/engine/backend.ts";

test("the capacity baseline uses 100 admitted moving entities without fabricated combat capability", () => {
  const scenario = createCapacityBaselineScenario();
  assert.equal(scenario.entities.length, CAPACITY_BASELINE_ENTITY_COUNT);
  assert.deepEqual(
    scenario.entities.reduce<Record<string, number>>((counts, entity) => {
      counts[entity.lifecycle] = (counts[entity.lifecycle] ?? 0) + 1;
      return counts;
    }, {}),
    { ACTIVE: 98, STOWED: 2 },
  );
  assert.equal(CAPACITY_BASELINE_MANIFEST.unavailableCapabilities.sensorTrack.state, "UNAVAILABLE");
  assert.equal(CAPACITY_BASELINE_MANIFEST.unavailableCapabilities.weaponSupport.state, "UNAVAILABLE");
  assert.equal(CAPACITY_BASELINE_MANIFEST.unavailableCapabilities.virtualPilot.state, "UNAVAILABLE");
  assert.ok(scenario.entities.filter((entity) => entity.kind === "AIRCRAFT").every((entity) => entity.routePlan?.schemaVersion === "vector.route-plan.v2"));
  assert.equal(scenario.geospatial.initialPositions.length, CAPACITY_BASELINE_ENTITY_COUNT);
  assert.ok(new Set(scenario.geospatial.initialPositions.map((item) => item.entityId)).size === CAPACITY_BASELINE_ENTITY_COUNT);
});

test("the baseline preserves TypeScript/Rust route state within the declared engine tolerance", () => {
  const scenario = createCapacityBaselineScenario();
  const typescript = runEngineBackend(structuredClone(scenario), "typescript");
  const rust = runEngineBackend(structuredClone(scenario), "rust-wasm");
  assert.equal(typescript.frames.length, rust.frames.length);
  for (const frameIndex of [0, 10, typescript.frames.length - 1]) {
    const left = typescript.frames[frameIndex]!;
    const right = rust.frames[frameIndex]!;
    // The declared 100 includes one stowed store. Frames contain the 98 active
    // aircraft plus the launched guided vehicle; inventory remains in scenario.
    assert.equal(left.entities.length, CAPACITY_BASELINE_ENTITY_COUNT - 1);
    assert.equal(right.entities.length, CAPACITY_BASELINE_ENTITY_COUNT - 1);
    for (let index = 0; index < left.entities.length; index += 1) {
      const actual = left.entities[index]!;
      const expected = right.entities[index]!;
      assert.equal(actual.id, expected.id);
      for (const axis of ["x", "y", "z"] as const) {
        assert.ok(Math.abs(actual.position[axis] - expected.position[axis]) <= 1e-6, `${actual.id} ${axis} frame ${frameIndex}`);
        assert.ok(Math.abs(actual.velocity[axis] - expected.velocity[axis]) <= 1e-6, `${actual.id} velocity ${axis} frame ${frameIndex}`);
      }
    }
    assert.deepEqual(left.observerStates, right.observerStates);
  }
});

for (const backend of ["typescript", "rust-wasm"] as const) {
  test(`${backend} executes the 100-entity baseline deterministically with all aircraft moving`, () => {
    const measurement = measureCapacityBaseline(backend, 2);
    assert.equal(measurement.movedAircraft, 98);
    assert.equal(measurement.observerState, "UNSUPPORTED");
    // The fixed-step session samples the inclusive 0 s and 5 s boundaries.
    assert.equal(measurement.integratedSteps, 101);
    assert.ok(measurement.sampledFrames > 1);
    assert.match(measurement.deterministicDigest, /^[a-f0-9]{64}$/);
  });
}
