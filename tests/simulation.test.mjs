import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCENARIO,
  buildRaspTrack,
  explainResult,
  getFrameAt,
  simulate,
  standardAtmosphere,
} from "../lib/simulation.ts";

test("standard atmosphere produces credible sea-level reference values", () => {
  const atmosphere = standardAtmosphere(0, 0);
  assert.ok(Math.abs(atmosphere.temperatureK - 288.15) < 0.1);
  assert.ok(Math.abs(atmosphere.pressureKpa - 101.325) < 0.2);
  assert.ok(Math.abs(atmosphere.densityKgM3 - 1.225) < 0.01);
  assert.ok(Math.abs(atmosphere.speedOfSoundMps - 340.3) < 0.5);
});

test("simulation is deterministic and tactical decisions have declared effects", () => {
  const first = simulate(DEFAULT_SCENARIO);
  const second = simulate(DEFAULT_SCENARIO);
  assert.equal(first.outcome, second.outcome);
  assert.equal(first.closestApproach, second.closestApproach);
  assert.deepEqual(first.frames, second.frames);

  const disengage = simulate({
    ...DEFAULT_SCENARIO,
    blueDecision: "DISENGAGE",
  });
  const press = simulate({ ...DEFAULT_SCENARIO, redDecision: "PRESS" });
  assert.notEqual(disengage.closestApproach, first.closestApproach);
  assert.notEqual(press.closestApproach, first.closestApproach);
});

test("RASP separates model truth from degraded sensor-derived tracks", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const frame = getFrameAt(result, 30);
  const nominal = buildRaspTrack(DEFAULT_SCENARIO, frame, "IAF");
  const degraded = buildRaspTrack(
    {
      ...DEFAULT_SCENARIO,
      blueRadarMode: "SILENT",
      blueDatalink: false,
      redJammer: true,
    },
    frame,
    "IAF",
  );
  assert.equal(nominal.status, "TRACKING");
  assert.equal(degraded.status, "COASTING");
  assert.ok(degraded.confidence < nominal.confidence);
  assert.ok(degraded.uncertaintyMeters > nominal.uncertaintyMeters);
  assert.notDeepEqual(degraded.position, degraded.truthPosition);
});

test("distance-exhausted explanation distinguishes start boundary from flown path", () => {
  const result = simulate(DEFAULT_SCENARIO);
  assert.equal(result.outcome, "Modeled distance exhausted");
  assert.match(explainResult(DEFAULT_SCENARIO, result), /start was inside/i);
  assert.doesNotMatch(
    explainResult(DEFAULT_SCENARIO, result),
    /starting distance is beyond/i,
  );
  assert.ok(result.timeOfFlight > 0);
  assert.ok(result.closestApproach < DEFAULT_SCENARIO.range);
});
