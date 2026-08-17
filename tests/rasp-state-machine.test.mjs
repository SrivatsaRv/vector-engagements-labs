import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCENARIO,
  RASP_SOURCE_CONTRACTS,
  TACTICAL_DECISION_CONTRACTS,
  buildRaspTrack,
  evaluateRaspSourceAvailability,
  getFrameAt,
  simulate,
} from "../lib/simulation.ts";

const perspectives = ["IAF", "PAF"];
const sources = ["ONBOARD_RADAR", "DATALINK", "AIRBORNE_EARLY_WARNING", "VISUAL"];
const radarModes = ["ACTIVE", "SILENT"];
const linkStates = [true, false];
const jammerStates = [true, false];

function keysFor(perspective) {
  return perspective === "IAF"
    ? {
        source: "blueTrackSource",
        radar: "blueRadarMode",
        link: "blueDatalink",
        opposingJammer: "redJammer",
      }
    : {
        source: "redTrackSource",
        radar: "redRadarMode",
        link: "redDatalink",
        opposingJammer: "blueJammer",
      };
}

test("RASP regression matrix covers every source dependency for both perspectives", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const baseFrame = getFrameAt(result, 5);
  let rows = 0;
  for (const perspective of perspectives) {
    const keys = keysFor(perspective);
    for (const source of sources) {
      for (const radarMode of radarModes) {
        for (const datalink of linkStates) {
          for (const jammer of jammerStates) {
            for (const rangeM of [15000, 65000]) {
              const scenario = {
                ...DEFAULT_SCENARIO,
                [keys.source]: source,
                [keys.radar]: radarMode,
                [keys.link]: datalink,
                [keys.opposingJammer]: jammer,
                visibilityKm: 18,
              };
              const frame = { ...baseFrame, range: rangeM };
              const expected =
                source === "ONBOARD_RADAR"
                  ? radarMode === "ACTIVE" && rangeM <= 120000
                  : source === "DATALINK" || source === "AIRBORNE_EARLY_WARNING"
                    ? datalink
                    : rangeM <= 18000;
              const availability = evaluateRaspSourceAvailability(
                scenario,
                frame,
                perspective,
              );
              const track = buildRaspTrack(scenario, frame, perspective);
              assert.equal(availability.available, expected);
              assert.equal(track.visible, expected);
              assert.equal(track.status === "NO_TRACK", !expected);
              assert.equal(track.effectScope, "AIR_PICTURE_ONLY");
              assert.ok(track.stateExplanation.length > 20);
              rows += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(rows, 128);
});

test("RASP acquisition boundaries are inclusive and have explicit failure reasons", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const base = getFrameAt(result, 5);
  for (const perspective of perspectives) {
    const keys = keysFor(perspective);
    for (const [range, expected, reason] of [
      [119999, true, "AVAILABLE"],
      [120000, true, "AVAILABLE"],
      [120001, false, "RADAR_OUT_OF_RANGE"],
    ]) {
      const state = evaluateRaspSourceAvailability(
        {
          ...DEFAULT_SCENARIO,
          [keys.source]: "ONBOARD_RADAR",
          [keys.radar]: "ACTIVE",
        },
        { ...base, range },
        perspective,
      );
      assert.equal(state.available, expected);
      assert.equal(state.reason, reason);
    }
    for (const [range, expected, reason] of [
      [11999, true, "AVAILABLE"],
      [12000, true, "AVAILABLE"],
      [12001, false, "BEYOND_VISUAL_RANGE"],
    ]) {
      const state = evaluateRaspSourceAvailability(
        {
          ...DEFAULT_SCENARIO,
          [keys.source]: "VISUAL",
          visibilityKm: 12,
        },
        { ...base, range },
        perspective,
      );
      assert.equal(state.available, expected);
      assert.equal(state.reason, reason);
    }
  }
});

test("RASP-only controls cannot change model truth or engagement outcome", () => {
  const baseline = simulate(DEFAULT_SCENARIO);
  const variants = [
    { blueRadarMode: "SILENT" },
    { redRadarMode: "SILENT" },
    { blueDatalink: false },
    { redDatalink: false },
    { blueJammer: true },
    { redJammer: true },
    { blueTrackSource: "VISUAL" },
    { redTrackSource: "AIRBORNE_EARLY_WARNING" },
  ];
  for (const patch of variants) {
    const changed = simulate({ ...DEFAULT_SCENARIO, ...patch });
    assert.equal(changed.outcome, baseline.outcome);
    assert.equal(changed.closestApproach, baseline.closestApproach);
    assert.deepEqual(changed.frames, baseline.frames);
  }
});

test("each side's local source controls are isolated from the opposing RASP", () => {
  const result = simulate(DEFAULT_SCENARIO);
  const frame = getFrameAt(result, 20);
  const baselineIaf = buildRaspTrack(DEFAULT_SCENARIO, frame, "IAF");
  const baselinePaf = buildRaspTrack(DEFAULT_SCENARIO, frame, "PAF");
  const iafLocalChange = {
    ...DEFAULT_SCENARIO,
    blueRadarMode: "SILENT",
    blueDatalink: false,
  };
  const pafLocalChange = {
    ...DEFAULT_SCENARIO,
    redRadarMode: "SILENT",
    redDatalink: false,
  };
  assert.deepEqual(buildRaspTrack(iafLocalChange, frame, "PAF"), baselinePaf);
  assert.deepEqual(buildRaspTrack(pafLocalChange, frame, "IAF"), baselineIaf);
});

test("all offered Blue and Red decision pairs are finite, deterministic, and declared", () => {
  const blueDecisions = ["PRESS", "SUPPORT_WEAPON", "CRANK", "DEFEND", "DISENGAGE"];
  const redDecisions = ["PRESS", "CRANK", "DEFEND", "DISENGAGE"];
  let rows = 0;
  for (const blueDecision of blueDecisions) {
    for (const redDecision of redDecisions) {
      const scenario = { ...DEFAULT_SCENARIO, blueDecision, redDecision };
      const first = simulate(scenario);
      const second = simulate(scenario);
      assert.ok(TACTICAL_DECISION_CONTRACTS[blueDecision].blueEffect.length > 20);
      assert.ok(TACTICAL_DECISION_CONTRACTS[redDecision].redEffect.length > 20);
      assert.deepEqual(first.frames, second.frames);
      assert.ok(first.frames.every((frame) => Number.isFinite(frame.range)));
      rows += 1;
    }
  }
  assert.equal(rows, 20);
  assert.deepEqual(Object.keys(RASP_SOURCE_CONTRACTS).sort(), [...sources].sort());
});
