import assert from "node:assert/strict";
import test from "node:test";
import {
  selectDisplayFrame,
  selectEntityMetricSeries,
  selectRecordedTrackState,
} from "../lib/frontend/selectors.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { simulate } from "../lib/simulation.ts";
import { buildSidePictures } from "../lib/information-state.ts";

const result = simulate(SCENARIO_LIBRARY[0].scenario);

test("display-time selection returns one canonical recorded frame identity", () => {
  const midpoint = (result.frames[4].t + result.frames[5].t) / 2;
  const selected = selectDisplayFrame(result, midpoint);
  assert.equal(selected.frame, result.frames[selected.frameIndex]);
  assert.equal(selected.displayTimeSeconds, selected.frame.t);
  assert.ok(selected.frameIndex === 4 || selected.frameIndex === 5);
  assert.throws(
    () => selectDisplayFrame({ ...result, frames: [] }, 0),
    /empty record/,
  );
});

test("entity metric series use gaps instead of invented zeroes", () => {
  const selected = selectDisplayFrame(result, 0);
  const series = selectEntityMetricSeries(
    result,
    selected,
    (entity) => entity.speedMps,
    (entity) => entity.kind === "GUIDED_WEAPON",
  );
  const redWeapon = series.find((item) => item.id === "red-weapon-1");
  assert.ok(redWeapon);
  assert.equal(redWeapon.current, null);
  assert.ok(redWeapon.values.some((value) => value === null));
  assert.ok(redWeapon.values.every((value) => value === null || Number.isFinite(value)));
});

test("recorded track selection uses the selected frame identity and fails explicit", () => {
  const selected = selectDisplayFrame(result, result.frames[3].t);
  const pictures = buildSidePictures(SCENARIO_LIBRARY[0].scenario, result.frames);
  const track = selectRecordedTrackState(pictures, selected, "IAF");
  assert.equal(track.state, "AVAILABLE");
  assert.equal(track.track.modelTimeSeconds, selected.displayTimeSeconds);
  assert.equal(track.track.perspective, "IAF");

  const missing = selectRecordedTrackState([], selected, "PAF");
  assert.deepEqual(missing, {
    state: "UNAVAILABLE",
    perspective: "PAF",
    displayTimeSeconds: selected.displayTimeSeconds,
    reason: "PICTURE_NOT_RECORDED",
  });
});
