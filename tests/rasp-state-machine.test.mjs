import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SCENARIO, simulate } from "../lib/simulation.ts";
import { assertRecordedSidePictures, projectObserverStates } from "../lib/information-state.ts";

test("every A2A tick emits an explicit fail-closed observer state", () => {
  const result = simulate(DEFAULT_SCENARIO);
  assert.ok(result.engineRun.frames.length > 0);
  for (const frame of result.engineRun.frames) {
    assert.deepEqual(frame.observerStates.map((state) => state.perspective), ["IAF", "PAF"]);
    for (const state of frame.observerStates) {
      assert.deepEqual(state, {
        schemaVersion: "vector.observer-state.v2",
        perspective: state.perspective,
        sensorState: "UNSUPPORTED",
        observationCount: 0,
        trackState: "UNSUPPORTED",
        visible: false,
        availabilityReason: "SENSOR_MODEL_UNAVAILABLE",
        effectScope: "AIR_PICTURE_ONLY",
        stateExplanation: "No admitted sensor model pack is bound to this run.",
      });
    }
  }
});

test("observer projection is a deterministic tick projection without fabricated sensor values", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const first = projectObserverStates(result.engineRun.frames);
  const second = projectObserverStates(result.engineRun.frames);
  assert.deepEqual(first, second);
  assert.deepEqual(result.pictures, first);
  assert.equal(first.length, result.engineRun.frames.length * 2);
  assert.ok(first.every((picture) =>
    picture.trackId === "UNAVAILABLE" &&
    picture.observationCount === 0 &&
    picture.confidence === null &&
    picture.uncertaintyMeters === null &&
    !("position" in picture) &&
    !("observedEntityId" in picture) &&
    !("truthPosition" in picture),
  ));
  assert.equal(JSON.stringify(first).includes("80000"), false);
  assert.equal(JSON.stringify(first).toLowerCase().includes("jammer"), false);
});

test("saved picture admission rejects fabricated tracks and accepts only the tick state", () => {
  const result = simulate(DEFAULT_SCENARIO);
  assert.doesNotThrow(() => assertRecordedSidePictures(result.engineRun.frames, result.pictures));
  const fabricated = result.pictures.map((picture, index) => index === 0
    ? { ...picture, confidence: 1, position: { x: 0, y: 0, z: 0 } }
    : picture);
  assert.throws(
    () => assertRecordedSidePictures(result.engineRun.frames, fabricated),
    /prohibited track or truth data/,
  );
  const duplicateIdentity = [...result.pictures];
  duplicateIdentity[1] = structuredClone(duplicateIdentity[0]);
  assert.throws(
    () => assertRecordedSidePictures(result.engineRun.frames, duplicateIdentity),
    /duplicate side\/frame identity/,
  );
});
