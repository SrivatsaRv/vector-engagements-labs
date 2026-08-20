import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCENARIO,
  getFrameAt,
  simulate,
} from "../lib/simulation.ts";
import {
  INFORMATION_MODEL,
  buildSidePictures,
  informationAvailability,
} from "../lib/information-state.ts";

const result = simulate(DEFAULT_SCENARIO);
const frame = getFrameAt(result, 5);

test("onboard observation admits only a declared scan and makes a confirmed track", () => {
  const pictures = buildSidePictures(DEFAULT_SCENARIO, result.frames.filter((item) => item.t <= 3));
  const iaf = pictures.filter((item) => item.perspective === "IAF");
  assert.equal(iaf[0].trackState, "PLOT");
  assert.equal(iaf.at(-1).trackState, "CONFIRMED");
  assert.equal(iaf.at(-1).status, "TRACKING");
  assert.equal(iaf.at(-1).identification, "UNKNOWN");
  assert.equal(iaf.at(-1).trackId, "IAF-red-object-1-track-v1");
  assert.ok(iaf.at(-1).uncertaintyMeters >= INFORMATION_MODEL.measurementFloorM);
});

test("radar state and model boundary change canonical track history", () => {
  const baseline = informationAvailability(DEFAULT_SCENARIO, { ...frame, range: 80_000 }, "IAF");
  const beyond = informationAvailability(DEFAULT_SCENARIO, { ...frame, range: 80_001 }, "IAF");
  const silent = informationAvailability({ ...DEFAULT_SCENARIO, blueRadarMode: "SILENT" }, frame, "IAF");
  assert.equal(baseline.available, true);
  assert.equal(beyond.reason, "RADAR_OUT_OF_RANGE");
  assert.equal(silent.reason, "RADAR_SILENT");
});

test("compatible EW reduces admitted radar range and increases measurement uncertainty", () => {
  const closeFrame = { ...frame, range: 30_000 };
  const nominal = buildSidePictures(DEFAULT_SCENARIO, [{ ...closeFrame, t: 0 }, { ...closeFrame, t: 1 }]).filter((item) => item.perspective === "IAF").at(-1);
  const jammed = buildSidePictures({ ...DEFAULT_SCENARIO, redJammer: true }, [{ ...closeFrame, t: 0 }, { ...closeFrame, t: 1 }]).filter((item) => item.perspective === "IAF").at(-1);
  assert.equal(nominal?.trackState, "CONFIRMED");
  assert.equal(jammed?.trackState, "CONFIRMED");
  assert.ok((jammed?.uncertaintyMeters ?? 0) > (nominal?.uncertaintyMeters ?? Infinity));
  const blocked = buildSidePictures({ ...DEFAULT_SCENARIO, redJammer: true }, [{ ...frame, range: 60_000, t: 0 }]).filter((item) => item.perspective === "IAF").at(-1);
  assert.equal(blocked?.trackState, "NONE");
});

test("loss coasts then expires without substituting model truth", () => {
  const active = { ...frame, t: 0 };
  const silentAt2 = { ...frame, t: 2 };
  const silentAt6 = { ...frame, t: 6 };
  const pictures = buildSidePictures(
    { ...DEFAULT_SCENARIO, blueRadarMode: "SILENT" },
    [active, silentAt2, silentAt6],
  );
  const iaf = pictures.filter((item) => item.perspective === "IAF");
  assert.equal(iaf[0].trackState, "NONE");
  assert.equal(iaf[1].trackState, "NONE");
  assert.equal(iaf[2].visible, false);
});

test("an unavailable track has no synthetic position", () => {
  const pictures = buildSidePictures(
    { ...DEFAULT_SCENARIO, blueRadarMode: "SILENT" },
    [{ ...frame, t: 0 }],
  );
  const unavailable = pictures.find((picture) => picture.perspective === "IAF");
  assert.equal(unavailable?.visible, false);
  assert.equal("position" in (unavailable ?? {}), false);
});

test("off-board sources fail closed until an admitted sender observation exists", () => {
  for (const source of ["DATALINK", "AIRBORNE_EARLY_WARNING"]) {
    const availability = informationAvailability(
      { ...DEFAULT_SCENARIO, blueTrackSource: source, blueDatalink: true },
      frame,
      "IAF",
    );
    assert.equal(availability.reason, "DATALINK_SOURCE_UNAVAILABLE");
  }
});

test("pictures are deterministic and never expose a truth-position field", () => {
  const first = buildSidePictures(DEFAULT_SCENARIO, result.frames.slice(0, 100));
  const second = buildSidePictures(DEFAULT_SCENARIO, result.frames.slice(0, 100));
  assert.deepEqual(first, second);
  assert.ok(first.every((picture) => !("truthPosition" in picture)));
  assert.ok(first.every((picture) => Number.isFinite(picture.uncertaintyMeters)));
});
